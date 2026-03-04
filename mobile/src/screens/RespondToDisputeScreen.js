import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import ActionSheet from '../components/ActionSheet';
import { haptics } from '../utils/haptics';
import * as ImagePicker from 'expo-image-picker';

const TYPE_CONFIG = {
  damagesClaim: { label: 'Damages Claim', icon: 'construct-outline' },
  nonReturn: { label: 'Non-Return', icon: 'close-circle-outline' },
  lateReturn: { label: 'Late Return', icon: 'time-outline' },
  itemNotAsDescribed: { label: 'Not As Described', icon: 'alert-circle-outline' },
  paymentIssue: { label: 'Payment Issue', icon: 'card-outline' },
  noShow: { label: 'No Show', icon: 'person-remove-outline' },
};

export default function RespondToDisputeScreen({ navigation, route }) {
  const { disputeId, claimantName, type, description, requestedAmount, mode } = route.params || {};

  const { showError } = useError();
  const [responseDescription, setResponseDescription] = useState('');
  const [counterAmountText, setCounterAmountText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({ description: false, amount: false });
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);

  const typeInfo = TYPE_CONFIG[type] || { label: type, icon: 'help-circle-outline' };
  const isCounter = mode === 'counter';
  const counterAmount = parseFloat(counterAmountText);
  const hasValidAmount = !isNaN(counterAmount) && counterAmount > 0;
  const isValid = responseDescription.length >= 10 && (!isCounter || hasValidAmount);

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 4 - photos.length,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newPhotos = result.assets.map(a => a.uri);
      setPhotos(prev => [...prev, ...newPhotos].slice(0, 4));
    }
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitPress = () => {
    const errors = {
      description: responseDescription.length < 10,
      amount: isCounter && !hasValidAmount,
    };

    if (errors.description || errors.amount) {
      setFieldErrors(errors);
      haptics.warning();
      return;
    }

    setShowConfirmSheet(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let responsePhotoUrls = [];
      if (photos.length > 0) {
        responsePhotoUrls = await api.uploadImages(photos, 'disputes');
      }

      const counterAmount = parseFloat(counterAmountText);
      await api.respondToDispute(disputeId, {
        responseDescription,
        responsePhotoUrls,
        ...(isCounter && !isNaN(counterAmount) && counterAmount >= 0 ? { counterAmount } : {}),
      });

      setCompleted(true);
      haptics.success();
    } catch (err) {
      haptics.error();
      showError({
        message:
          err.message ||
          "Couldn't submit your response right now. Please check your connection and try again.",
        type: 'network',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Success state
  if (completed) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark-circle" size={64} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>{isCounter ? 'Counter Submitted' : 'Decline Submitted'}</Text>
          <Text style={styles.subtitle}>
            Your response has been recorded. An organizer will review the dispute.
          </Text>
          <HapticPressable
            style={styles.primaryButton}
            onPress={() => navigation.goBack()}
            haptic="light"
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </HapticPressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
      >
        {/* Claim Summary */}
        <BlurCard style={styles.card}>
          <View style={styles.cardContent}>
            <View style={styles.typeBadge}>
              <Ionicons name={typeInfo.icon} size={20} color={COLORS.primary} />
              <Text style={styles.typeLabel}>{typeInfo.label}</Text>
            </View>
            <Text style={styles.claimantText}>Filed by {claimantName}</Text>
            <Text style={styles.claimDescription}>{description}</Text>
          </View>
        </BlurCard>

        {/* Response Description */}
        <BlurCard style={[styles.card, fieldErrors.description && styles.fieldError]}>
          <View style={styles.cardContent}>
            <Text style={[styles.cardLabel, fieldErrors.description && styles.fieldErrorLabel]}>
              {isCounter ? 'Reason for Counter *' : 'Reason for Declining *'}
            </Text>
            <Text style={styles.cardHint}>Minimum 10 characters</Text>
            <TextInput
              testID="RespondDispute.input.description"
              accessibilityLabel="Response description"
              style={[styles.responseInput, fieldErrors.description && styles.fieldError]}
              value={responseDescription}
              onChangeText={(text) => {
                setResponseDescription(text);
                if (fieldErrors.description) setFieldErrors(prev => ({ ...prev, description: false }));
              }}
              placeholder={isCounter ? 'Explain why you think a different amount is fair...' : 'Explain why you disagree with this claim...'}
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={styles.charCount}>{responseDescription.length}/2000</Text>
          </View>
        </BlurCard>

        {/* Counter Amount (only in counter mode) */}
        {isCounter && (
          <BlurCard style={[styles.card, fieldErrors.amount && styles.fieldError]}>
            <View style={styles.cardContent}>
              <Text style={[styles.cardLabel, fieldErrors.amount && styles.fieldErrorLabel]}>Your Counter Amount *</Text>
              <Text style={styles.cardHint}>
                {requestedAmount != null
                  ? `They requested $${requestedAmount.toFixed(2)}. How much do you think is fair?`
                  : 'Enter the amount you think is fair.'}
              </Text>
              <View style={[styles.amountInputRow, fieldErrors.amount && styles.fieldError]}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  testID="RespondDispute.input.counterAmount"
                  accessibilityLabel="Counter amount"
                  style={styles.amountInput}
                  value={counterAmountText}
                  onChangeText={(text) => {
                    setCounterAmountText(text);
                    if (fieldErrors.amount) setFieldErrors(prev => ({ ...prev, amount: false }));
                  }}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
          </BlurCard>
        )}

        {/* Response Photos */}
        <BlurCard style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Photos</Text>
            <Text style={styles.cardHint}>Upload up to 4 photos to support your response</Text>

            <View style={styles.photosGrid}>
              {photos.map((uri, index) => (
                <View key={index} style={styles.photoWrapper}>
                  <Image source={{ uri }} style={styles.photo} />
                  <HapticPressable
                    style={styles.removePhoto}
                    onPress={() => removePhoto(index)}
                    haptic="light"
                  >
                    <Ionicons name="close-circle" size={22} color={COLORS.danger} />
                  </HapticPressable>
                </View>
              ))}

              {photos.length < 4 && (
                <HapticPressable
                  testID="RespondDispute.button.addPhoto"
                  accessibilityLabel="Add photo"
                  accessibilityRole="button"
                  style={styles.addPhotoButton}
                  onPress={pickPhotos}
                  haptic="light"
                >
                  <Ionicons name="camera-outline" size={28} color={COLORS.text} />
                  <Text style={styles.addPhotoText}>Add</Text>
                </HapticPressable>
              )}
            </View>
          </View>
        </BlurCard>

        {/* Submit */}
        <HapticPressable
          testID="RespondDispute.button.submit"
          accessibilityLabel={isCounter ? 'Submit counter proposal' : 'Submit decline'}
          accessibilityRole="button"
          style={[
            styles.primaryButton,
            (!isValid || submitting) && styles.buttonDisabled,
          ]}
          onPress={handleSubmitPress}
          disabled={!isValid || submitting}
          haptic="medium"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isCounter ? 'Submit Counter' : 'Submit Decline'}
            </Text>
          )}
        </HapticPressable>
      </ScrollView>

      <ActionSheet
        isVisible={showConfirmSheet}
        onClose={() => setShowConfirmSheet(false)}
        title={isCounter ? 'Submit Counter Proposal' : 'Submit Decline'}
        message={isCounter
          ? `Your counter proposal of $${parseFloat(counterAmountText || '0').toFixed(2)} will be sent to ${claimantName} to accept or decline.`
          : 'This dispute will be sent to an organizer for arbitration. They will review both sides and make a decision.'}
        actions={[
          {
            label: isCounter ? 'Submit Counter' : 'Submit Decline',
            onPress: handleSubmit,
            primary: true,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centeredContent: {
    flex: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  successCircle: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  card: {
    marginBottom: SPACING.lg,
  },
  fieldError: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  fieldErrorLabel: {
    color: COLORS.danger,
  },
  cardContent: {
    padding: SPACING.lg,
  },
  cardLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  cardHint: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  typeLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
  },
  claimantText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  claimDescription: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  responseInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    minHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  charCount: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  photoWrapper: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  removePhoto: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  addPhotoButton: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.text,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  dollarSign: {
    ...TYPOGRAPHY.headline,
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  amountInput: {
    flex: 1,
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.button,
  },
});
