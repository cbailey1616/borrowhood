import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { presentIdentityVerificationSheet } from '@stripe/stripe-identity-react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';
import GateStepper from '../components/GateStepper';

export default function IdentityVerificationScreen({ navigation, route }) {
  const source = route?.params?.source || 'generic';
  const totalSteps = route?.params?.totalSteps;
  const { refreshUser } = useAuth();
  const hasAutoChained = useRef(false);
  const { showError } = useError();
  const [status, setStatus] = useState(null); // none, pending, processing, requires_input, verified
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const result = await api.getVerificationStatus();
      setStatus(result.status);
      if (result.verified) {
        await refreshUser();
        // Auto-chain if source is provided and we haven't already
        if (source !== 'generic' && !hasAutoChained.current) {
          hasAutoChained.current = true;
          if (source === 'onboarding') {
            navigation.navigate('OnboardingComplete');
          } else if (source === 'rental_listing') {
            navigation.replace('SetupPayout', { source, totalSteps });
          } else if (source === 'town_browse') {
            navigation.popToTop();
          }
        }
      }
    } catch (err) {
      console.error('Failed to load verification status:', err);
      setStatus('none');
    } finally {
      setLoading(false);
    }
  }, [source, totalSteps, navigation, refreshUser]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleVerify = async () => {
    setStarting(true);
    try {
      // Get session credentials from server
      const { sessionId, ephemeralKeySecret } = await api.createVerificationSession();

      // Launch native Stripe Identity sheet
      const brandLogo = Image.resolveAssetSource(require('../../assets/logo.png'));
      const { status: resultStatus, error } = await presentIdentityVerificationSheet({
        sessionId,
        ephemeralKeySecret,
        brandLogo,
      });

      if (error) {
        if (error.code === 'FlowCanceled') {
          setStarting(false);
          return;
        }
        throw new Error(error.message);
      }

      // Check result
      if (resultStatus === 'FlowCompleted') {
        haptics.success();
        setStatus('submitted');

        // Trigger grace period on server + refresh auth context
        try {
          await api.getVerificationStatus();
          await refreshUser();
        } catch (e) {
          // Grace will be set on next status check — non-blocking
          console.warn('Post-submit status check failed:', e);
        }
      }
    } catch (err) {
      haptics.error();
      showError({
        message: err.message || 'Couldn\'t start verification right now. Please check your connection and try again.',
        type: 'network',
      });
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Already verified
  if (status === 'verified') {
    const handleVerifiedDone = () => {
      if (source === 'onboarding') {
        navigation.navigate('OnboardingComplete');
      } else if (source === 'rental_listing') {
        navigation.replace('SetupPayout', { source, totalSteps });
      } else if (source === 'town_browse') {
        navigation.popToTop();
      } else {
        navigation.goBack();
      }
    };

    return (
      <View style={styles.container}>
        {source !== 'generic' && totalSteps && (
          <GateStepper currentStep={2} totalSteps={totalSteps} source={source} />
        )}
        <View style={styles.content}>
          <View style={styles.iconContainer} testID="Identity.status.verified" accessibilityLabel="Identity verified" accessibilityRole="image">
            <View style={styles.successCircle}>
              <Ionicons name="shield-checkmark" size={48} color={COLORS.primary} />
            </View>
          </View>
          <Text style={styles.title}>Identity Verified</Text>
          <Text style={styles.subtitle}>
            Your identity has been verified. You can now borrow and lend items in your community.
          </Text>
          <HapticPressable
            style={styles.primaryButton}
            onPress={handleVerifiedDone}
            haptic="light"
          >
            <Text style={styles.primaryButtonText}>
              {source === 'rental_listing' ? 'Continue' : 'Done'}
            </Text>
          </HapticPressable>
        </View>
      </View>
    );
  }

  // Submitted — treat as verified (grace period active behind the scenes)
  if (status === 'submitted' || status === 'processing') {
    const handleContinue = () => {
      if (source === 'onboarding') {
        navigation.navigate('OnboardingComplete');
      } else if (source === 'rental_listing') {
        navigation.replace('SetupPayout', { source, totalSteps });
      } else if (source === 'town_browse') {
        navigation.popToTop();
      } else {
        navigation.goBack();
      }
    };

    return (
      <View style={styles.container}>
        {source !== 'generic' && totalSteps && (
          <GateStepper currentStep={2} totalSteps={totalSteps} source={source} />
        )}
        <View style={styles.content}>
          <View style={styles.iconContainer} testID="Identity.status.submitted" accessibilityLabel="Identity verified" accessibilityRole="image">
            <View style={styles.successCircle}>
              <Ionicons name="shield-checkmark" size={48} color={COLORS.primary} />
            </View>
          </View>
          <Text style={styles.title}>Identity Verified</Text>
          <Text style={styles.subtitle}>
            Your identity has been verified. You can now borrow and lend items across your entire town.
          </Text>
          <HapticPressable
            style={styles.primaryButton}
            onPress={handleContinue}
            haptic="light"
          >
            <Text style={styles.primaryButtonText}>
              {source === 'rental_listing' ? 'Continue' : 'Start Exploring'}
            </Text>
          </HapticPressable>
        </View>
      </View>
    );
  }

  // Needs input / failed — show retry
  const needsRetry = status === 'requires_input';

  // Context-aware title/subtitle
  const getTitle = () => {
    if (needsRetry) return 'Verification Needs Attention';
    if (source === 'town_browse') return 'Verify to Browse Town-Wide';
    if (source === 'rental_listing') return 'Verify to List Rentals';
    return 'Verify Your Identity';
  };

  const getSubtitle = () => {
    if (needsRetry) return 'Your previous verification attempt needs additional information. Please try again.';
    if (source === 'town_browse') return 'This keeps your community safe and real.';
    if (source === 'rental_listing') return 'Renters trust verified owners.';
    return 'To keep our community safe, we verify all members with a valid government ID and selfie.';
  };

  return (
    <View style={styles.container}>
      {source !== 'generic' && totalSteps && (
        <GateStepper currentStep={2} totalSteps={totalSteps} source={source} />
      )}
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={needsRetry ? 'alert-circle' : 'shield-checkmark'}
            size={80}
            color={needsRetry ? COLORS.warning : COLORS.primary}
          />
        </View>

        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>

        <BlurCard style={styles.benefits}>
          <View style={styles.benefitsInner}>
            <BenefitItem icon="lock-closed" text="Your data is encrypted and secure" />
            <BenefitItem icon="people" text="Build trust with your neighbors" />
            <BenefitItem icon="checkmark-circle" text="Required to borrow or lend items" />
          </View>
        </BlurCard>

        <HapticPressable
          style={[styles.primaryButton, starting && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={starting}
          haptic="medium"
          testID="Identity.button.verify"
          accessibilityLabel="Verify your identity"
          accessibilityRole="button"
        >
          {starting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card" size={20} color="#fff" style={{ marginRight: SPACING.sm }} />
              <Text style={styles.primaryButtonText}>
                {needsRetry ? 'Try Again' : 'Verify with ID'}
              </Text>
            </>
          )}
        </HapticPressable>

        <HapticPressable
          style={styles.tertiaryButton}
          onPress={() => {
            if (source === 'onboarding') {
              navigation.navigate('OnboardingComplete');
            } else {
              navigation.goBack();
            }
          }}
          haptic="light"
          testID="Identity.button.skipForNow"
          accessibilityLabel="Skip for now"
          accessibilityRole="button"
        >
          <Text style={styles.tertiaryButtonText}>
            {source !== 'generic' ? "I'll do this later" : 'Skip for now'}
          </Text>
        </HapticPressable>
      </View>
    </View>
  );
}

function BenefitItem({ icon, text }) {
  return (
    <View style={styles.benefitItem}>
      <Ionicons name={icon} size={20} color={COLORS.secondary} />
      <Text style={styles.benefitText}>{text}</Text>
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
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
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
    lineHeight: 24,
    marginBottom: SPACING.xxl,
  },
  benefits: {
    marginBottom: SPACING.xxl,
    padding: SPACING.xl - SPACING.xs,
  },
  benefitsInner: {
    gap: SPACING.lg,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  benefitText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
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
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.separator,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.button,
    fontSize: 16,
  },
  tertiaryButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  tertiaryButtonText: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.footnote,
  },
});
