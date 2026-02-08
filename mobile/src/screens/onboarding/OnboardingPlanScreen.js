import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import BlurCard from '../../components/BlurCard';
import OnboardingProgress from '../../components/OnboardingProgress';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

const COMPARISON_ROWS = [
  { feature: 'Lend & borrow from friends', free: true, plus: true },
  { feature: 'Lend & borrow from neighbors', free: true, plus: true },
  { feature: 'Add friends & message', free: true, plus: true },
  { feature: 'Lend & borrow from entire town', free: false, plus: true },
  { feature: 'Charge rental fees & earn', free: false, plus: true },
  { feature: 'Stripe-verified for trust', free: false, plus: true },
  { feature: 'Priority in search results', free: false, plus: true },
];

export default function OnboardingPlanScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();

  // Check if user subscribed when returning from SubscriptionScreen
  useFocusEffect(
    useCallback(() => {
      const checkSubscription = async () => {
        try {
          const updated = await refreshUser();
          if (updated?.subscriptionTier === 'plus') {
            // Auto-advance to verification step
            haptics.success();
            try { await api.updateOnboardingStep(4); } catch (e) {}
            navigation.navigate('OnboardingVerification', { source: 'onboarding', totalSteps: 2 });
          }
        } catch (e) {}
      };
      checkSubscription();
    }, [])
  );

  const handleStartFree = async () => {
    haptics.medium();
    try {
      await api.updateOnboardingStep(4);
    } catch (e) {}
    navigation.navigate('OnboardingComplete');
  };

  const handleGoPlus = () => {
    haptics.medium();
    navigation.navigate('OnboardingSubscription', { source: 'onboarding', totalSteps: 2 });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.xl }]}>
      <OnboardingProgress currentStep={4} />

      <HapticPressable
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        haptic="light"
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
      </HapticPressable>

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
        <Text style={styles.title}>Choose Your Plan</Text>
        <Text style={styles.subtitle}>
          Free lets you lend and borrow from friends and neighbors. Plus opens up your entire town with verified trust.
        </Text>

        {/* Plan header row */}
        <View style={styles.planHeaders}>
          <View style={styles.featureLabelCol} />
          <View style={styles.planCol}>
            <Text style={styles.planName}>Free</Text>
            <Text style={styles.planPrice}>$0</Text>
            <Text style={styles.planPeriod}>forever</Text>
          </View>
          <View style={[styles.planCol, styles.plusCol]}>
            <View style={styles.plusBadge}>
              <Text style={styles.plusBadgeText}>POPULAR</Text>
            </View>
            <Text style={styles.planName}>Plus</Text>
            <Text style={styles.planPrice}>$1</Text>
            <Text style={styles.planPeriod}>/month</Text>
          </View>
        </View>

        {/* Comparison rows */}
        <BlurCard style={styles.comparisonCard}>
          {COMPARISON_ROWS.map((row, i) => (
            <View
              key={i}
              style={[
                styles.comparisonRow,
                i < COMPARISON_ROWS.length - 1 && styles.comparisonRowBorder,
              ]}
            >
              <Text style={styles.featureLabel}>{row.feature}</Text>
              <View style={styles.checkCol}>
                {row.free ? (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                ) : (
                  <Ionicons name="close-circle" size={20} color={COLORS.gray[700]} />
                )}
              </View>
              <View style={styles.checkCol}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.warning} />
              </View>
            </View>
          ))}
        </BlurCard>

        {/* Plus requirements note */}
        <View style={styles.plusNote}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.plusNoteText}>
            Plus includes identity verification through Stripe so every lender and borrower is trustworthy.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.lg }]}>
        <HapticPressable
          style={styles.plusButton}
          onPress={handleGoPlus}
          haptic="medium"
          testID="Onboarding.Plan.goPlus"
        >
          <Ionicons name="star" size={18} color="#fff" />
          <Text style={styles.plusButtonText}>Go Plus — $1/mo</Text>
        </HapticPressable>
        <HapticPressable
          style={styles.freeButton}
          onPress={handleStartFree}
          haptic="light"
          testID="Onboarding.Plan.startFree"
        >
          <Text style={styles.freeButtonText}>Start with Free</Text>
        </HapticPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: SPACING.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: SPACING.xl,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
  },
  planHeaders: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    alignItems: 'flex-end',
  },
  featureLabelCol: {
    flex: 1,
  },
  planCol: {
    width: 72,
    alignItems: 'center',
  },
  plusCol: {
    width: 72,
  },
  plusBadge: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
    marginBottom: SPACING.xs,
    alignSelf: 'center',
  },
  plusBadgeText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  planName: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  planPrice: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    textAlign: 'center',
  },
  planPeriod: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  comparisonCard: {
    padding: 0,
    overflow: 'hidden',
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  comparisonRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  featureLabel: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.text,
    flex: 1,
  },
  checkCol: {
    width: 72,
    alignItems: 'center',
  },
  plusNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  plusNoteText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  plusButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  plusButtonText: {
    ...TYPOGRAPHY.headline,
    fontSize: 18,
    color: '#fff',
  },
  freeButton: {
    padding: SPACING.md,
    alignItems: 'center',
  },
  freeButtonText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});
