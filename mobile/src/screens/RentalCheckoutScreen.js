import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { Ionicons } from '../components/Icon';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';

const PAYMENT_SHEET_APPEARANCE = {
  colors: {
    primary: COLORS.primary,
    background: COLORS.surface,
    componentBackground: COLORS.gray[800],
    componentBorder: '#2A3A2D',
    componentDivider: '#2A3A2D',
    primaryText: COLORS.text,
    secondaryText: COLORS.textSecondary,
    componentText: COLORS.text,
    placeholderText: COLORS.textMuted,
    icon: COLORS.textSecondary,
    error: COLORS.danger,
  },
  shapes: {
    borderRadius: 12,
    borderWidth: 0.5,
  },
};

export default function RentalCheckoutScreen({ navigation, route }) {
  const {
    transactionId,
    rentalFee,
    depositAmount,
    totalAmount,
    platformFee,
    lenderPayout,
    lateFeePerDay,
    rentalDays,
    listingTitle,
    // PaymentSheet credentials (from approve response)
    clientSecret,
    ephemeralKey,
    customerId,
  } = route.params || {};

  const { showError } = useError();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);

  const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`;

  const pollForAuthorization = useCallback(async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const status = await api.getRentalPaymentStatus(transactionId);
        if (status.paymentStatus === 'authorized' || status.status === 'paid') {
          return true;
        }
      } catch {
        // continue polling
      }
    }
    return false;
  }, [transactionId]);

  const handlePay = async () => {
    setProcessing(true);
    try {
      // Initialize PaymentSheet with credentials from approve
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        customerEphemeralKeySecret: ephemeralKey,
        customerId,
        merchantDisplayName: 'BorrowHood',
        applePay: {
          merchantCountryCode: 'US',
        },
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: __DEV__,
        },
        appearance: PAYMENT_SHEET_APPEARANCE,
      });

      if (initError) {
        throw new Error(initError.message);
      }

      // Present PaymentSheet
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') {
          setProcessing(false);
          return;
        }
        throw new Error(presentError.message);
      }

      // Confirm the payment on our server
      await api.confirmRentalPayment(transactionId);

      // Poll for authorization confirmation
      await pollForAuthorization();

      setCompleted(true);
      haptics.success();
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Payment failed. Please try again.',
        type: 'network',
      });
    } finally {
      setProcessing(false);
    }
  };

  // Success state
  if (completed) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark-circle" size={64} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Payment Authorized</Text>
          <Text style={styles.subtitle}>
            Your card has been authorized for {formatCurrency(totalAmount)}.
            The rental fee will only be charged at pickup. The deposit hold will be
            released when the item is returned in good condition.
          </Text>
          <HapticPressable
            testID="RentalCheckout.success.done"
            accessibilityLabel="Done"
            accessibilityRole="button"
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
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
        <Text style={styles.screenTitle}>Rental Checkout</Text>

        {listingTitle && (
          <Text style={styles.listingTitle}>{listingTitle}</Text>
        )}

        <BlurCard testID="RentalCheckout.card.priceBreakdown" accessibilityLabel="Price breakdown" style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Rental ({rentalDays} days)</Text>
              <Text style={styles.summaryValue}>{formatCurrency(rentalFee)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Security Deposit</Text>
              <Text style={styles.summaryValue}>{formatCurrency(depositAmount)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryAmountLabel}>Authorization Hold</Text>
              <Text style={styles.summaryAmount}>{formatCurrency(totalAmount)}</Text>
            </View>
          </View>
        </BlurCard>

        <BlurCard style={styles.infoCard}>
          <View style={styles.infoContent}>
            <View style={styles.infoRow}>
              <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
              <Text style={styles.infoText}>
                Only the rental fee is charged at pickup. The deposit is held and released on clean return.
              </Text>
            </View>
            {lateFeePerDay > 0 && (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={20} color={COLORS.warning} />
                <Text style={styles.infoText}>
                  Late fee: {formatCurrency(lateFeePerDay)}/day after the return date.
                </Text>
              </View>
            )}
            {depositAmount > 0 && (
              <View style={styles.infoRow}>
                <Ionicons name="information-circle-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.infoText}>
                  If the item is damaged, up to {formatCurrency(depositAmount)} may be deducted from your deposit.
                </Text>
              </View>
            )}
          </View>
        </BlurCard>

        <HapticPressable
          testID="RentalCheckout.button.authorize"
          accessibilityLabel="Authorize payment"
          accessibilityRole="button"
          style={[styles.primaryButton, processing && styles.buttonDisabled]}
          onPress={handlePay}
          disabled={processing}
          haptic="medium"
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              Authorize {formatCurrency(totalAmount)}
            </Text>
          )}
        </HapticPressable>

        <View style={styles.paymentMethods}>
          <Ionicons name="card-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.paymentMethodsText}>Card, Apple Pay, or Google Pay</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
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
  },
  screenTitle: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  listingTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
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
  summaryCard: {
    marginBottom: SPACING.lg,
  },
  summaryContent: {
    padding: SPACING.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  summaryLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  summaryAmountLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
  },
  summaryValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  summaryAmount: {
    ...TYPOGRAPHY.h2,
    color: COLORS.primary,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
  },
  infoCard: {
    marginBottom: SPACING.xl,
  },
  infoContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  infoText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.button,
    fontSize: 16,
  },
  paymentMethods: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
  },
  paymentMethodsText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
});
