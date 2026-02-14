import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
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

export default function PaymentFlowScreen({ navigation, route }) {
  const {
    amount,       // in cents
    description,
    metadata = {},
    onSuccess,    // callback with paymentIntentId
    title = 'Payment',
  } = route.params || {};

  const { showError } = useError();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState(null);

  const displayAmount = amount ? `$${(amount / 100).toFixed(2)}` : '$0.00';

  const handlePay = async () => {
    setProcessing(true);
    try {
      // Create PaymentIntent on server
      const credentials = await api.createPaymentIntent(amount, description, metadata);
      setPaymentIntentId(credentials.paymentIntentId);

      // Initialize PaymentSheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: credentials.clientSecret,
        customerEphemeralKeySecret: credentials.ephemeralKey,
        customerId: credentials.customerId,
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

      // Payment succeeded
      setCompleted(true);
      haptics.success();

      if (onSuccess) {
        onSuccess(credentials.paymentIntentId);
      }
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
          <Text style={styles.title}>Payment Complete</Text>
          <Text style={styles.subtitle}>
            Your payment of {displayAmount} has been processed successfully.
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
      <View style={styles.content}>
        <Text style={styles.screenTitle}>{title}</Text>

        <BlurCard style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            {description && (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Description</Text>
                  <Text style={styles.summaryValue}>{description}</Text>
                </View>
                <View style={styles.summaryDivider} />
              </>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount</Text>
              <Text style={styles.summaryAmount}>{displayAmount}</Text>
            </View>
          </View>
        </BlurCard>

        <HapticPressable
          style={[styles.primaryButton, processing && styles.buttonDisabled]}
          onPress={handlePay}
          disabled={processing}
          haptic="medium"
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Pay {displayAmount}</Text>
          )}
        </HapticPressable>

        <View style={styles.paymentMethods}>
          <Ionicons name="card-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.paymentMethodsText}>Card, Apple Pay, or Google Pay</Text>
        </View>
      </View>
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
  screenTitle: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
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
    marginBottom: SPACING.xxl,
  },
  successCircle: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  summaryCard: {
    marginBottom: SPACING.xl,
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
  summaryValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    flex: 1,
    textAlign: 'right',
    marginLeft: SPACING.md,
  },
  summaryAmount: {
    ...TYPOGRAPHY.h2,
    color: COLORS.primary,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
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
