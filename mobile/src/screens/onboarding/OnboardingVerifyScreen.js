import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { presentIdentityVerificationSheet } from '@stripe/stripe-identity-react-native';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import OnboardingProgress from '../../components/OnboardingProgress';
import { useAuth } from '../../context/AuthContext';
import { useError } from '../../context/ErrorContext';
import { haptics } from '../../utils/haptics';
import api from '../../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function OnboardingVerifyScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();
  const { showError } = useError();
  const [isStarting, setIsStarting] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [alreadyVerified, setAlreadyVerified] = useState(false);

  // Check if already verified on mount
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const result = await api.getVerificationStatus();
      if (result.verified || result.status === 'submitted' || result.status === 'processing') {
        setAlreadyVerified(true);
      }
    } catch (e) {
      // Non-blocking — just show the verify screen
    } finally {
      setIsChecking(false);
    }
  };

  const handleVerify = async () => {
    setIsStarting(true);
    try {
      const { sessionId, ephemeralKeySecret } = await api.createVerificationSession();

      const brandLogo = Image.resolveAssetSource(require('../../../assets/logo.png'));
      const { status, error } = await presentIdentityVerificationSheet({
        sessionId,
        ephemeralKeySecret,
        brandLogo,
      });

      if (error) {
        if (error.code === 'FlowCanceled') {
          setIsStarting(false);
          return;
        }
        throw new Error(error.message);
      }

      if (status === 'FlowCompleted') {
        haptics.success();
        // Trigger grace period + refresh user
        try {
          await api.getVerificationStatus();
          await refreshUser();
        } catch (e) {}
        goToComplete();
      }
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Couldn\'t start verification. Please check your connection and try again.',
        type: 'network',
      });
    } finally {
      setIsStarting(false);
    }
  };

  const goToComplete = useCallback(async () => {
    haptics.medium();
    try { await api.updateOnboardingStep(4); } catch (e) {}
    navigation.navigate('OnboardingComplete');
  }, [navigation]);

  if (isChecking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + SPACING.xl }]}>
        <OnboardingProgress currentStep={4} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  // If already verified, auto-advance
  if (alreadyVerified) {
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

        <View style={styles.content}>
          <View style={styles.successCircle}>
            <Ionicons name="shield-checkmark" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Already Verified</Text>
          <Text style={styles.subtitle}>
            Your identity has been verified. You're all set to borrow, lend, and browse town-wide listings.
          </Text>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <HapticPressable
            style={styles.primaryButton}
            onPress={goToComplete}
            haptic="medium"
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </HapticPressable>
        </View>
      </View>
    );
  }

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

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="shield-checkmark" size={48} color={COLORS.primary} />
        </View>

        <Text style={styles.title}>Verify Your Identity</Text>
        <Text style={styles.subtitle}>
          ID verification is required to unlock town-level access and complete rentals on BorrowHood.
        </Text>

        {/* What you can do without verification */}
        <View style={styles.tierCard}>
          <View style={styles.tierHeader}>
            <Text style={styles.tierEmoji}>🏘️</Text>
            <View style={styles.tierHeaderText}>
              <Text style={styles.tierTitle}>Without Verification</Text>
              <Text style={styles.tierScope}>Friends & Neighborhood only</Text>
            </View>
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>NOW</Text>
            </View>
          </View>
          <Text style={styles.tierDescription}>Browse listings from friends and neighbors, send messages, and add friends.</Text>
        </View>

        {/* What verification unlocks */}
        <View style={[styles.tierCard, styles.tierCardHighlight]}>
          <View style={styles.tierHeader}>
            <Text style={styles.tierEmoji}>🏛️</Text>
            <View style={styles.tierHeaderText}>
              <Text style={[styles.tierTitle, { color: COLORS.greenText }]}>With Verification</Text>
              <Text style={[styles.tierScope, { color: COLORS.greenTextMuted }]}>Full town-wide access</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={12} color={COLORS.primary} />
            </View>
          </View>
          <View style={styles.unlocksList}>
            <UnlockItem text="Browse & connect with your entire town" />
            <UnlockItem text="Borrow and lend items with secure payments" />
            <UnlockItem text="Build trust with a verified badge" />
          </View>
        </View>

        <View style={styles.trustRow}>
          <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} />
          <Text style={styles.trustText}>
            Powered by Stripe. Your data is encrypted and never shared.
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.lg }]}>
        <HapticPressable
          style={[styles.verifyButton, isStarting && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={isStarting}
          haptic="medium"
        >
          {isStarting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card" size={20} color="#fff" style={{ marginRight: SPACING.sm }} />
              <Text style={styles.verifyButtonText}>Verify with ID</Text>
            </>
          )}
        </HapticPressable>

        <HapticPressable
          style={styles.skipButton}
          onPress={goToComplete}
          haptic="light"
        >
          <Text style={styles.skipButtonText}>I'll do this later</Text>
        </HapticPressable>
      </View>
    </View>
  );
}

function UnlockItem({ text }) {
  return (
    <View style={styles.unlockRow}>
      <Ionicons name="checkmark" size={16} color={COLORS.primary} />
      <Text style={styles.unlockText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
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
    lineHeight: 22,
    marginBottom: SPACING.xxl,
    maxWidth: 280,
  },
  tierCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  tierCardHighlight: {
    backgroundColor: COLORS.greenBg,
    borderColor: COLORS.greenBorder,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  tierEmoji: {
    fontSize: 22,
  },
  tierHeaderText: {
    flex: 1,
  },
  tierTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    fontSize: 15,
  },
  tierScope: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  freeBadge: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  freeBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontSize: 10,
  },
  verifiedBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierDescription: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 18,
  },
  unlocksList: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  unlockText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.greenText,
    flex: 1,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  trustText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    flex: 1,
  },
  footer: {
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  verifyButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  verifyButtonText: {
    ...TYPOGRAPHY.headline,
    fontSize: 18,
    color: '#fff',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...TYPOGRAPHY.headline,
    fontSize: 18,
    color: '#fff',
  },
  skipButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  skipButtonText: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.footnote,
  },
});
