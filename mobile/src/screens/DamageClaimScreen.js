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
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import { haptics } from '../utils/haptics';
import * as ImagePicker from 'expo-image-picker';

export default function DamageClaimScreen({ navigation, route }) {
  const {
    transactionId,
    depositAmount,   // in dollars
    listingTitle,
    conditionAtPickup,
    conditionAtReturn,
  } = route.params || {};

  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const [amountText, setAmountText] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);

  const maxClaimCents = Math.round((depositAmount || 0) * 100);
  const claimCents = Math.min(
    Math.round(parseFloat(amountText || '0') * 100),
    maxClaimCents
  );
  const isValid = claimCents >= 1 && notes.length >= 10;

  const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`;

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5 - photos.length,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newPhotos = result.assets.map(a => a.uri);
      setPhotos(prev => [...prev, ...newPhotos].slice(0, 5));
    }
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!isValid) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Upload evidence photos
      let evidenceUrls = [];
      if (photos.length > 0) {
        evidenceUrls = await api.uploadImages(photos, 'damage-evidence');
      }

      // Submit damage claim
      const result = await api.submitDamageClaim(transactionId, {
        amountCents: claimCents,
        notes,
        evidenceUrls,
      });

      setClaimResult(result);
      setCompleted(true);
      haptics.success();
    } catch (err) {
      haptics.error();
      setSubmitError(err.message || 'Couldn\'t submit your claim right now. Please check your connection and try again.');
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
          <Text style={styles.title}>Claim Submitted</Text>
          <Text style={styles.subtitle}>
            Your damage claim for {formatCurrency(claimCents / 100)} has been sent to the
            borrower. They have 48 hours to respond, accept, or make a counter offer.
            If they don't respond, a community organizer will step in.
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

        {/* Condition comparison */}
        {conditionAtPickup && conditionAtReturn && (
          <View style={[styles.cardBox, styles.card]}>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Condition Change</Text>
              <View style={styles.conditionRow}>
                <View style={styles.conditionBadge}>
                  <Text style={styles.conditionBadgeText}>Pickup: {conditionAtPickup}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
                <View style={[styles.conditionBadge, styles.conditionBadgeDamaged]}>
                  <Text style={styles.conditionBadgeDamagedText}>Return: {conditionAtReturn}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Claim amount */}
        <View style={[styles.cardBox, styles.card]}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Claim Amount</Text>
            <Text style={styles.cardHint}>
              Maximum: {formatCurrency(depositAmount)} (deposit)
            </Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                testID="DamageClaim.input.amount"
                accessibilityLabel="Claim amount"
                style={styles.amountInput}
                value={amountText}
                onChangeText={(text) => { setAmountText(text); setSubmitError(null); }}
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
        </View>

        {/* Damage description */}
        <View style={[styles.cardBox, styles.card]}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Describe the Damage</Text>
            <Text style={styles.cardHint}>Minimum 10 characters</Text>
            <TextInput
              testID="DamageClaim.input.description"
              accessibilityLabel="Damage description"
              style={styles.notesInput}
              value={notes}
              onChangeText={(text) => { setNotes(text); setSubmitError(null); }}
              placeholder="Describe what's damaged and the extent of the damage..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={1000}
              autoCapitalize="sentences"
              autoCorrect={true}
              spellCheck={true}
            />
            <Text style={styles.charCount}>{notes.length}/1000</Text>
          </View>
        </View>

        {/* Evidence photos */}
        <View style={[styles.cardBox, styles.card]}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Evidence Photos</Text>
            <Text style={styles.cardHint}>
              Optional — upload up to 5 photos of the damage
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

              {photos.length < 5 && (
                <HapticPressable
                  testID="DamageClaim.button.addPhoto"
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

        {/* Error banner */}
        {submitError && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
            <Text style={styles.errorCardText}>{submitError}</Text>
          </View>
        )}

        {/* Submit */}
        <HapticPressable
          testID="DamageClaim.button.submit"
          accessibilityLabel="Submit damage claim"
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
            <Text style={styles.primaryButtonText}>
              Submit Claim for {formatCurrency(claimCents / 100)}
            </Text>
          )}
        </HapticPressable>

        <Text style={styles.disclaimer}>
          The claimed amount will be deducted from the borrower's security deposit.
          The remaining deposit will be refunded to them.
        </Text>
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
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  conditionBadge: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderBrown,
  },
  conditionBadgeText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.text,
  },
  conditionBadgeDamaged: {
    backgroundColor: `${COLORS.danger}15`,
    borderColor: COLORS.danger,
  },
  conditionBadgeDamagedText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.danger,
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
  disclaimer: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.lg,
    lineHeight: 18,
  },
});
