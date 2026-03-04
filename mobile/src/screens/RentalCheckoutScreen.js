import { useState, useCallback, useEffect } from 'react';
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
import { haptics } from '../utils/haptics';

// Stripe PaymentSheet requires hex colors — COLORS.borderBrown is rgba so use hex equivalent
const PAYMENT_SHEET_APPEARANCE = {
  colors: {
    primary: COLORS.primary,
    background: COLORS.background,
    componentBackground: '#FFFFFF',
    componentBorder: '#C4B299',
    componentDivider: '#C4B299',
    primaryText: '#1A1A1A',
    secondaryText: '#6B6B6B',
    componentText: '#1A1A1A',
    placeholderText: '#9E9E9E',
    icon: '#6B6B6B',
    error: COLORS.danger,
  },
  shapes: {
    borderRadius: 12,
    borderWidth: 1,
  },
};

export default function RentalCheckoutScreen({ navigation, route }) {
  const {
    transactionId,
    rentalFee,
    depositAmount,
    borrowerServiceFee,
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
  const [sheetReady, setSheetReady] = useState(false);
  const [initError, setInitError] = useState(null);

  const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`;

  // Initialize PaymentSheet on mount
  useEffect(() => {
    const initSheet = async () => {
      if (!clientSecret || !ephemeralKey || !customerId) {
        console.error('Missing payment credentials:', { clientSecret: !!clientSecret, ephemeralKey: !!ephemeralKey, customerId: !!customerId });
        setInitError('Payment setup incomplete. Please go back and try again.');
        return;
      }

      console.log('Initializing PaymentSheet on mount...');
      const { error } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        customerEphemeralKeySecret: ephemeralKey,
        customerId,
        merchantDisplayName: 'BorrowHood',
        returnURL: 'com.borrowhood.app://stripe-redirect',
        applePay: {
          merchantCountryCode: 'US',
        },
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: __DEV__,
        },
        appearance: PAYMENT_SHEET_APPEARANCE,
      });

      if (error) {
        console.error('PaymentSheet init error:', error);
        setInitError(error.message);
      } else {
        console.log('PaymentSheet initialized successfully');
        setSheetReady(true);
      }
    };

    initSheet();
  }, [clientSecret, ephemeralKey, customerId]);

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
    if (initError) {
      showError({ message: initError, type: 'network' });
      return;
    }

    if (!sheetReady) {
      showError({ message: 'Payment is still loading. Please wait a moment and try again.', type: 'network' });
      return;
    }

    setProcessing(true);
    try {
      console.log('Presenting PaymentSheet...');
      const { error: presentError } = await presentPaymentSheet();
      console.log('PaymentSheet result:', presentError ? `Error: ${presentError.code} - ${presentError.message}` : 'Success');

      if (presentError) {
        if (presentError.code === 'Canceled') {
          setProcessing(false);
          return;
        }
        throw new Error(presentError.message);
      }

      // Payment succeeded — confirm on our server
      try {
        await api.confirmRentalPayment(transactionId);
        await pollForAuthorization();
      } catch (confirmErr) {
        // Payment went through but server confirmation failed — still show success
        // The server will reconcile via webhook
        console.warn('Server confirmation failed after successful payment:', confirmErr);
      }

      setCompleted(true);
      haptics.success();
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Your payment didn\'t go through. Please check your card details and try again.',
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
          <Text style={styles.title}>Request Sent!</Text>
          <Text style={styles.subtitle}>
            Your card has been authorized for {formatCurrency(totalAmount)}.
            The lender will review your request. If they decline or you cancel,
            the hold is released immediately.
          </Text>
          <HapticPressable
            testID="RentalCheckout.success.done"
            accessibilityLabel="Done"
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={() => navigation.popToTop()}
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

        <View testID="RentalCheckout.card.priceBreakdown" accessibilityLabel="Price breakdown" style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Rental ({rentalDays} days)</Text>
              <Text style={styles.summaryValue}>{formatCurrency(rentalFee)}</Text>
            </View>
            {borrowerServiceFee > 0 && (
              <>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Service Fee (3%)</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(borrowerServiceFee)}</Text>
                </View>
              </>
            )}
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
        </View>

        <View style={[styles.cardBox, styles.infoCard]}>
          <View style={styles.infoContent}>
            <View style={styles.infoRow}>
              <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
              <Text style={styles.infoText}>
                Payment is captured when the lender approves. If declined or cancelled, the hold is released immediately.
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
        </View>

        {initError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
            <Text style={styles.errorBannerText}>{initError}</Text>
          </View>
        )}

        <HapticPressable
          testID="RentalCheckout.button.authorize"
          accessibilityLabel="Authorize payment"
          accessibilityRole="button"
          style={[styles.primaryButton, (processing || !sheetReady) && styles.buttonDisabled]}
          onPress={handlePay}
          disabled={processing || !!initError}
          haptic="medium"
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : !sheetReady && !initError ? (
            <View style={styles.buttonLoading}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.primaryButtonText}>Setting up payment...</Text>
            </View>
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
    backgroundColor: COLORS.greenBg,
    borderWidth: 1.5,
    borderColor: COLORS.greenBorder,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
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
    color: COLORS.greenTextMuted,
  },
  summaryAmountLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.greenText,
    fontWeight: '600',
  },
  summaryValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.greenText,
  },
  summaryAmount: {
    ...TYPOGRAPHY.h2,
    color: COLORS.greenText,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.greenSeparator,
  },
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger + '15',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorBannerText: {
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
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
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
