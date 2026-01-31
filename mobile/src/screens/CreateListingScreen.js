import { useState } from 'react';
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
import { COLORS, CONDITION_LABELS, VISIBILITY_LABELS } from '../utils/config';

const CONDITIONS = ['like_new', 'good', 'fair', 'worn'];
const VISIBILITIES = ['close_friends', 'neighborhood', 'town'];

export default function CreateListingScreen({ navigation }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    condition: 'good',
    visibility: 'neighborhood',
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

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
      updateField('photos', [...formData.photos, ...newPhotos].slice(0, 10));
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
      updateField('photos', [...formData.photos, result.assets[0].uri].slice(0, 10));
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
    if (formData.photos.length === 0) {
      Alert.alert('Error', 'Please add at least one photo');
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload photos to S3
      const photoUrls = await api.uploadImages(formData.photos, 'listings');

      await api.createListing({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        condition: formData.condition,
        visibility: formData.visibility,
        isFree: formData.isFree,
        pricePerDay: formData.isFree ? undefined : parseFloat(formData.pricePerDay) || 0,
        depositAmount: parseFloat(formData.depositAmount) || 0,
        minDuration: parseInt(formData.minDuration) || 1,
        maxDuration: parseInt(formData.maxDuration) || 14,
        photos: photoUrls,
        communityId: '00000000-0000-0000-0000-000000000001', // Would come from user's community
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
      Alert.alert('Error', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Photos */}
      <View style={styles.section}>
        <Text style={styles.label}>Photos *</Text>
        <Text style={styles.hint}>Add up to 10 photos of your item</Text>
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
                  <Ionicons name="images-outline" size={24} color={COLORS.gray[400]} />
                  <Text style={styles.addPhotoText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addPhotoButton} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={24} color={COLORS.gray[400]} />
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
        <View style={styles.options}>
          {VISIBILITIES.map((visibility) => (
            <TouchableOpacity
              key={visibility}
              style={[styles.option, formData.visibility === visibility && styles.optionActive]}
              onPress={() => updateField('visibility', visibility)}
            >
              <Text style={[styles.optionText, formData.visibility === visibility && styles.optionTextActive]}>
                {VISIBILITY_LABELS[visibility]}
              </Text>
            </TouchableOpacity>
          ))}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
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
});
