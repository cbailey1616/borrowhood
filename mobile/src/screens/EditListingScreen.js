import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '../components/Icon';
import * as ImagePicker from 'expo-image-picker';
import HapticPressable from '../components/HapticPressable';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, CONDITION_LABELS, VISIBILITY_LABELS } from '../utils/config';

const CONDITIONS = ['like_new', 'good', 'fair', 'worn'];
const VISIBILITIES = ['close_friends', 'neighborhood', 'town'];

export default function EditListingScreen({ navigation, route }) {
  const { listing } = route.params;
  const { showError, showToast } = useError();

  const [categories, setCategories] = useState([]);

  const [formData, setFormData] = useState({
    title: listing.title || '',
    description: listing.description || '',
    condition: listing.condition || 'good',
    categoryId: listing.categoryId || null,
    visibility: Array.isArray(listing.visibility) ? listing.visibility : [listing.visibility || 'close_friends'],
    isFree: listing.isFree ?? true,
    pricePerDay: listing.pricePerDay?.toString() || '',
    depositAmount: listing.depositAmount?.toString() || '',
    minDuration: listing.minDuration?.toString() || '1',
    maxDuration: listing.maxDuration?.toString() || '14',
    photos: listing.photos || [],
    // RTO fields
    rtoAvailable: listing.rtoAvailable || false,
    rtoPurchasePrice: listing.rtoPurchasePrice?.toString() || '',
    rtoMinPayments: listing.rtoMinPayments?.toString() || '6',
    rtoMaxPayments: listing.rtoMaxPayments?.toString() || '24',
    rtoRentalCreditPercent: listing.rtoRentalCreditPercent?.toString() || '50',
  });
  const [newPhotos, setNewPhotos] = useState([]); // Local URIs of newly added photos
  const [removedPhotos, setRemovedPhotos] = useState([]); // URLs of removed photos
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const cats = await api.getCategories();
        setCategories(cats || []);
      } catch (e) {
        console.log('Failed to fetch categories:', e);
      }
    };
    fetchCategories();
  }, []);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePickImage = async () => {
    const totalPhotos = formData.photos.length - removedPhotos.length + newPhotos.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10 - totalPhotos,
    });

    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      setNewPhotos(prev => [...prev, ...uris].slice(0, 10 - (formData.photos.length - removedPhotos.length)));
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showError({ type: 'permission', title: 'Camera Access Needed', message: 'BorrowHood needs camera access to take photos. You can enable it in your device Settings.' });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      const totalPhotos = formData.photos.length - removedPhotos.length + newPhotos.length;
      if (totalPhotos < 10) {
        setNewPhotos(prev => [...prev, result.assets[0].uri]);
      }
    }
  };

  const handleRemoveExistingPhoto = (url) => {
    setRemovedPhotos(prev => [...prev, url]);
  };

  const handleRemoveNewPhoto = (index) => {
    setNewPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      showError({
        type: 'validation',
        title: 'Missing Title',
        message: 'Give your item a title so neighbors know what you\'re sharing.',
      });
      return;
    }

    const totalPhotos = formData.photos.length - removedPhotos.length + newPhotos.length;
    if (totalPhotos === 0) {
      showError({
        type: 'validation',
        title: 'Add a Photo',
        message: 'Items with photos get 5x more interest. Add at least one photo of your item.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload any new photos to S3
      let uploadedUrls = [];
      if (newPhotos.length > 0) {
        uploadedUrls = await api.uploadImages(newPhotos, 'listings');
      }

      // Combine existing photos (minus removed) with new uploads
      const existingPhotos = formData.photos.filter(url => !removedPhotos.includes(url));
      const allPhotos = [...existingPhotos, ...uploadedUrls];

      await api.updateListing(listing.id, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        condition: formData.condition,
        categoryId: formData.categoryId || undefined,
        visibility: formData.visibility,
        isFree: formData.isFree,
        pricePerDay: formData.isFree ? undefined : parseFloat(formData.pricePerDay) || 0,
        depositAmount: parseFloat(formData.depositAmount) || 0,
        minDuration: parseInt(formData.minDuration) || 1,
        maxDuration: parseInt(formData.maxDuration) || 14,
        photos: allPhotos,
        // RTO fields
        rtoAvailable: formData.rtoAvailable,
        rtoPurchasePrice: formData.rtoAvailable ? parseFloat(formData.rtoPurchasePrice) || 0 : undefined,
        rtoMinPayments: formData.rtoAvailable ? parseInt(formData.rtoMinPayments) || 6 : undefined,
        rtoMaxPayments: formData.rtoAvailable ? parseInt(formData.rtoMaxPayments) || 24 : undefined,
        rtoRentalCreditPercent: formData.rtoAvailable ? parseFloat(formData.rtoRentalCreditPercent) || 50 : undefined,
      });

      haptics.success();
      navigation.goBack();
      setTimeout(() => showToast('Your listing has been updated!', 'success'), 500);
    } catch (error) {
      haptics.error();
      const errorMsg = error.message?.toLowerCase() || '';
      if (error.code === 'PLUS_REQUIRED' || errorMsg.includes('verification required')) {
        showError({
          type: 'subscription',
          title: 'Verification Required',
          message: 'Verify your identity to list to the whole town and charge rental fees — just $1.99 one-time.',
          primaryAction: 'Verify Now',
          onPrimaryAction: () => navigation.navigate('Subscription'),
        });
      } else {
        showError({
          message: error.message || 'Couldn\'t save your changes right now. Please check your connection and try again.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const existingPhotosToShow = formData.photos.filter(url => !removedPhotos.includes(url));
  const totalPhotos = existingPhotosToShow.length + newPhotos.length;

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      enableOnAndroid={true}
      extraScrollHeight={Platform.OS === 'ios' ? 20 : 0}
      keyboardShouldPersistTaps="handled"
    >
      {/* Photos */}
      <View style={styles.section}>
        <Text style={styles.label}>Photos *</Text>
        <Text style={styles.hint}>Add up to 10 photos of your item</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          <View style={styles.photoRow}>
            {/* Existing photos */}
            {existingPhotosToShow.map((url, index) => (
              <View key={`existing-${index}`} style={styles.photoWrapper}>
                <Image source={{ uri: url }} style={styles.photo} />
                <HapticPressable
                  haptic="light"
                  style={styles.removePhoto}
                  onPress={() => handleRemoveExistingPhoto(url)}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </HapticPressable>
              </View>
            ))}
            {/* New photos */}
            {newPhotos.map((uri, index) => (
              <View key={`new-${index}`} style={styles.photoWrapper}>
                <Image source={{ uri }} style={styles.photo} />
                <HapticPressable
                  haptic="light"
                  style={styles.removePhoto}
                  onPress={() => handleRemoveNewPhoto(index)}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </HapticPressable>
              </View>
            ))}
            {totalPhotos < 10 && (
              <View style={styles.addPhotoButtons}>
                <HapticPressable haptic="light" style={styles.addPhotoButton} onPress={handlePickImage}>
                  <Ionicons name="images-outline" size={24} color={COLORS.gray[400]} />
                  <Text style={styles.addPhotoText}>Gallery</Text>
                </HapticPressable>
                <HapticPressable haptic="light" style={styles.addPhotoButton} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={24} color={COLORS.gray[400]} />
                  <Text style={styles.addPhotoText}>Camera</Text>
                </HapticPressable>
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
            <HapticPressable
              key={condition}
              haptic="light"
              style={[styles.option, formData.condition === condition && styles.optionActive]}
              onPress={() => updateField('condition', condition)}
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
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            <View style={styles.categoryRow}>
              {categories.map((cat) => {
                const isSelected = formData.categoryId === cat.id;
                return (
                  <HapticPressable
                    key={cat.id}
                    haptic={null}
                    style={[styles.option, styles.categoryPill, isSelected && styles.optionActive]}
                    onPress={() => {
                      updateField('categoryId', isSelected ? null : cat.id);
                      haptics.selection();
                    }}
                  >
                    <Ionicons
                      name={cat.icon || 'pricetag-outline'}
                      size={16}
                      color={isSelected ? '#fff' : COLORS.textSecondary}
                    />
                    <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                      {cat.name}
                    </Text>
                  </HapticPressable>
                );
              })}
            </View>
          </ScrollView>
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
                haptic="light"
                style={[styles.option, isSelected && styles.optionActive]}
                onPress={() => {
                  const current = formData.visibility;
                  if (isSelected) {
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
                  style={{ marginRight: SPACING.xs + 2 }}
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
        <HapticPressable
          haptic="light"
          style={styles.toggle}
          onPress={() => updateField('isFree', !formData.isFree)}
        >
          <Text style={styles.toggleText}>Free to borrow</Text>
          <View style={[styles.switch, formData.isFree && styles.switchActive]}>
            <View style={[styles.switchKnob, formData.isFree && styles.switchKnobActive]} />
          </View>
        </HapticPressable>

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
        <HapticPressable
          haptic="light"
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
        </HapticPressable>

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
      <HapticPressable
        haptic="medium"
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Save Changes</Text>
        )}
      </HapticPressable>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  label: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
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
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categoryScroll: {
    marginHorizontal: -SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  option: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.separator,
  },
  optionActive: {
    backgroundColor: COLORS.primary,
  },
  optionText: {
    ...TYPOGRAPHY.bodySmall,
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
    paddingVertical: SPACING.sm,
  },
  toggleText: {
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.text,
  },
  toggleHint: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: 2,
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
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  priceField: {
    flex: 1,
    fontSize: 18,
    paddingVertical: 14,
    marginLeft: SPACING.xs,
    color: COLORS.text,
  },
  priceSuffix: {
    ...TYPOGRAPHY.bodySmall,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  depositSection: {
    marginTop: SPACING.lg,
  },
  subLabel: {
    ...TYPOGRAPHY.bodySmall,
    fontSize: 14,
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
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  durationSeparator: {
    ...TYPOGRAPHY.bodySmall,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xl,
  },
  rtoFields: {
    marginTop: SPACING.lg,
    gap: SPACING.lg,
  },
  rtoRow: {
    gap: SPACING.sm,
  },
  rtoPaymentRange: {
    gap: SPACING.sm,
  },
  percentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
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
    fontSize: 16,
  },
});
