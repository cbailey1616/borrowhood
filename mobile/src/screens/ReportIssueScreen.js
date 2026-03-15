import { useState, useRef } from 'react';
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
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import { haptics } from '../utils/haptics';
import { useAuth } from '../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';

const ISSUE_TYPES = [
  { key: 'damagesClaim', icon: 'construct-outline', label: 'Damages Claim' },
  { key: 'nonReturn', icon: 'close-circle-outline', label: 'Non-Return' },
  { key: 'lateReturn', icon: 'time-outline', label: 'Late Return' },
  { key: 'itemNotAsDescribed', icon: 'alert-circle-outline', label: 'Not As Described' },
  { key: 'paymentIssue', icon: 'card-outline', label: 'Payment Issue' },
  { key: 'noShow', icon: 'person-remove-outline', label: 'No Show' },
];

export default function ReportIssueScreen({ navigation, route }) {
  const {
    transactionId,
    depositAmount,
    rentalFee,
    listingTitle,
    borrowerId,
    lenderId,
  } = route.params || {};

  const { user } = useAuth();
  const isLender = user?.id === lenderId;

  const filteredTypes = ISSUE_TYPES.filter(t =>
    isLender
      ? ['damagesClaim', 'nonReturn', 'lateReturn'].includes(t.key)
      : ['itemNotAsDescribed', 'paymentIssue', 'noShow'].includes(t.key)
  );

  const [type, setType] = useState(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [amountText, setAmountText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ type: false, description: false });
  const [submitError, setSubmitError] = useState(null);
  const scrollRef = useRef(null);
  const fieldPositions = useRef({});

  // Lender claim types use the deposit as max (rental fee is already earned)
  // Borrower claim types use the rental fee as max (they want their payment back)
  const isLenderType = ['damagesClaim', 'nonReturn', 'lateReturn'].includes(type);
  const maxClaimDollars = isLenderType
    ? (depositAmount || 0)
    : (rentalFee || 0);
  const maxClaimCents = Math.round(maxClaimDollars * 100);
  const rawClaimCents = Math.round(parseFloat(amountText || '0') * 100);
  const claimExceedsMax = rawClaimCents > maxClaimCents;
  const claimCents = Math.min(rawClaimCents, maxClaimCents);
  const cappedAmount = claimCents / 100;

  const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`;

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

  const selectType = (key) => {
    setType(key);
    setSubmitError(null);
    if (fieldErrors.type) setFieldErrors(prev => ({ ...prev, type: false }));
  };

  const updateDescription = (text) => {
    setDescription(text);
    setSubmitError(null);
    if (fieldErrors.description) setFieldErrors(prev => ({ ...prev, description: false }));
  };

  const handleSubmit = async () => {
    if (submitting) return;

    const errors = {
      type: type === null,
      description: description.length < 10,
    };

    if (errors.type || errors.description) {
      setFieldErrors(errors);
      setSubmitError(null);
      haptics.warning();

      const y = errors.type ? fieldPositions.current.type : fieldPositions.current.description;
      if (y != null && scrollRef.current) {
        scrollRef.current.scrollTo({ y: Math.max(0, y - SPACING.xl), animated: true });
      }
      return;
    }

    setSubmitting(true);
    try {
      let photoUrls = [];
      if (photos.length > 0) {
        photoUrls = await api.uploadImages(photos, 'disputes');
      }

      await api.fileDispute({
        transactionId,
        type,
        description,
        photoUrls,
        requestedAmount: type === 'nonReturn'
          ? (depositAmount || 0)
          : isLenderType
            ? cappedAmount
            : (rentalFee || 0),
      });

      setCompleted(true);
      haptics.success();
    } catch (err) {
      haptics.error();
      setSubmitError(err.message || 'Couldn\'t submit your report right now. Please check your connection and try again.');
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
          <Text style={styles.title}>Issue Reported</Text>
          <Text style={styles.subtitle}>
            Your report has been sent to the other party. They have 48 hours to respond, accept, or make a counter offer. If they don't respond or you can't reach an agreement, a community organizer will step in.
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
        ref={scrollRef}
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
      >
        {listingTitle && (
          <Text style={styles.listingTitle}>{listingTitle}</Text>
        )}

        {/* Issue type picker */}
        <View
          style={[styles.cardBox, styles.card, fieldErrors.type && styles.fieldError]}
          onLayout={(e) => { fieldPositions.current.type = e.nativeEvent.layout.y; }}
        >
          <View style={styles.cardContent}>
            <Text style={[styles.cardLabel, fieldErrors.type && styles.fieldErrorLabel]}>Issue Type *</Text>
            <Text style={styles.cardHint}>Select the type of issue you want to report</Text>

            {filteredTypes.map((issueType, index) => (
              <HapticPressable
                testID={`ReportIssue.picker.${issueType.key}`}
                key={issueType.key}
                style={[
                  styles.typeRow,
                  index < filteredTypes.length - 1 && styles.typeRowBorder,
                ]}
                onPress={() => selectType(issueType.key)}
                haptic="light"
              >
                <Ionicons
                  name={issueType.icon}
                  size={22}
                  color={type === issueType.key ? COLORS.primary : COLORS.textSecondary}
                />
                <Text
                  style={[
                    styles.typeLabel,
                    type === issueType.key && styles.typeLabelSelected,
                  ]}
                >
                  {issueType.label}
                </Text>
                {type === issueType.key && (
                  <Ionicons name="checkmark" size={22} color={COLORS.primary} />
                )}
              </HapticPressable>
            ))}
          </View>
        </View>

        {/* Description */}
        <View
          style={[styles.cardBox, styles.card, fieldErrors.description && styles.fieldError]}
          onLayout={(e) => { fieldPositions.current.description = e.nativeEvent.layout.y; }}
        >
          <View style={styles.cardContent}>
            <Text style={[styles.cardLabel, fieldErrors.description && styles.fieldErrorLabel]}>Description *</Text>
            <Text style={styles.cardHint}>Minimum 10 characters</Text>
            <TextInput
              testID="ReportIssue.input.description"
              accessibilityLabel="Issue description"
              style={[styles.notesInput, fieldErrors.description && styles.fieldError]}
              value={description}
              onChangeText={updateDescription}
              placeholder="Describe the issue in detail..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={2000}
              autoCapitalize="sentences"
              autoCorrect={true}
              spellCheck={true}
            />
            <Text style={styles.charCount}>{description.length}/2000</Text>
          </View>
        </View>

        {/* Evidence photos */}
        <View style={[styles.cardBox, styles.card]}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Photos</Text>
            <Text style={styles.cardHint}>
              Optional — upload up to 4 photos as evidence
            </Text>

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
                  testID="ReportIssue.button.addPhoto"
                  accessibilityLabel="Add photo"
                  accessibilityRole="button"
                  style={styles.addPhotoButton}
                  onPress={pickPhotos}
                  haptic="light"
                >
                  <Ionicons name="camera-outline" size={28} color={COLORS.textSecondary} />
                  <Text style={styles.addPhotoText}>Add</Text>
                </HapticPressable>
              )}
            </View>
          </View>
        </View>

        {/* Non-return: auto-claim full deposit */}
        {type === 'nonReturn' && (depositAmount || 0) > 0 && (
          <View style={[styles.cardBox, styles.card]}>
            <View style={styles.cardContent}>
              <View style={styles.depositClaimRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
                <View style={styles.depositClaimInfo}>
                  <Text style={styles.cardLabel}>Claim Security Deposit</Text>
                  <Text style={styles.cardHint}>
                    The full {formatCurrency(depositAmount)} deposit will be claimed. You also keep the {formatCurrency(rentalFee || 0)} rental fee.
                  </Text>
                </View>
                <Text style={styles.depositClaimAmount}>{formatCurrency(depositAmount)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Damages / late return: custom amount from deposit */}
        {(type === 'damagesClaim' || type === 'lateReturn') && maxClaimCents > 0 && (
          <View style={[styles.cardBox, styles.card]}>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Claim Amount</Text>
              <Text style={styles.cardHint}>
                Up to {formatCurrency(maxClaimDollars)} (security deposit). You keep the rental fee separately.
              </Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  testID="ReportIssue.input.amount"
                  accessibilityLabel="Claim amount"
                  style={styles.amountInput}
                  value={amountText}
                  onChangeText={setAmountText}
                  onBlur={() => {
                    if (claimExceedsMax) {
                      setAmountText((maxClaimCents / 100).toFixed(2));
                    }
                  }}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              {claimExceedsMax && (
                <Text style={styles.errorText}>
                  Cannot exceed the deposit of {formatCurrency(maxClaimDollars)}.
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Error banner */}
        {submitError && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
            <Text style={styles.errorCardText}>{submitError}</Text>
          </View>
        )}

        {/* Submit */}
        <HapticPressable
          testID="ReportIssue.button.submit"
          accessibilityLabel="Submit issue report"
          accessibilityRole="button"
          style={[
            styles.primaryButton,
            submitting && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitting}
          haptic="medium"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Submit Report</Text>
          )}
        </HapticPressable>
      </ScrollView>
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
  listingTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginBottom: SPACING.lg,
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
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
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
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  typeRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  typeLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    flex: 1,
  },
  typeLabelSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  notesInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderBrown,
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    minHeight: 100,
  },
  charCount: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  depositClaimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  depositClaimInfo: {
    flex: 1,
  },
  depositClaimAmount: {
    ...TYPOGRAPHY.h2,
    color: COLORS.primary,
    fontWeight: '700',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderBrown,
    paddingHorizontal: SPACING.md,
  },
  dollarSign: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  amountInput: {
    flex: 1,
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    paddingVertical: SPACING.lg,
  },
  errorText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.danger,
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
    borderColor: COLORS.borderBrown,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textSecondary,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger + '12',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  errorCardText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.danger,
    flex: 1,
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
    fontSize: 16,
  },
});
