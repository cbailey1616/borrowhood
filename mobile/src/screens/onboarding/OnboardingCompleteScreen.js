import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function OnboardingCompleteScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const confettiRef = useRef(null);

  const [neighborhoodName, setNeighborhoodName] = useState(null);
  const [isFounder, setIsFounder] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    fetchUserDetails();
    // Fire confetti on mount
    haptics.success();
  }, []);

  const fetchUserDetails = async () => {
    try {
      // Refresh user to get latest isFounder status
      const updated = await refreshUser();
      setIsFounder(updated?.isFounder || false);

      // Get joined communities to show neighborhood name
      const communities = await api.getCommunities({ member: 'true' });
      if (communities.length > 0) {
        setNeighborhoodName(communities[0].name);
      }
    } catch (error) {
      console.warn('Failed to fetch user details:', error);
    }
  };

  const handleStartExploring = async () => {
    setIsCompleting(true);
    haptics.success();
    try {
      await api.completeOnboarding();
      await refreshUser();
      // RootNavigator will auto-switch to MainNavigator when onboardingCompleted becomes true
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      // Try again — this is critical
      try {
        await api.completeOnboarding();
        await refreshUser();
      } catch (e) {
        // Force a refresh anyway — user should not be stuck
        await refreshUser();
      }
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.xl }]}>
      <ConfettiCannon
        ref={confettiRef}
        count={80}
        origin={{ x: -10, y: 0 }}
        fadeOut
        autoStart
        colors={[COLORS.primary, COLORS.primaryLight, COLORS.warning, '#fff']}
      />

      <View style={styles.content}>
        <View style={styles.checkContainer}>
          <Ionicons name="checkmark-circle" size={80} color={COLORS.primary} />
        </View>

        <Text style={styles.title}>You're All Set!</Text>

        {neighborhoodName ? (
          <Text style={styles.subtitle}>
            Welcome to {neighborhoodName}!
            {isFounder ? '\nYou\'re the founding member.' : ''}
          </Text>
        ) : (
          <Text style={styles.subtitle}>
            Your BorrowHood is ready to explore.
          </Text>
        )}

        {isFounder && (
          <View style={styles.founderBadge}>
            <Ionicons name="flag" size={16} color={COLORS.warning} />
            <Text style={styles.founderText}>Neighborhood Founder</Text>
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.lg }]}>
        <HapticPressable
          style={styles.primaryButton}
          onPress={handleStartExploring}
          disabled={isCompleting}
          haptic="success"
          testID="Onboarding.Complete.startExploring"
        >
          <Text style={styles.primaryButtonText}>
            {isCompleting ? 'Setting up...' : 'Start Exploring'}
          </Text>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  checkContainer: {
    marginBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.largeTitle,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  founderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.warning + '20',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    marginTop: SPACING.xl,
  },
  founderText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.warning,
  },
  footer: {
    paddingHorizontal: SPACING.xl,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...TYPOGRAPHY.headline,
    fontSize: 18,
    color: '#fff',
  },
});
