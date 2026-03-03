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
import { haptics } from '../utils/haptics';
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
    listingTitle,
    borrowerId,
    lenderId,
  } = route.params || {};

  const { showError } = useError();
  const [type, setType] = useState(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [amountText, setAmountText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const maxClaimCents = Math.round((depositAmount || 0) * 100);
  const claimCents = Math.min(
    Math.round(parseFloat(amountText || '0') * 100),
    maxClaimCents
  );
  const cappedAmount = claimCents / 100;

  const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`;

  const isValid = type !== null && description.length >= 10;

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

  const handleSubmit = async () => {
    if (!isValid || submitting) return;

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
        requestedAmount: type === 'damagesClaim' ? cappedAmount : undefined,
      });

      setCompleted(true);
      haptics.success();
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Couldn\'t submit your report right now. Please check your connection and try again.',
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
          <Text style={styles.title}>Issue Reported</Text>
          <Text style={styles.subtitle}>
            Your report has been submitted and will be reviewed by our team.
            We'll follow up with you shortly.
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
        {listingTitle && (
          <Text style={styles.listingTitle}>{listingTitle}</Text>
        )}

        {/* Issue type picker */}
        <BlurCard style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Issue Type</Text>
            <Text style={styles.cardHint}>Select the type of issue you want to report</Text>

            {ISSUE_TYPES.map((issueType, index) => (
              <HapticPressable
                testID={`ReportIssue.picker.${issueType.key}`}
                key={issueType.key}
                style={[
                  styles.typeRow,
                  index < ISSUE_TYPES.length - 1 && styles.typeRowBorder,
                ]}
                onPress={() => setType(issueType.key)}
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
        </BlurCard>

        {/* Description */}
        <BlurCard style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Description</Text>
            <TextInput
              testID="ReportIssue.input.description"
              accessibilityLabel="Issue description"
              style={styles.notesInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the issue in detail..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={styles.charCount}>{description.length}/2000</Text>
          </View>
        </BlurCard>

        {/* Evidence photos */}
        <BlurCard style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Photos</Text>
            <Text style={styles.cardHint}>
              Upload up to 4 photos as evidence
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
        </BlurCard>

        {/* Amount field - only for damages claim */}
        {type === 'damagesClaim' && (
          <BlurCard style={styles.card}>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Claim Amount</Text>
              <Text style={styles.cardHint}>
                Maximum: {formatCurrency(depositAmount)} (deposit amount)
              </Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  testID="ReportIssue.input.amount"
                  accessibilityLabel="Claim amount"
                  style={styles.amountInput}
                  value={amountText}
                  onChangeText={setAmountText}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              {claimCents > maxClaimCents && (
                <Text style={styles.errorText}>
                  Cannot exceed deposit of {formatCurrency(depositAmount)}
                </Text>
              )}
            </View>
          </BlurCard>
        )}

        {/* Submit */}
        <HapticPressable
          testID="ReportIssue.button.submit"
          accessibilityLabel="Submit issue report"
          accessibilityRole="button"
          style={[
            styles.primaryButton,
            (!isValid || submitting) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!isValid || submitting}
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
  card: {
    marginBottom: SPACING.lg,
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
    backgroundColor: COLORS.gray[800],
    borderRadius: RADIUS.sm,
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
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[800],
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
  },
  dollarSign: {
    ...TYPOGRAPHY.h1,
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  amountInput: {
    flex: 1,
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    paddingVertical: SPACING.md,
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
    backgroundColor: COLORS.gray[800],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textSecondary,
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
