import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';
import GateStepper from '../components/GateStepper';

const VERIFIED_FEATURES = [
  'Borrow from anyone in your town',
  'Charge rental fees for your items',
  'Identity verified badge',
  'Support local sharing infrastructure',
];

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function SubscriptionScreen({ navigation, route }) {
  const source = route?.params?.source || 'generic';
  const totalSteps = route?.params?.totalSteps;
  const { user, refreshUser } = useAuth();
  const { showError } = useError();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [currentSub, setCurrentSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const loadData = async () => {
    try {
      const subRes = await api.getCurrentSubscription().catch(e => {
        console.log('Failed to load current subscription:', e);
        return { tier: 'free', features: [] };
      });
      setCurrentSub(subRes || { tier: 'free', features: [] });
    } catch (err) {
      console.error('Load subscription data error:', err);
      showError({
        message: err.message || 'Couldn\'t load subscription info. Please check your connection and try again.',
        type: 'network',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshUser();
      loadData();
    }, [])
  );

  // Poll for activation after PaymentSheet success
  const pollForActivation = async () => {
    for (let i = 0; i < 5; i++) {
      await sleep(1000);
      try {
        const sub = await api.getCurrentSubscription();
        if (sub.tier === 'plus') {
          setCurrentSub(sub);
          await refreshUser();
          return true;
        }
      } catch (e) {
        // Keep polling
      }
    }
    return false;
  };

  const openPaymentSheet = async (credentials) => {
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: credentials.clientSecret,
      customerEphemeralKeySecret: credentials.ephemeralKey,
      customerId: credentials.customerId,
      merchantDisplayName: 'BorrowHood',
      applePay: {
        merchantCountryCode: 'US',
      },
      appearance: PAYMENT_SHEET_APPEARANCE,
    });

    if (initError) {
      throw new Error(initError.message);
    }

    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === 'Canceled') {
        return false; // User cancelled, not an error
      }
      throw new Error(presentError.message);
    }

    return true;
  };

  const handleVerify = async () => {
    setPaying(true);
    try {
      // Get PaymentSheet credentials from server
      const credentials = await api.createVerificationPayment();

      // Present PaymentSheet
      const completed = await openPaymentSheet(credentials);
      if (!completed) {
        setPaying(false);
        return;
      }

      // Poll for webhook to update subscription_tier in DB
      await pollForActivation();

      if (source === 'town_browse' || source === 'rental_listing') {
        haptics.success();
        navigation.replace('IdentityVerification', { source, totalSteps });
        return;
      }

      if (source === 'onboarding') {
        haptics.success();
        navigation.replace('OnboardingVerification', { source: 'onboarding', totalSteps: 2 });
        return;
      }

      // Generic: update this screen
      await loadData();
      haptics.success();
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Your payment couldn\'t be processed. Please check your payment method and try again.',
        type: 'network',
      });
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const isPlus = currentSub?.tier === 'plus';
  const isVerified = user?.isVerified;

  // ── Verified user view ──
  if (isPlus) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <View style={styles.verifiedBadgeCircle}>
            <Ionicons name="shield-checkmark" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>You're Verified</Text>
          <Text style={styles.subtitle}>
            You have full access to all BorrowHood features.
          </Text>
        </View>

        <BlurCard style={styles.planCard}>
          <View style={styles.planCardContent}>
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>Status</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.planValue}>Verified</Text>
              </View>
            </View>
            <View style={styles.planDivider} />
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>Access</Text>
              <Text style={styles.planValue}>Permanent</Text>
            </View>
            {currentSub?.startedAt && (
              <>
                <View style={styles.planDivider} />
                <View style={styles.planRow}>
                  <Text style={styles.planLabel}>Verified since</Text>
                  <Text style={styles.planValue}>
                    {new Date(currentSub.startedAt).toLocaleDateString()}
                  </Text>
                </View>
              </>
            )}
          </View>
        </BlurCard>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Your verification is permanent. No recurring charges.
          </Text>
          <Text style={styles.footerText}>
            Need help? Contact support@borrowhood.com
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Context-aware header text
  const headerTitle = source === 'onboarding'
    ? 'Verify & Unlock'
    : source === 'town_browse'
      ? 'Explore Your Whole Town'
      : source === 'rental_listing'
        ? 'Start Earning From Your Items'
        : 'Verify & Unlock';
  const headerSubtitle = source === 'onboarding'
    ? 'Step 1 of 2 — pay once, then verify your identity'
    : source === 'town_browse'
      ? 'We verify everyone at this level so you can lend with confidence'
      : source === 'rental_listing'
        ? 'Verification + identity check + payout setup required'
        : 'Pay $1.99 to verify your identity and unlock town-level borrowing.';

  // ── Free user: verification flow ──
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Gate Stepper */}
      {source !== 'generic' && totalSteps && (
        <GateStepper currentStep={1} totalSteps={totalSteps} source={source} />
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{headerTitle}</Text>
        <Text style={styles.price}>$1.99</Text>
        <Text style={styles.priceNote}>one-time</Text>
        <Text style={styles.subtitle}>{headerSubtitle}</Text>
      </View>

      {/* Features */}
      <BlurCard style={styles.featuresCard}>
        <View style={styles.featuresCardContent}>
          {VERIFIED_FEATURES.map((feature, idx) => (
            <View key={idx} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </BlurCard>

      {/* Steps */}
      <View style={styles.stepsContainer}>
        {/* Step 1: Pay */}
        <View style={styles.step}>
          <View style={styles.stepIndicator}>
            <View style={[styles.stepCircle, styles.stepCircleActive]}>
              <Text style={styles.stepNumber}>1</Text>
            </View>
            {(source === 'generic' || source === 'onboarding') && <View style={styles.stepLine} />}
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Verify & Pay</Text>
            <Text style={styles.stepDescription}>
              Pay once with card or Apple Pay. No recurring charges.
            </Text>
            <HapticPressable
              style={[styles.stepButton, styles.stepButtonPrimary, paying && { opacity: 0.5 }]}
              onPress={handleVerify}
              disabled={paying}
              haptic="medium"
              testID="Subscription.button.subscribe"
              accessibilityLabel="Verify for $1.99"
              accessibilityRole="button"
            >
              <Text style={styles.stepButtonText}>
                {paying ? 'Processing...' : 'Verify for $1.99'}
              </Text>
            </HapticPressable>
          </View>
        </View>

        {/* Step 2: Identity check (shown for generic and onboarding) */}
        {(source === 'generic' || source === 'onboarding') && (
          <View style={[styles.step, styles.stepDimmed]}>
            <View style={styles.stepIndicator}>
              {isVerified ? (
                <View style={[styles.stepCircle, styles.stepCircleComplete]}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </View>
              ) : (
                <View style={[styles.stepCircle, styles.stepCircleInactive]}>
                  <Text style={[styles.stepNumber, styles.stepNumberInactive]}>2</Text>
                </View>
              )}
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, styles.stepTitleDimmed]}>
                Identity Check
              </Text>
              <Text style={[styles.stepDescription, styles.stepDescriptionDimmed]}>
                Quick identity check to keep the community safe.{'\n'}We'll notify you once verification is complete — it usually only takes a few minutes.
              </Text>
              {isVerified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              ) : (
                <HapticPressable
                  style={[styles.stepButton, styles.stepButtonDisabled]}
                  disabled
                  haptic="medium"
                >
                  <Text style={styles.stepButtonText}>Verify Now</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </HapticPressable>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          One-time payment. No recurring charges.
        </Text>
        <Text style={styles.footerText}>
          Need help? Contact support@borrowhood.com
        </Text>
      </View>

      {paying && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.overlayText}>Processing...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  verifiedBadgeCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  price: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 2,
  },
  priceNote: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Features card
  featuresCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  featuresCardContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  featureText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    flex: 1,
  },

  // Steps
  stepsContainer: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  step: {
    flexDirection: 'row',
  },
  stepDimmed: {
    opacity: 0.5,
  },
  stepIndicator: {
    alignItems: 'center',
    marginRight: SPACING.lg,
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: COLORS.primary,
  },
  stepCircleComplete: {
    backgroundColor: COLORS.primary,
  },
  stepCircleInactive: {
    backgroundColor: COLORS.gray[700],
  },
  stepNumber: {
    ...TYPOGRAPHY.headline,
    color: '#fff',
    fontSize: 16,
  },
  stepNumberInactive: {
    color: COLORS.textMuted,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.gray[700],
    marginVertical: SPACING.xs,
  },
  stepContent: {
    flex: 1,
    paddingBottom: SPACING.xl,
  },
  stepTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  stepTitleDimmed: {
    color: COLORS.textMuted,
  },
  stepDescription: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  stepDescriptionDimmed: {
    color: COLORS.textMuted,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  verifiedText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.primary,
    fontSize: 14,
  },
  stepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
  },
  stepButtonPrimary: {
    alignSelf: 'stretch',
  },
  stepButtonDisabled: {
    backgroundColor: COLORS.gray[700],
  },
  stepButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },

  // Plan card (verified view)
  planCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  planCardContent: {
    padding: SPACING.lg,
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  planLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  planValue: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  planDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
  },

  // Status indicator
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Footer
  footer: {
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  footerText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background + 'E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.text,
    marginTop: SPACING.md,
  },
});
