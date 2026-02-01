import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, CONDITION_LABELS, VISIBILITY_LABELS } from '../utils/config';

const CONDITIONS = ['like_new', 'good', 'fair', 'worn'];
const VISIBILITIES = ['close_friends', 'neighborhood', 'town'];

export default function CreateListingScreen({ navigation }) {
  const { user } = useAuth();
  const [communityId, setCommunityId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    condition: 'good',
    visibility: ['close_friends'], // Array for multi-select, default to friends
    isFree: true,
    pricePerDay: '',
    depositAmount: '',
    minDuration: '1',
    maxDuration: '14',
    photos: [],
    // RTO fields
    rtoAvailable: false,
    rtoPurchasePrice: '',
    rtoMinPayments: '6',
    rtoMaxPayments: '24',
    rtoRentalCreditPercent: '50',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuggested, setAiSuggested] = useState(false);
  const [showJoinCommunity, setShowJoinCommunity] = useState(false);
  const [showAddFriends, setShowAddFriends] = useState(false);
  const [hasFriends, setHasFriends] = useState(false);

  // Fetch user's community and friends on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch communities
        const communities = await api.getCommunities({ member: true });
        if (communities && communities.length > 0) {
          setCommunityId(communities[0].id);
        }

        // Fetch friends count
        const friends = await api.getFriends();
        setHasFriends(friends && friends.length > 0);
      } catch (err) {
        console.log('Failed to fetch data:', err);
      }
    };
    fetchData();
  }, []);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const analyzeImage = async (imageUri) => {
    setIsAnalyzing(true);
    try {
      // First upload the image to get a URL
      const imageUrl = await api.uploadImage(imageUri, 'listings');

      // Then analyze it with AI
      const result = await api.analyzeListingImage(imageUrl);

      if (result && !result.error) {
        setFormData(prev => ({
          ...prev,
          title: result.title || prev.title,
          description: result.description || prev.description,
          condition: result.condition || prev.condition,
        }));
        setAiSuggested(true);
      }
    } catch (error) {
      console.log('AI analysis failed:', error.message);
      // Silently fail - user can still fill in details manually
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10 - formData.photos.length,
    });

    if (!result.canceled) {
      const newPhotos = result.assets.map(a => a.uri);
      const allPhotos = [...formData.photos, ...newPhotos].slice(0, 10);
      updateField('photos', allPhotos);

      // Analyze the first photo if this is the first photo added and no title yet
      if (formData.photos.length === 0 && newPhotos.length > 0 && !formData.title) {
        analyzeImage(newPhotos[0]);
      }
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      const photoUri = result.assets[0].uri;
      const allPhotos = [...formData.photos, photoUri].slice(0, 10);
      updateField('photos', allPhotos);

      // Analyze the photo if this is the first photo and no title yet
      if (formData.photos.length === 0 && !formData.title) {
        analyzeImage(photoUri);
      }
    }
  };

  const handleRemovePhoto = (index) => {
    updateField('photos', formData.photos.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    // Photos optional for testing (S3 not configured)
    // if (formData.photos.length === 0) {
    //   Alert.alert('Error', 'Please add at least one photo');
    //   return;
    // }

    // Temporarily disabled for testing
    // // Check if friends visibility is selected but user has no friends
    // const needsFriends = formData.visibility.includes('close_friends');
    // if (needsFriends && !hasFriends) {
    //   setShowAddFriends(true);
    //   return;
    // }

    // // Check if neighborhood visibility is selected but user isn't in a community
    // const needsCommunity = formData.visibility.includes('neighborhood');
    // if (needsCommunity && !communityId) {
    //   setShowJoinCommunity(true);
    //   return;
    // }
    const needsCommunity = false;

    setIsSubmitting(true);
    try {
      // Upload photos to S3 (skip if no photos - S3 not configured for testing)
      const photoUrls = formData.photos.length > 0
        ? await api.uploadImages(formData.photos, 'listings')
        : [];

      await api.createListing({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        condition: formData.condition,
        visibility: formData.visibility, // Send as array
        isFree: formData.isFree,
        pricePerDay: formData.isFree ? undefined : parseFloat(formData.pricePerDay) || 0,
        depositAmount: parseFloat(formData.depositAmount) || 0,
        minDuration: parseInt(formData.minDuration) || 1,
        maxDuration: parseInt(formData.maxDuration) || 14,
        photos: photoUrls.length > 0 ? photoUrls : undefined,
        communityId: needsCommunity ? communityId : undefined,
        // RTO fields
        rtoAvailable: formData.rtoAvailable,
        rtoPurchasePrice: formData.rtoAvailable ? parseFloat(formData.rtoPurchasePrice) || 0 : undefined,
        rtoMinPayments: formData.rtoAvailable ? parseInt(formData.rtoMinPayments) || 6 : undefined,
        rtoMaxPayments: formData.rtoAvailable ? parseInt(formData.rtoMaxPayments) || 24 : undefined,
        rtoRentalCreditPercent: formData.rtoAvailable ? parseFloat(formData.rtoRentalCreditPercent) || 50 : undefined,
      });

      Alert.alert('Success', 'Your item has been listed!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      // Handle neighborhood membership error with themed UI
      const errorMsg = error.message?.toLowerCase() || '';
      if (errorMsg.includes('neighborhood') || errorMsg.includes('community')) {
        setShowJoinCommunity(true);
      } else {
        Alert.alert('Error', error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show prompt to join neighborhood if user isn't in one AND they selected neighborhood visibility
  // But for close_friends and town, they don't need to be in a neighborhood
  // This prompt only shows if communityId is null - which we now allow for non-neighborhood visibility

  return (
    <View style={styles.container}>
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
      {/* Photos */}
      <View style={styles.section}>
        <Text style={styles.label}>Photos</Text>
        <Text style={styles.hint}>Add up to 10 photos of your item</Text>
        {isAnalyzing && (
          <View style={styles.analyzingBanner}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.analyzingText}>Analyzing image with AI...</Text>
          </View>
        )}
        {aiSuggested && !isAnalyzing && (
          <View style={styles.aiSuggestedBanner}>
            <Ionicons name="sparkles" size={16} color={COLORS.secondary} />
            <Text style={styles.aiSuggestedText}>AI filled in details - feel free to edit</Text>
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          <View style={styles.photoRow}>
            {formData.photos.map((uri, index) => (
              <View key={index} style={styles.photoWrapper}>
                <Image source={{ uri }} style={styles.photo} />
                <TouchableOpacity
                  style={styles.removePhoto}
                  onPress={() => handleRemovePhoto(index)}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {formData.photos.length < 10 && (
              <View style={styles.addPhotoButtons}>
                <TouchableOpacity style={styles.addPhotoButton} onPress={handlePickImage}>
                  <Ionicons name="image" size={28} color={COLORS.primary} />
                  <Text style={styles.addPhotoText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addPhotoButton} onPress={handleTakePhoto}>
                  <Ionicons name="camera" size={28} color={COLORS.primary} />
                  <Text style={styles.addPhotoText}>Camera</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Title */}
      <View style={styles.section}>
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          value={formData.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="e.g., DeWalt Cordless Drill"
          maxLength={255}
        />
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.description}
          onChangeText={(v) => updateField('description', v)}
          placeholder="Add details about your item..."
          multiline
          numberOfLines={4}
          maxLength={2000}
        />
      </View>

      {/* Condition */}
      <View style={styles.section}>
        <Text style={styles.label}>Condition *</Text>
        <View style={styles.options}>
          {CONDITIONS.map((condition) => (
            <TouchableOpacity
              key={condition}
              style={[styles.option, formData.condition === condition && styles.optionActive]}
              onPress={() => updateField('condition', condition)}
            >
              <Text style={[styles.optionText, formData.condition === condition && styles.optionTextActive]}>
                {CONDITION_LABELS[condition]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Visibility */}
      <View style={styles.section}>
        <Text style={styles.label}>Who can see this? *</Text>
        <Text style={styles.hint}>Select all that apply</Text>
        <View style={styles.options}>
          {VISIBILITIES.map((visibility) => {
            const isSelected = formData.visibility.includes(visibility);
            return (
              <TouchableOpacity
                key={visibility}
                style={[styles.option, isSelected && styles.optionActive]}
                onPress={() => {
                  const current = formData.visibility;
                  if (isSelected) {
                    // Don't allow deselecting if it's the only one
                    if (current.length > 1) {
                      updateField('visibility', current.filter(v => v !== visibility));
                    }
                  } else {
                    updateField('visibility', [...current, visibility]);
                  }
                }}
              >
                <Ionicons
                  name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={isSelected ? "#fff" : COLORS.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                  {VISIBILITY_LABELS[visibility]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Pricing */}
      <View style={styles.section}>
        <Text style={styles.label}>Pricing</Text>
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => updateField('isFree', !formData.isFree)}
        >
          <Text style={styles.toggleText}>Free to borrow</Text>
          <View style={[styles.switch, formData.isFree && styles.switchActive]}>
            <View style={[styles.switchKnob, formData.isFree && styles.switchKnobActive]} />
          </View>
        </TouchableOpacity>

        {!formData.isFree && (
          <View style={styles.priceInput}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              style={styles.priceField}
              value={formData.pricePerDay}
              onChangeText={(v) => updateField('pricePerDay', v)}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <Text style={styles.priceSuffix}>/day</Text>
          </View>
        )}

        <View style={styles.depositSection}>
          <Text style={styles.subLabel}>Refundable deposit (optional)</Text>
          <View style={styles.priceInput}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              style={styles.priceField}
              value={formData.depositAmount}
              onChangeText={(v) => updateField('depositAmount', v)}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      </View>

      {/* Duration */}
      <View style={styles.section}>
        <Text style={styles.label}>Rental duration (days)</Text>
        <View style={styles.durationRow}>
          <View style={styles.durationInput}>
            <Text style={styles.durationLabel}>Min</Text>
            <TextInput
              style={styles.durationField}
              value={formData.minDuration}
              onChangeText={(v) => updateField('minDuration', v)}
              keyboardType="number-pad"
            />
          </View>
          <Text style={styles.durationSeparator}>to</Text>
          <View style={styles.durationInput}>
            <Text style={styles.durationLabel}>Max</Text>
            <TextInput
              style={styles.durationField}
              value={formData.maxDuration}
              onChangeText={(v) => updateField('maxDuration', v)}
              keyboardType="number-pad"
            />
          </View>
        </View>
      </View>

      {/* Rent-to-Own */}
      <View style={styles.section}>
        <Text style={styles.label}>Rent-to-Own</Text>
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => updateField('rtoAvailable', !formData.rtoAvailable)}
        >
          <View>
            <Text style={styles.toggleText}>Allow rent-to-own</Text>
            <Text style={styles.toggleHint}>Let borrowers purchase over time</Text>
          </View>
          <View style={[styles.switch, formData.rtoAvailable && styles.switchActive]}>
            <View style={[styles.switchKnob, formData.rtoAvailable && styles.switchKnobActive]} />
          </View>
        </TouchableOpacity>

        {formData.rtoAvailable && (
          <View style={styles.rtoFields}>
            <View style={styles.rtoRow}>
              <Text style={styles.subLabel}>Purchase Price</Text>
              <View style={styles.priceInput}>
                <Text style={styles.currency}>$</Text>
                <TextInput
                  style={styles.priceField}
                  value={formData.rtoPurchasePrice}
                  onChangeText={(v) => updateField('rtoPurchasePrice', v)}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.rtoRow}>
              <Text style={styles.subLabel}>Equity Credit Per Payment</Text>
              <View style={styles.percentInput}>
                <TextInput
                  style={styles.percentField}
                  value={formData.rtoRentalCreditPercent}
                  onChangeText={(v) => updateField('rtoRentalCreditPercent', v)}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={styles.percentSymbol}>%</Text>
              </View>
            </View>

            <View style={styles.rtoPaymentRange}>
              <Text style={styles.subLabel}>Payment Range</Text>
              <View style={styles.durationRow}>
                <View style={styles.durationInput}>
                  <Text style={styles.durationLabel}>Min</Text>
                  <TextInput
                    style={styles.durationField}
                    value={formData.rtoMinPayments}
                    onChangeText={(v) => updateField('rtoMinPayments', v)}
                    keyboardType="number-pad"
                  />
                </View>
                <Text style={styles.durationSeparator}>to</Text>
                <View style={styles.durationInput}>
                  <Text style={styles.durationLabel}>Max</Text>
                  <TextInput
                    style={styles.durationField}
                    value={formData.rtoMaxPayments}
                    onChangeText={(v) => updateField('rtoMaxPayments', v)}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>List Item</Text>
        )}
      </TouchableOpacity>

    </ScrollView>

    {/* Neighborhood Join Overlay */}
    {showJoinCommunity && (
      <View style={styles.overlay}>
        <View style={styles.overlayCard}>
          <View style={styles.overlayIconContainer}>
            <Ionicons name="home" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.overlayTitle}>Join Your Neighborhood</Text>
          <Text style={styles.overlayText}>
            To share with "My Neighborhood", you need to join or create one first.
          </Text>
          <TouchableOpacity
            style={styles.overlayButton}
            onPress={() => {
              setShowJoinCommunity(false);
              navigation.navigate('JoinCommunity');
            }}
          >
            <Text style={styles.overlayButtonText}>Find Neighborhood</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.overlayDismiss}
            onPress={() => setShowJoinCommunity(false)}
          >
            <Text style={styles.overlayDismissText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    )}

    {/* Add Friends Overlay */}
    {showAddFriends && (
      <View style={styles.overlay}>
        <View style={styles.overlayCard}>
          <View style={styles.overlayIconContainer}>
            <Ionicons name="people" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.overlayTitle}>Add Some Friends</Text>
          <Text style={styles.overlayText}>
            To share with "My Friends", you need to add friends first. Invite people you know or find friends nearby.
          </Text>
          <TouchableOpacity
            style={styles.overlayButton}
            onPress={() => {
              setShowAddFriends(false);
              navigation.navigate('Friends');
            }}
          >
            <Text style={styles.overlayButtonText}>Find Friends</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.overlayDismiss}
            onPress={() => setShowAddFriends(false)}
          >
            <Text style={styles.overlayDismissText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  promptContent: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  promptCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  promptIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  promptTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  promptText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  promptBenefits: {
    gap: 12,
    marginBottom: 24,
  },
  promptBenefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  promptBenefitText: {
    fontSize: 14,
    color: COLORS.text,
  },
  promptButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  promptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  promptSecondaryButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 12,
  },
  promptSecondaryText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  analyzingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary + '15',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  analyzingText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  aiSuggestedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.secondary + '15',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  aiSuggestedText: {
    fontSize: 14,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  photoScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoWrapper: {
    position: 'relative',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: COLORS.gray[200],
  },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.danger,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  addPhotoButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.gray[700],
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.gray[800],
  },
  optionActive: {
    backgroundColor: COLORS.primary,
  },
  optionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleText: {
    fontSize: 16,
    color: COLORS.text,
  },
  switch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.gray[700],
    padding: 2,
  },
  switchActive: {
    backgroundColor: COLORS.secondary,
  },
  switchKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
  },
  switchKnobActive: {
    marginLeft: 20,
  },
  priceInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    marginTop: 8,
  },
  currency: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  priceField: {
    flex: 1,
    fontSize: 18,
    paddingVertical: 14,
    marginLeft: 4,
    color: COLORS.text,
  },
  priceSuffix: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  depositSection: {
    marginTop: 16,
  },
  subLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  durationInput: {
    flex: 1,
  },
  durationLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  durationField: {
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  durationSeparator: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 20,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  rtoFields: {
    marginTop: 16,
    gap: 16,
  },
  rtoRow: {
    gap: 8,
  },
  rtoPaymentRange: {
    gap: 8,
  },
  percentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    width: 100,
  },
  percentField: {
    flex: 1,
    fontSize: 18,
    paddingVertical: 14,
    color: COLORS.text,
    textAlign: 'center',
  },
  percentSymbol: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  // Overlay styles for community join prompt
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
  },
  overlayIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  overlayTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  overlayText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  overlayButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  overlayButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  overlayDismiss: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  overlayDismissText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
});
