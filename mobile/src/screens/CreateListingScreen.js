import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '../components/Icon';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, CONDITION_LABELS, VISIBILITY_LABELS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import { haptics } from '../utils/haptics';
import { checkPremiumGate } from '../utils/premiumGate';

const CONDITIONS = ['like_new', 'good', 'fair', 'worn'];
const VISIBILITIES = ['close_friends', 'neighborhood', 'town'];

export default function CreateListingScreen({ navigation, route }) {
  const { user, refreshUser } = useAuth();
  const { showError } = useError();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Refresh user when returning from gate flow
  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [])
  );
  const [communityId, setCommunityId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    condition: 'good',
    categoryId: null,
    visibility: ['close_friends'], // Array for multi-select, default to friends
    isFree: true,
    pricePerDay: '',
    depositAmount: '',
    minDuration: '1',
    maxDuration: '14',
    photos: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showJoinCommunity, setShowJoinCommunity] = useState(false);
  const [showAddFriends, setShowAddFriends] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [hasFriends, setHasFriends] = useState(false);
  const [showPhotoActionSheet, setShowPhotoActionSheet] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [removePhotoIndex, setRemovePhotoIndex] = useState(null);
  const [isRelist, setIsRelist] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ title: false, photos: false, categoryId: false });

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: !showUpgradePrompt && !showJoinCommunity && !showAddFriends,
    });
  }, [showUpgradePrompt, showJoinCommunity, showAddFriends, navigation]);

  // Pre-populate from relist data
  useEffect(() => {
    const relistFrom = route?.params?.relistFrom;
    if (relistFrom) {
      setIsRelist(true);
      setFormData(prev => ({
        ...prev,
        title: relistFrom.title || '',
        description: relistFrom.description || '',
        condition: relistFrom.condition || 'good',
        categoryId: relistFrom.categoryId || null,
        visibility: Array.isArray(relistFrom.visibility) ? relistFrom.visibility : [relistFrom.visibility || 'close_friends'],
        isFree: relistFrom.isFree ?? true,
        pricePerDay: relistFrom.pricePerDay?.toString() || '',
        depositAmount: relistFrom.depositAmount?.toString() || '',
        minDuration: relistFrom.minDuration?.toString() || '1',
        maxDuration: relistFrom.maxDuration?.toString() || '14',
        photos: [], // Photos left empty — originals are S3 URLs
      }));
    }
  }, [route?.params?.relistFrom]);

  // Fetch user's community and friends on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch communities
        const communities = await api.getCommunities({ member: true });
        if (communities && communities.length > 0) {
          setCommunityId(communities[0].id);
        }

        // Fetch categories
        try {
          const cats = await api.getCategories();
          setCategories(cats || []);
        } catch (e) {
          console.log('Failed to fetch categories:', e);
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
    if (field in fieldErrors) {
      setFieldErrors(prev => ({ ...prev, [field]: false }));
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
      haptics.light();
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      haptics.error();
      showError({
        type: 'validation',
        title: 'Permission Needed',
        message: 'Camera permission is required to take photos',
      });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      const photoUri = result.assets[0].uri;
      const allPhotos = [...formData.photos, photoUri].slice(0, 10);
      updateField('photos', allPhotos);
      haptics.light();
    }
  };

  const handleRemovePhoto = (index) => {
    setRemovePhotoIndex(index);
    setShowPhotoActionSheet(true);
  };

  const confirmRemovePhoto = () => {
    if (removePhotoIndex !== null) {
      updateField('photos', formData.photos.filter((_, i) => i !== removePhotoIndex));
      haptics.medium();
    }
    setRemovePhotoIndex(null);
  };

  const handleSubmit = async (overrideData) => {
    const data = overrideData || formData;

    const errors = {
      title: !data.title.trim(),
      photos: data.photos.length === 0,
      categoryId: !data.categoryId,
    };

    if (errors.title || errors.photos || errors.categoryId) {
      setFieldErrors(errors);
      haptics.warning();
      showError({
        type: 'validation',
        title: 'Missing Fields',
        message: 'Please fill in the highlighted fields.',
      });
      return;
    }

    // Check if neighborhood visibility is selected but user isn't in a community
    const needsCommunity = data.visibility.includes('neighborhood');
    if (needsCommunity && !communityId) {
      Keyboard.dismiss();
      setShowJoinCommunity(true);
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload photos to S3 (skip if no photos - S3 not configured for testing)
      const photoUrls = data.photos.length > 0
        ? await api.uploadImages(data.photos, 'listings')
        : [];

      await api.createListing({
        title: data.title.trim(),
        description: data.description.trim() || undefined,
        condition: data.condition,
        categoryId: data.categoryId,
        visibility: data.visibility, // Send as array
        isFree: data.isFree,
        pricePerDay: data.isFree ? undefined : parseFloat(data.pricePerDay) || 0,
        depositAmount: parseFloat(data.depositAmount) || 0,
        minDuration: parseInt(data.minDuration) || 1,
        maxDuration: parseInt(data.maxDuration) || 14,
        photos: photoUrls.length > 0 ? photoUrls : undefined,
        communityId: communityId || undefined, // Always send communityId (required by DB)
      });

      if (!mountedRef.current) return;
      setIsSubmitting(false);
      setShowUpgradePrompt(false);
      setShowJoinCommunity(false);
      setShowAddFriends(false);
      Keyboard.dismiss();
      haptics.success();
      navigation.goBack();
    } catch (error) {
      if (!mountedRef.current) return;
      // Handle subscription and membership errors with themed UI
      const errorMsg = error.message?.toLowerCase() || '';
      const errorCode = error.code || '';

      if (errorCode === 'PLUS_REQUIRED' || errorMsg.includes('plus subscription') || errorMsg.includes('town visibility')) {
        Keyboard.dismiss();
        setShowUpgradePrompt(true);
      } else if (errorMsg.includes('neighborhood') || errorMsg.includes('community')) {
        Keyboard.dismiss();
        setShowJoinCommunity(true);
      } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        haptics.error();
        showError({
          type: 'network',
          message: 'Unable to upload your listing. Please check your connection and try again.',
        });
      } else {
        haptics.error();
        showError({
          message: error.message || 'Unable to create listing. Please try again.',
        });
      }
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
    <KeyboardAwareScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={Platform.OS === 'ios' ? 20 : 0}
    >
      {/* Photos */}
      <View style={styles.section}>
        <Text style={[styles.label, fieldErrors.photos && styles.fieldErrorLabel]}>Photos *</Text>
        <Text style={styles.hint}>Add up to 10 photos of your item</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          <View style={styles.photoRow}>
            {formData.photos.map((uri, index) => (
              <View key={index} style={styles.photoWrapper}>
                <Image source={{ uri }} style={styles.photo} />
                <HapticPressable
                  style={styles.removePhoto}
                  onPress={() => handleRemovePhoto(index)}
                  haptic="light"
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </HapticPressable>
              </View>
            ))}
            {formData.photos.length < 10 && (
              <View style={styles.addPhotoButtons}>
                <HapticPressable testID="CreateListing.button.addPhoto" accessibilityLabel="Add photo from gallery" accessibilityRole="button" style={[styles.addPhotoButton, fieldErrors.photos && styles.fieldError]} onPress={handlePickImage} haptic="light">
                  <Ionicons name="image" size={28} color={fieldErrors.photos ? COLORS.danger : COLORS.primary} />
                  <Text style={styles.addPhotoText}>Gallery</Text>
                </HapticPressable>
                <HapticPressable style={[styles.addPhotoButton, fieldErrors.photos && styles.fieldError]} onPress={handleTakePhoto} haptic="light">
                  <Ionicons name="camera" size={28} color={fieldErrors.photos ? COLORS.danger : COLORS.primary} />
                  <Text style={styles.addPhotoText}>Camera</Text>
                </HapticPressable>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Title */}
      <View style={styles.section}>
        <Text style={[styles.label, fieldErrors.title && styles.fieldErrorLabel]}>Title *</Text>
        <TextInput
          testID="CreateListing.input.title"
          accessibilityLabel="Listing title"
          style={[styles.input, fieldErrors.title && styles.fieldError]}
          value={formData.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="e.g., DeWalt Cordless Drill"
          placeholderTextColor={COLORS.textMuted}
          maxLength={255}
        />
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          testID="CreateListing.input.description"
          accessibilityLabel="Listing description"
          style={[styles.input, styles.textArea]}
          value={formData.description}
          onChangeText={(v) => updateField('description', v)}
          placeholder="Add details about your item..."
          placeholderTextColor={COLORS.textMuted}
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
            <HapticPressable
              key={condition}
              style={[styles.option, formData.condition === condition && styles.optionActive]}
              onPress={() => {
                updateField('condition', condition);
                haptics.selection();
              }}
              haptic={null}
            >
              <Text style={[styles.optionText, formData.condition === condition && styles.optionTextActive]}>
                {CONDITION_LABELS[condition]}
              </Text>
            </HapticPressable>
          ))}
        </View>
      </View>

      {/* Category */}
      {categories.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.label, fieldErrors.categoryId && styles.fieldErrorLabel]}>Category *</Text>
          <HapticPressable
            haptic="light"
            style={[styles.dropdownButton, fieldErrors.categoryId && styles.fieldError]}
            onPress={() => { Keyboard.dismiss(); setShowCategorySheet(true); }}
          >
            {formData.categoryId ? (
              <View style={styles.dropdownSelected}>
                <Ionicons
                  name={categories.find(c => c.id === formData.categoryId)?.icon || 'pricetag-outline'}
                  size={18}
                  color={COLORS.primary}
                />
                <Text style={styles.dropdownSelectedText}>
                  {categories.find(c => c.id === formData.categoryId)?.name}
                </Text>
              </View>
            ) : (
              <Text style={styles.dropdownPlaceholder}>Select a category</Text>
            )}
            <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
          </HapticPressable>
        </View>
      )}

      {/* Visibility */}
      <View style={styles.section}>
        <Text style={styles.label}>Who can see this? *</Text>
        <Text style={styles.hint}>Select all that apply</Text>
        <View style={styles.options}>
          {VISIBILITIES.map((visibility) => {
            const isSelected = formData.visibility.includes(visibility);
            return (
              <HapticPressable
                key={visibility}
                style={[styles.option, isSelected && styles.optionActive]}
                onPress={() => {
                  const current = formData.visibility;
                  if (isSelected) {
                    // Don't allow deselecting if it's the only one
                    if (current.length > 1) {
                      updateField('visibility', current.filter(v => v !== visibility));
                      haptics.selection();
                    } else {
                      haptics.warning();
                    }
                  } else {
                    // Gate check for town visibility — only requires Plus subscription
                    if (visibility === 'town' && user?.subscriptionTier !== 'plus') {
                      setShowUpgradePrompt(true);
                      return;
                    }
                    updateField('visibility', [...current, visibility]);
                    haptics.selection();
                  }
                }}
                haptic={null}
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
              </HapticPressable>
            );
          })}
        </View>
      </View>

      {/* Pricing */}
      <View style={styles.section}>
        <Text style={styles.label}>Pricing</Text>
        <Text style={styles.freeLabel}>Free to borrow</Text>
        <HapticPressable
          testID="CreateListing.toggle.rentalFee"
          accessibilityLabel="Charge a rental fee"
          accessibilityRole="switch"
          style={styles.toggle}
          onPress={() => {
            if (formData.isFree) {
              // Turning ON rental — check gate
              const gate = checkPremiumGate(user, 'rental_listing');
              if (!gate.passed) {
                setShowUpgradePrompt(true);
                return;
              }
            }
            updateField('isFree', !formData.isFree);
            haptics.light();
          }}
          haptic={null}
        >
          <Text style={styles.toggleText}>Charge a rental fee</Text>
          <View style={[styles.switch, !formData.isFree && styles.switchActive]}>
            <View style={[styles.switchKnob, !formData.isFree && styles.switchKnobActive]} />
          </View>
        </HapticPressable>

        {!formData.isFree && (
          <View style={styles.priceInput}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              testID="CreateListing.input.price"
              accessibilityLabel="Price per day"
              style={styles.priceField}
              value={formData.pricePerDay}
              onChangeText={(v) => updateField('pricePerDay', v)}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
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
              testID="CreateListing.input.deposit"
              accessibilityLabel="Deposit amount"
              style={styles.priceField}
              value={formData.depositAmount}
              onChangeText={(v) => updateField('depositAmount', v)}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
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

      {/* Submit */}
      <HapticPressable
        testID="CreateListing.button.submit"
        accessibilityLabel="List item"
        accessibilityRole="button"
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={() => handleSubmit()}
        disabled={isSubmitting}
        haptic="medium"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>List Item</Text>
        )}
      </HapticPressable>

    </KeyboardAwareScrollView>

    {/* Remove Photo Action Sheet */}
    <ActionSheet
      isVisible={showPhotoActionSheet}
      onClose={() => {
        setShowPhotoActionSheet(false);
        setRemovePhotoIndex(null);
      }}
      title="Remove Photo"
      message="Are you sure you want to remove this photo?"
      actions={[
        {
          label: 'Remove',
          destructive: true,
          onPress: confirmRemovePhoto,
        },
      ]}
      cancelLabel="Cancel"
    />

    {/* Category Picker */}
    <ActionSheet
      isVisible={showCategorySheet}
      onClose={() => setShowCategorySheet(false)}
      title="Select Category"
      actions={categories.map(cat => ({
        label: cat.name,
        icon: cat.icon || 'pricetag-outline',
        onPress: () => {
          updateField('categoryId', cat.id);
          haptics.selection();
        },
      }))}
    />

    {/* Neighborhood Join Overlay */}
    {showJoinCommunity && (
      <View style={styles.overlay}>
        <View style={styles.overlayCard}>
          <View style={styles.overlayCardInner}>
            <View style={styles.overlayIconContainer}>
              <Ionicons name="home" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.overlayTitle}>Join Your Neighborhood</Text>
            <Text style={styles.overlayText}>
              To share with "My Neighborhood", you need to join or create one first.
            </Text>
            <HapticPressable
              style={styles.overlayButton}
              onPress={() => {
                setShowJoinCommunity(false);
                navigation.navigate('JoinCommunity');
              }}
              haptic="medium"
            >
              <Text style={styles.overlayButtonText}>Find Neighborhood</Text>
            </HapticPressable>
            <HapticPressable
              style={styles.overlayDismiss}
              onPress={() => setShowJoinCommunity(false)}
              haptic="light"
            >
              <Text style={styles.overlayDismissText}>Cancel</Text>
            </HapticPressable>
          </View>
        </View>
      </View>
    )}

    {/* Add Friends Overlay */}
    {showAddFriends && (
      <View style={styles.overlay}>
        <View style={styles.overlayCard}>
          <View style={styles.overlayCardInner}>
            <View style={styles.overlayIconContainer}>
              <Ionicons name="people" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.overlayTitle}>Add Some Friends</Text>
            <Text style={styles.overlayText}>
              To share with "My Friends", you need to add friends first. Invite people you know or find friends nearby.
            </Text>
            <HapticPressable
              style={styles.overlayButton}
              onPress={() => {
                setShowAddFriends(false);
                navigation.navigate('Friends', { initialTab: 'contacts' });
              }}
              haptic="medium"
            >
              <Text style={styles.overlayButtonText}>Find Friends</Text>
            </HapticPressable>
            <HapticPressable
              style={styles.overlayDismiss}
              onPress={() => setShowAddFriends(false)}
              haptic="light"
            >
              <Text style={styles.overlayDismissText}>Cancel</Text>
            </HapticPressable>
          </View>
        </View>
      </View>
    )}

    {/* Subscription Upgrade Overlay */}
    {showUpgradePrompt && (
      <View style={styles.overlay}>
        <View style={styles.overlayCard}>
          <View style={styles.overlayCardInner}>
            <View style={[styles.overlayIconContainer, styles.upgradeIconContainer]}>
              <Ionicons name="star" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.overlayTitle}>Upgrade to Plus</Text>
            <Text style={styles.overlayText}>
              Get more from Borrowhood with Plus. Share with your whole town and earn money from your items.
            </Text>
            <View style={styles.upgradeFeatures}>
              <View style={styles.upgradeFeature}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
                <Text style={styles.upgradeFeatureText}>Everything in Free</Text>
              </View>
              <View style={styles.upgradeFeature}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
                <Text style={styles.upgradeFeatureText}>Borrow from anyone in town</Text>
              </View>
              <View style={styles.upgradeFeature}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
                <Text style={styles.upgradeFeatureText}>Charge rental fees</Text>
              </View>
            </View>
            <HapticPressable
              style={styles.overlayButton}
              onPress={() => {
                setShowUpgradePrompt(false);
                navigation.goBack();
                // Small delay so modal dismisses before navigating
                setTimeout(() => navigation.navigate('Subscription'), 300);
              }}
              haptic="medium"
            >
              <Text style={styles.overlayButtonText}>Get Plus - $1/mo</Text>
            </HapticPressable>
            <HapticPressable
              style={styles.overlayDismiss}
              onPress={() => {
                setShowUpgradePrompt(false);
                const freeVisibility = formData.visibility.filter(v => v !== 'town');
                setFormData(prev => ({
                  ...prev,
                  isFree: true,
                  pricePerDay: '',
                  visibility: freeVisibility.length > 0 ? freeVisibility : ['close_friends'],
                }));
              }}
              haptic="light"
            >
              <Text style={styles.overlayDismissText}>Continue with Free Settings</Text>
            </HapticPressable>
          </View>
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
    padding: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  label: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  hint: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  photoScroll: {
    marginHorizontal: -SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  photoRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  photoWrapper: {
    position: 'relative',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray[200],
  },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.md,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  addPhotoButton: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.gray[700],
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    ...TYPOGRAPHY.body,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    backgroundColor: COLORS.surface,
  },
  dropdownSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dropdownSelectedText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  dropdownPlaceholder: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
  },
  categoryPillActive: {
    backgroundColor: COLORS.primary,
  },
  categoryPillText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  categoryPillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  option: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
  },
  optionActive: {
    backgroundColor: COLORS.primary,
  },
  optionText: {
    ...TYPOGRAPHY.bodySmall,
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
    paddingVertical: SPACING.sm,
  },
  freeLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  toggleText: {
    ...TYPOGRAPHY.body,
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
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.sm,
  },
  currency: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textSecondary,
  },
  priceField: {
    flex: 1,
    ...TYPOGRAPHY.h3,
    paddingVertical: 14,
    marginLeft: SPACING.xs,
    color: COLORS.text,
  },
  priceSuffix: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  depositSection: {
    marginTop: SPACING.lg,
  },
  subLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  durationInput: {
    flex: 1,
  },
  durationLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  durationField: {
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    ...TYPOGRAPHY.body,
    textAlign: 'center',
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  durationSeparator: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xl,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xxl,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  // Overlay styles for community join prompt
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: SPACING.xl,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  overlayCardInner: {
    padding: 28,
  },
  overlayIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  overlayTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  overlayText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  overlayButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  overlayButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.background,
  },
  overlayDismiss: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: SPACING.sm,
  },
  overlayDismissText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
  },
  upgradeIconContainer: {
    backgroundColor: COLORS.secondary + '20',
  },
  upgradeFeatures: {
    gap: 10,
    marginBottom: SPACING.xl,
  },
  upgradeFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upgradeFeatureText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.text,
  },
  fieldError: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  fieldErrorLabel: {
    color: COLORS.danger,
  },
});
