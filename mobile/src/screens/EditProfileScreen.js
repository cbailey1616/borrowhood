import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function EditProfileScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const { showError } = useError();
  const isVerified = user?.isVerified;
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    displayName: user?.displayName || '',
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
          message: 'BorrowHood needs location access to find your neighborhood. You can enable it in your device Settings.',
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
        message: 'Couldn\'t get your location right now. You can try again or type in your city and state instead.',
        type: 'network',
      });
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!formData.firstName || !formData.lastName) {
      showError({
        message: 'Your name helps neighbors know who they\'re borrowing from. Please fill in your first and last name.',
        type: 'validation',
      });
      return;
    }

    setIsLoading(true);
    try {
      let profileData = { ...formData };

      // Don't send verified fields — server will reject them
      if (isVerified) {
        delete profileData.firstName;
        delete profileData.lastName;
        delete profileData.city;
        delete profileData.state;
        delete profileData.latitude;
        delete profileData.longitude;
      }

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
      haptics.success();
      navigation.goBack();
    } catch (error) {
      haptics.error();
      showError({
        message: error.message || 'Couldn\'t save your profile changes. Please check your connection and try again.',
        type: 'network',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={Platform.OS === 'ios' ? 20 : 0}
      >
        <View style={styles.avatarSection}>
          <Image
            source={{ uri: selectedPhoto || user?.profilePhotoUrl || 'https://via.placeholder.com/100' }}
            style={styles.avatar}
          />
          <HapticPressable haptic="light" style={styles.changePhotoButton} onPress={handleChangePhoto}>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </HapticPressable>
          {selectedPhoto && (
            <Text style={styles.photoHint}>New photo will be saved when you save changes</Text>
          )}
        </View>

        <View style={styles.form}>
          {isVerified && (
            <View style={styles.verifiedBanner}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.verifiedBannerTitle}>Identity Verified</Text>
                <Text style={styles.verifiedBannerText}>
                  Name and address are locked to match your verified ID.
                </Text>
              </View>
              <HapticPressable
                haptic="light"
                onPress={() => {
                  showError({
                    type: 'verification',
                    title: 'Quick Re-verification Needed',
                    message: 'Since your identity is verified, changing your name or address requires a quick re-verification. It only takes a minute.',
                    primaryAction: 'Re-verify',
                    secondaryAction: 'Cancel',
                    onPrimaryPress: () => navigation.navigate('IdentityVerification'),
                  });
                }}
              >
                <Text style={styles.verifiedChangeLink}>Change</Text>
              </HapticPressable>
            </View>
          )}

          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.label}>First name</Text>
              <TextInput
                style={[styles.input, isVerified && styles.inputLocked]}
                value={formData.firstName}
                onChangeText={(v) => updateField('firstName', v)}
                placeholder="John"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
                editable={!isVerified}
              />
            </View>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.label}>Last name</Text>
              <TextInput
                style={[styles.input, isVerified && styles.inputLocked]}
                value={formData.lastName}
                onChangeText={(v) => updateField('lastName', v)}
                placeholder="Doe"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
                editable={!isVerified}
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Display name</Text>
            <TextInput
              style={styles.input}
              value={formData.displayName}
              onChangeText={(v) => updateField('displayName', v)}
              placeholder={formData.firstName || 'How neighbors see you'}
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
            />
            <Text style={styles.fieldHint}>
              This is how your name appears to others (e.g., "Danny" instead of "Daniel")
            </Text>
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
              autoCapitalize="sentences"
              autoCorrect={true}
              spellCheck={true}
            />
          </View>

          {/* Location Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Location</Text>
            {!isVerified && (
              <HapticPressable
                haptic="light"
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
              </HapticPressable>
            )}
          </View>

          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 2 }]}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={[styles.input, isVerified && styles.inputLocked]}
                value={formData.city}
                onChangeText={(v) => updateField('city', v)}
                placeholder="Upton"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
                editable={!isVerified}
              />
            </View>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={[styles.input, isVerified && styles.inputLocked]}
                value={formData.state}
                onChangeText={(v) => updateField('state', v)}
                placeholder="MA"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="characters"
                maxLength={20}
                editable={!isVerified}
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

      <View style={styles.footer}>
        <HapticPressable
          haptic="medium"
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
        </HapticPressable>
      </View>
      </KeyboardAwareScrollView>
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
    paddingVertical: SPACING.xl,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: COLORS.gray[700],
  },
  changePhotoButton: {
    marginTop: SPACING.md,
  },
  changePhotoText: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
  },
  photoHint: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  uploadingText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.background,
  },
  form: {
    padding: SPACING.lg,
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  inputContainer: {
    gap: SPACING.sm,
  },
  label: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderBrown,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: COLORS.card,
    color: COLORS.text,
  },
  inputLocked: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.borderLight,
    color: COLORS.textMuted,
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderGreen,
  },
  verifiedBannerTitle: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
  },
  verifiedBannerText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  verifiedChangeLink: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  textArea: {
    height: 100,
    paddingTop: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary + '15',
  },
  locationButtonText: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
  },
  fieldHint: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  locationNote: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    marginTop: -SPACING.sm,
  },
  infoBox: {
    padding: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  infoTitle: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  infoValue: {
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  infoNote: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.background,
  },
});
