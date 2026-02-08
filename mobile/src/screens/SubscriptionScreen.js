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
import ActionSheet from '../components/ActionSheet';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';
import GateStepper from '../components/GateStepper';

const PLUS_FEATURES = [
  'Borrow from anyone in your town',
  'Charge rental fees for your items',
  'Priority placement in search results',
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
  const [subscribing, setSubscribing] = useState(false);
  const [showCancelSheet, setShowCancelSheet] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('monthly');

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
        message: err.message || 'Unable to load subscription information. Please check your connection and try again.',
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

  // Poll for subscription activation after PaymentSheet success
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

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      // Get PaymentSheet credentials from server
      const credentials = await api.createSubscription(selectedPlan);

      // Present PaymentSheet
      const completed = await openPaymentSheet(credentials);
      if (!completed) {
        setSubscribing(false);
        return;
      }

      // For gate flows and onboarding, navigate immediately — don't wait
      // for poll to re-render this screen with the Plus view
      if (source === 'town_browse' || source === 'rental_listing') {
        await api.getCurrentSubscription(); // Self-heal DB tier
        await refreshUser();
        haptics.success();
        navigation.replace('IdentityVerification', { source, totalSteps });
        return;
      }

      if (source === 'onboarding') {
        // Trigger self-healing: /subscriptions/current checks Stripe and
        // updates DB tier when webhook hasn't fired yet
        await api.getCurrentSubscription();
        await refreshUser();
        haptics.success();
        navigation.replace('OnboardingVerification', { source: 'onboarding', totalSteps: 2 });
        return;
      }

      // Generic: poll and update this screen
      const activated = await pollForActivation();
      if (activated) {
        haptics.success();
      } else {
        await loadData();
        await refreshUser();
        haptics.success();
      }
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Unable to complete subscription. Please try again.',
        type: 'network',
      });
    } finally {
      setSubscribing(false);
    }
  };

  const handleRetryPayment = async () => {
    setSubscribing(true);
    try {
      const credentials = await api.retrySubscriptionPayment();
      const completed = await openPaymentSheet(credentials);
      if (!completed) {
        setSubscribing(false);
        return;
      }

      const activated = await pollForActivation();
      if (activated) {
        haptics.success();
      } else {
        await loadData();
        haptics.success();
      }
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Unable to update payment. Please try again.',
        type: 'network',
      });
    } finally {
      setSubscribing(false);
    }
  };

  const handleReactivate = async () => {
    setSubscribing(true);
    try {
      await api.reactivateSubscription();
      await loadData();
      haptics.success();
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Unable to reactivate subscription. Please try again.',
        type: 'network',
      });
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancel = () => {
    if (currentSub?.tier === 'free') return;
    setShowCancelSheet(true);
  };

  const performCancel = async () => {
    setSubscribing(true);
    try {
      await api.cancelSubscription();
      await loadData();
      haptics.success();
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Unable to cancel subscription. Please try again or contact support.',
        type: 'network',
      });
    } finally {
      setSubscribing(false);
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
  const status = currentSub?.status;
  const cancelAtPeriodEnd = currentSub?.cancelAtPeriodEnd;

  // Status dot color
  const getStatusColor = () => {
    if (status === 'active' && !cancelAtPeriodEnd) return COLORS.success;
    if (status === 'past_due') return COLORS.warning;
    if (status === 'canceled' || cancelAtPeriodEnd) return COLORS.danger;
    return COLORS.success;
  };

  const getStatusLabel = () => {
    if (status === 'past_due') return 'Past Due';
    if (cancelAtPeriodEnd) return 'Cancelling';
    if (status === 'active') return 'Active';
    return 'Active';
  };

  // ── Plus user view ──
  if (isPlus) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <View style={styles.plusBadge}>
            <Ionicons name="star" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>You're on Plus!</Text>
          <Text style={styles.subtitle}>
            You have full access to all BorrowHood features.
          </Text>
        </View>

        {/* Past Due Banner */}
        {status === 'past_due' && (
          <View style={[styles.statusBanner, { backgroundColor: COLORS.warningMuted }]} testID="Subscription.banner.pastDue" accessibilityLabel="Payment past due warning" accessibilityRole="alert">
            <Ionicons name="warning-outline" size={18} color={COLORS.warning} />
            <Text style={[styles.statusBannerText, { color: COLORS.warning }]}>
              Your payment failed. Update your payment method to keep Plus.
            </Text>
          </View>
        )}

        {/* Cancelling Banner */}
        {cancelAtPeriodEnd && currentSub?.expiresAt && (
          <View style={[styles.statusBanner, { backgroundColor: COLORS.dangerMuted }]} testID="Subscription.banner.cancelling" accessibilityLabel="Subscription cancelling notice" accessibilityRole="alert">
            <Ionicons name="time-outline" size={18} color={COLORS.danger} />
            <Text style={[styles.statusBannerText, { color: COLORS.danger }]}>
              Your subscription ends on {new Date(currentSub.expiresAt).toLocaleDateString()}
            </Text>
          </View>
        )}

        <BlurCard style={styles.planCard}>
          <View style={styles.planCardContent}>
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>Plan</Text>
              <Text style={styles.planValue}>BorrowHood Plus</Text>
            </View>
            <View style={styles.planDivider} />
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>Status</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                <Text style={styles.planValue}>{getStatusLabel()}</Text>
              </View>
            </View>
            <View style={styles.planDivider} />
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>Price</Text>
              <Text style={styles.planValue}>$1/mo</Text>
            </View>
            {currentSub?.nextBillingDate && !cancelAtPeriodEnd && (
              <>
                <View style={styles.planDivider} />
                <View style={styles.planRow}>
                  <Text style={styles.planLabel}>Next billing</Text>
                  <Text style={styles.planValue}>
                    {new Date(currentSub.nextBillingDate).toLocaleDateString()}
                  </Text>
                </View>
              </>
            )}
            {currentSub?.startedAt && (
              <>
                <View style={styles.planDivider} />
                <View style={styles.planRow}>
                  <Text style={styles.planLabel}>Member since</Text>
                  <Text style={styles.planValue}>
                    {new Date(currentSub.startedAt).toLocaleDateString()}
                  </Text>
                </View>
              </>
            )}
          </View>
        </BlurCard>

        {/* Action buttons based on status */}
        {cancelAtPeriodEnd && (
          <HapticPressable
            style={styles.actionButton}
            onPress={handleReactivate}
            haptic="medium"
            testID="Subscription.button.reactivate"
            accessibilityLabel="Reactivate subscription"
            accessibilityRole="button"
          >
            <Text style={styles.actionButtonText}>Reactivate Subscription</Text>
          </HapticPressable>
        )}

        {status === 'past_due' && (
          <HapticPressable
            style={styles.actionButton}
            onPress={handleRetryPayment}
            haptic="medium"
            testID="Subscription.button.updatePayment"
            accessibilityLabel="Update payment method"
            accessibilityRole="button"
          >
            <Text style={styles.actionButtonText}>Update Payment</Text>
          </HapticPressable>
        )}

        {!cancelAtPeriodEnd && status !== 'past_due' && (
          <HapticPressable style={styles.cancelButton} onPress={handleCancel} haptic="medium" testID="Subscription.button.cancel" accessibilityLabel="Cancel subscription" accessibilityRole="button">
            <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
          </HapticPressable>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Subscriptions are billed monthly. Cancel anytime.
          </Text>
          <Text style={styles.footerText}>
            Need help? Contact support@borrowhood.com
          </Text>
        </View>

        <ActionSheet
          isVisible={showCancelSheet}
          onClose={() => setShowCancelSheet(false)}
          title="Cancel Subscription"
          message="Your subscription will remain active until the end of the billing period. After that, you'll be downgraded to the Free tier."
          actions={[
            {
              label: 'Cancel Subscription',
              destructive: true,
              onPress: performCancel,
            },
          ]}
          cancelLabel="Keep Subscription"
        />

        {subscribing && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.overlayText}>Processing...</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // Context-aware header text
  const headerTitle = source === 'onboarding'
    ? 'BorrowHood Plus'
    : source === 'town_browse'
      ? 'Explore Your Whole Town'
      : source === 'rental_listing'
        ? 'Start Earning From Your Items'
        : 'BorrowHood Plus';
  const headerSubtitle = source === 'onboarding'
    ? 'Step 1 of 2 — subscribe now, then verify your identity'
    : source === 'town_browse'
      ? 'Plus membership + identity verification required'
      : source === 'rental_listing'
        ? 'Plus membership + verification + payout setup required'
        : 'Unlock your whole town and start earning from your items.';

  // ── Free user: two-step upgrade flow ──
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Gate Stepper */}
      {source !== 'generic' && totalSteps && (
        <GateStepper currentStep={1} totalSteps={totalSteps} source={source} />
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{headerTitle}</Text>
        <Text style={styles.price}>
          {selectedPlan === 'annual' ? '$10/yr' : '$1/mo'}
        </Text>
        <Text style={styles.subtitle}>{headerSubtitle}</Text>
      </View>

      {/* Plan Selector */}
      <View style={styles.planSelector}>
        <HapticPressable
          style={[styles.planOption, selectedPlan === 'monthly' && styles.planOptionSelected]}
          onPress={() => setSelectedPlan('monthly')}
          haptic="light"
          testID="Subscription.plan.monthly"
          accessibilityLabel="Monthly plan"
          accessibilityRole="button"
        >
          <Text style={[styles.planOptionLabel, selectedPlan === 'monthly' && styles.planOptionLabelSelected]}>Monthly</Text>
          <Text style={[styles.planOptionPrice, selectedPlan === 'monthly' && styles.planOptionPriceSelected]}>$1/mo</Text>
        </HapticPressable>
        <HapticPressable
          style={[styles.planOption, selectedPlan === 'annual' && styles.planOptionSelected]}
          onPress={() => setSelectedPlan('annual')}
          haptic="light"
          testID="Subscription.plan.annual"
          accessibilityLabel="Annual plan"
          accessibilityRole="button"
        >
          <View style={styles.planSaveBadge}>
            <Text style={styles.planSaveText}>Save 17%</Text>
          </View>
          <Text style={[styles.planOptionLabel, selectedPlan === 'annual' && styles.planOptionLabelSelected]}>Annual</Text>
          <Text style={[styles.planOptionPrice, selectedPlan === 'annual' && styles.planOptionPriceSelected]}>$10/yr</Text>
        </HapticPressable>
      </View>

      {/* Features */}
      <BlurCard style={styles.featuresCard}>
        <View style={styles.featuresCardContent}>
          {PLUS_FEATURES.map((feature, idx) => (
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
            <Text style={styles.stepTitle}>Subscribe & Pay</Text>
            <Text style={styles.stepDescription}>
              Pay with card or Apple Pay to start your subscription.
            </Text>
            <HapticPressable
              style={[styles.stepButton, styles.stepButtonPrimary]}
              onPress={handleSubscribe}
              haptic="medium"
              testID="Subscription.button.subscribe"
              accessibilityLabel="Subscribe to Plus"
              accessibilityRole="button"
            >
              <Text style={styles.stepButtonText}>
                Subscribe — {selectedPlan === 'annual' ? '$10/yr' : '$1/mo'}
              </Text>
            </HapticPressable>
          </View>
        </View>

        {/* Step 2: Verify (shown for generic and onboarding) */}
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
                Verify Your Identity
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
          Subscriptions are billed monthly. Cancel anytime.
        </Text>
        <Text style={styles.footerText}>
          Need help? Contact support@borrowhood.com
        </Text>
      </View>

      {subscribing && (
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
  plusBadge: {
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
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Plan selector
  planSelector: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  planOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.separator,
    backgroundColor: COLORS.surface,
  },
  planOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  planOptionLabel: {
    ...TYPOGRAPHY.headline,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  planOptionLabelSelected: {
    color: COLORS.text,
  },
  planOptionPrice: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
  },
  planOptionPriceSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  planSaveBadge: {
    position: 'absolute',
    top: -10,
    right: -4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
  },
  planSaveText: {
    ...TYPOGRAPHY.caption2,
    color: '#fff',
    fontWeight: '700',
    fontSize: 10,
  },

  // Status banners
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.lg,
  },
  statusBannerText: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    flex: 1,
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
  stepLineComplete: {
    backgroundColor: COLORS.primary,
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

  // Plus plan card
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

  // Action button (reactivate / retry)
  actionButton: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  actionButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },

  // Cancel
  cancelButton: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.danger,
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
