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

const FREE_FEATURES = [
  { icon: 'home-outline', text: 'Browse your neighborhood' },
  { icon: 'people-outline', text: 'Add friends & neighbors' },
  { icon: 'pricetag-outline', text: 'List free items to share' },
  { icon: 'chatbubble-outline', text: 'Message borrowers' },
];

const PLUS_FEATURES = [
  { icon: 'earth-outline', text: 'Browse your whole town' },
  { icon: 'cash-outline', text: 'Charge rental fees & earn' },
  { icon: 'shield-checkmark-outline', text: 'Verified badge' },
  { icon: 'star-outline', text: 'Priority in search results' },
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
            // Auto-advance if they just subscribed
            haptics.success();
            try { await api.updateOnboardingStep(4); } catch (e) {}
            navigation.navigate('OnboardingComplete');
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
    navigation.navigate('OnboardingSubscription');
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
          Start free and upgrade anytime
        </Text>

        <View style={styles.plansRow}>
          {/* Free Plan */}
          <BlurCard style={styles.planCard}>
            <Text style={styles.planName}>Free</Text>
            <Text style={styles.planPrice}>$0</Text>
            <Text style={styles.planPeriod}>forever</Text>
            <View style={styles.featuresList}>
              {FREE_FEATURES.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name={f.icon} size={18} color={COLORS.primary} />
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </BlurCard>

          {/* Plus Plan */}
          <BlurCard style={[styles.planCard, styles.plusCard]}>
            <View style={styles.plusBadge}>
              <Text style={styles.plusBadgeText}>POPULAR</Text>
            </View>
            <Text style={styles.planName}>Plus</Text>
            <Text style={styles.planPrice}>$1</Text>
            <Text style={styles.planPeriod}>per month</Text>
            <View style={styles.featuresList}>
              {PLUS_FEATURES.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name={f.icon} size={18} color={COLORS.warning} />
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </BlurCard>
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
  plansRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  planCard: {
    flex: 1,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  plusCard: {
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
  },
  plusBadge: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
    marginBottom: SPACING.sm,
  },
  plusBadgeText: {
    ...TYPOGRAPHY.caption,
    color: '#fff',
    fontWeight: '700',
  },
  planName: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  planPrice: {
    ...TYPOGRAPHY.largeTitle,
    color: COLORS.text,
  },
  planPeriod: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  featuresList: {
    gap: SPACING.md,
    alignSelf: 'stretch',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    flex: 1,
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
