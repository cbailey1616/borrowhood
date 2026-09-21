import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import StripeVerificationButton from './StripeVerificationButton';
import HapticPressable from './HapticPressable';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function VerificationPurchaseActions({ purchase, onVerify, testID, disabled = false }) {
  const { offer, loading, error, busy, notice, refreshOffer, restore } = purchase;
  const eligibility = offer?.eligibility;
  const paidMode = eligibility?.mode === 'apple_iap';
  const purchased = eligibility?.hasVerificationPurchase;
  const price = offer?.product?.displayPrice;
  const requiresPayment = !!eligibility?.paymentRequired;
  const ready = !!eligibility && !error
    && (eligibility.canStartVerification || (paidMode && requiresPayment && !!price));
  const label = purchased ? 'Continue verification'
    : paidMode && requiresPayment && price ? `Verify · ${price}` : 'Verify now';

  return (
    <View>
      {!loading && !error && eligibility && (
        <Text style={styles.note}>
          {purchased ? 'Verification already purchased.' : requiresPayment
            ? 'One-time payment through Apple.' : 'No payment required.'}
        </Text>
      )}
      {error && (
        <>
          <Text style={styles.note} accessibilityRole="alert">{error}</Text>
          <HapticPressable onPress={() => refreshOffer()} disabled={busy || loading} style={styles.secondary} haptic="light">
            <Text style={styles.actionText}>Retry</Text>
          </HapticPressable>
        </>
      )}
      <StripeVerificationButton onPress={onVerify} loading={busy || loading}
        disabled={disabled || !ready} label={label} testID={testID} />
      {paidMode && (
        <>
          <Text style={[styles.note, styles.disclosure]}>Payment does not guarantee successful identity verification.</Text>
          <HapticPressable onPress={restore} disabled={busy || loading || disabled} style={styles.secondary} haptic="light">
            <Text style={styles.actionText}>Restore purchase</Text>
          </HapticPressable>
        </>
      )}
      {notice && <Text style={styles.note} accessibilityLiveRegion="polite">{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.sm },
  disclosure: { ...TYPOGRAPHY.caption1, marginTop: SPACING.sm, marginBottom: 0 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.md },
  actionText: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
});
