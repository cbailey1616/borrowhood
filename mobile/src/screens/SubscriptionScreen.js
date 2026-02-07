import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';

const PLUS_FEATURES = [
  'Borrow from anyone in your town',
  'Charge rental fees for your items',
  'Priority placement in search results',
  'Support local sharing infrastructure',
];

export default function SubscriptionScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const { showError } = useError();
  const [currentSub, setCurrentSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [showCancelSheet, setShowCancelSheet] = useState(false);

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

  // Refresh data when screen comes back into focus (e.g. after verification)
  useFocusEffect(
    useCallback(() => {
      refreshUser();
      loadData();
    }, [])
  );

  const handleSubscribe = async (paymentMethodId) => {
    setSubscribing(true);
    try {
      await api.subscribe(paymentMethodId);
      await loadData();
      await refreshUser();
      haptics.success();
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Unable to complete subscription. Please check your payment method and try again.',
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
  const isPaid = isPlus; // subscription active means they've paid

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

        {currentSub?.expiresAt && (
          <View style={styles.expiryBanner}>
            <Ionicons name="time-outline" size={18} color={COLORS.warning} />
            <Text style={styles.expiryText}>
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
              <Text style={styles.planLabel}>Price</Text>
              <Text style={styles.planValue}>$1/mo</Text>
            </View>
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

        {!currentSub?.expiresAt && (
          <HapticPressable style={styles.cancelButton} onPress={handleCancel} haptic="medium">
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
      </ScrollView>
    );
  }

  // ── Free user: two-step upgrade flow ──
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>BorrowHood Plus</Text>
        <Text style={styles.price}>$1/mo</Text>
        <Text style={styles.subtitle}>
          Unlock your whole town and start earning from your items.
        </Text>
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
            {isPaid ? (
              <View style={[styles.stepCircle, styles.stepCircleComplete]}>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </View>
            ) : (
              <View style={[styles.stepCircle, styles.stepCircleActive]}>
                <Text style={styles.stepNumber}>1</Text>
              </View>
            )}
            <View style={[styles.stepLine, isPaid && styles.stepLineComplete]} />
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Subscribe & Pay</Text>
            <Text style={styles.stepDescription}>
              Add a payment method and start your $1/mo subscription.
            </Text>
            {isPaid ? (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                <Text style={styles.verifiedText}>Subscribed</Text>
              </View>
            ) : (
              <HapticPressable
                style={[styles.stepButton, styles.stepButtonPrimary]}
                onPress={() => {
                  navigation.navigate('PaymentMethods', {
                    onSelectMethod: (paymentMethodId) => handleSubscribe(paymentMethodId),
                    selectMode: true,
                  });
                }}
                haptic="medium"
              >
                <Text style={styles.stepButtonText}>Subscribe — $1/mo</Text>
              </HapticPressable>
            )}
          </View>
        </View>

        {/* Step 2: Verify */}
        <View style={[styles.step, !isPaid && styles.stepDimmed]}>
          <View style={styles.stepIndicator}>
            {isVerified ? (
              <View style={[styles.stepCircle, styles.stepCircleComplete]}>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </View>
            ) : (
              <View style={[
                styles.stepCircle,
                isPaid ? styles.stepCircleActive : styles.stepCircleInactive,
              ]}>
                <Text style={[
                  styles.stepNumber,
                  !isPaid && styles.stepNumberInactive,
                ]}>2</Text>
              </View>
            )}
          </View>
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, !isPaid && styles.stepTitleDimmed]}>
              Verify Your Identity
            </Text>
            <Text style={[styles.stepDescription, !isPaid && styles.stepDescriptionDimmed]}>
              Quick identity check to keep the community safe.{'\n'}We'll notify you once verification is complete — it usually only takes a few minutes.
            </Text>
            {isVerified ? (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : (
              <HapticPressable
                style={[styles.stepButton, !isPaid && styles.stepButtonDisabled]}
                onPress={() => {
                  if (!isPaid) return;
                  navigation.navigate('VerifyIdentity', { fromSubscription: true });
                }}
                disabled={!isPaid}
                haptic="medium"
              >
                <Text style={styles.stepButtonText}>Verify Now</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </HapticPressable>
            )}
          </View>
        </View>
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

  // Expiry banner
  expiryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.warning + '20',
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.lg,
  },
  expiryText: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.warning,
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
