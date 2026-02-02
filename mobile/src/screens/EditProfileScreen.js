import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { COLORS } from '../utils/config';

export default function EditProfileScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const { showError } = useError();
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    city: user?.city || '',
    state: user?.state || '',
    latitude: user?.latitude || null,
    longitude: user?.longitude || null,
  });

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleChangePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedPhoto(result.assets[0].uri);
    }
  };

  const handleGetLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showError({
          message: 'Location permission is required. Please enable it in your device Settings to use this feature.',
          type: 'validation',
        });
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      // Reverse geocode to get city/state
      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });

      if (address) {
        setFormData(prev => ({
          ...prev,
          city: address.city || address.subregion || '',
          state: address.region || '',
          latitude,
          longitude,
        }));
      }
    } catch (error) {
      console.error('Location error:', error);
      showError({
        message: 'Could not get your location. Please check your connection or enter it manually.',
        type: 'network',
      });
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!formData.firstName || !formData.lastName) {
      showError({
        message: 'Please enter your first and last name to continue.',
        type: 'validation',
      });
      return;
    }

    setIsLoading(true);
    try {
      let profileData = { ...formData };

      // If city/state are set but lat/lng are missing, geocode the address
      if (profileData.city && profileData.state && (!profileData.latitude || !profileData.longitude)) {
        try {
          const geocoded = await Location.geocodeAsync(`${profileData.city}, ${profileData.state}`);
          if (geocoded && geocoded.length > 0) {
            profileData.latitude = geocoded[0].latitude;
            profileData.longitude = geocoded[0].longitude;
          }
        } catch (geoError) {
          console.log('Geocoding failed:', geoError);
          // Continue without coordinates - user can use "Use Current" later
        }
      }

      // Upload new photo if selected
      if (selectedPhoto) {
        setIsUploadingPhoto(true);
        try {
          const photoUrl = await api.uploadImage(selectedPhoto, 'profiles');
          profileData.profilePhotoUrl = photoUrl;
        } finally {
          setIsUploadingPhoto(false);
        }
      }

      await api.updateProfile(profileData);
      if (refreshUser) await refreshUser();
      Alert.alert('Success', 'Profile updated successfully');
      navigation.goBack();
    } catch (error) {
      showError({
        message: error.message || 'Unable to update your profile. Please try again.',
        type: 'network',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <Image
            source={{ uri: selectedPhoto || user?.profilePhotoUrl || 'https://via.placeholder.com/100' }}
            style={styles.avatar}
          />
          <TouchableOpacity style={styles.changePhotoButton} onPress={handleChangePhoto}>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
          {selectedPhoto && (
            <Text style={styles.photoHint}>New photo will be saved when you save changes</Text>
          )}
        </View>

        <View style={styles.form}>
          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.label}>First name</Text>
              <TextInput
                style={styles.input}
                value={formData.firstName}
                onChangeText={(v) => updateField('firstName', v)}
                placeholder="John"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.label}>Last name</Text>
              <TextInput
                style={styles.input}
                value={formData.lastName}
                onChangeText={(v) => updateField('lastName', v)}
                placeholder="Doe"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={formData.phone}
              onChangeText={(v) => updateField('phone', v)}
              placeholder="(555) 123-4567"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.bio}
              onChangeText={(v) => updateField('bio', v)}
              placeholder="Tell neighbors a bit about yourself..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Location Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Location</Text>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={handleGetLocation}
              disabled={isGettingLocation}
            >
              {isGettingLocation ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="location" size={16} color={COLORS.primary} />
                  <Text style={styles.locationButtonText}>Use Current</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 2 }]}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={formData.city}
                onChangeText={(v) => updateField('city', v)}
                placeholder="Upton"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                value={formData.state}
                onChangeText={(v) => updateField('state', v)}
                placeholder="MA"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="characters"
                maxLength={20}
              />
            </View>
          </View>

          <Text style={styles.locationNote}>
            Your location helps show nearby items and connect you with neighbors.
          </Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Email</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
            <Text style={styles.infoNote}>Email cannot be changed</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.background} />
              {isUploadingPhoto && <Text style={styles.uploadingText}>Uploading photo...</Text>}
            </View>
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.gray[700],
  },
  changePhotoButton: {
    marginTop: 12,
  },
  changePhotoText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  photoHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadingText: {
    color: COLORS.background,
    fontSize: 14,
  },
  form: {
    padding: 16,
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray[700],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  textArea: {
    height: 100,
    paddingTop: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '15',
  },
  locationButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  locationNote: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: -8,
  },
  infoBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 4,
  },
  infoNote: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: COLORS.background,
    fontSize: 17,
    fontWeight: '600',
  },
});
