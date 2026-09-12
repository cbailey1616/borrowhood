import VerificationIntroduction from '../components/VerificationIntroduction';
import StripeVerificationButton from '../components/StripeVerificationButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, useWindowDimensions } from 'react-native';
import { ENABLE_PAYMENTS } from '../utils/config';
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
import { haptics } from '../utils/haptics';
import GateStepper from '../components/GateStepper';
import { isUserVerified } from '../utils/auth';

export default function IdentityVerificationScreen({ navigation, route }) {
  const source = route?.params?.source || 'generic';
  const insets = useSafeAreaInsets();
  const totalSteps = route?.params?.totalSteps;
  const { refreshUser } = useAuth();
  const { height, fontScale } = useWindowDimensions();
  const inlineActions = height < 500 || fontScale >= 1.4;
  const hasAutoChained = useRef(false);
  const { showError } = useError();
  const [status, setStatus] = useState(null); // none, pending, processing, requires_input, verified
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const result = await api.getVerificationStatus();
      setStatus(result.status);
      if (isUserVerified(result)) {
        await refreshUser();
        // Auto-chain if source is provided and we haven't already
        if (source !== 'generic' && !hasAutoChained.current) {
          hasAutoChained.current = true;
          if (source === 'onboarding') {
            navigation.navigate('OnboardingComplete');
          } else if (ENABLE_PAYMENTS && source === 'rental_listing') {
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

  if (loading || status === null) {
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
      } else if (ENABLE_PAYMENTS && source === 'rental_listing') {
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.iconContainer} testID="Identity.status.verified" accessibilityLabel="Verified" accessibilityRole="image">
            <View style={styles.successCircle}>
              <Ionicons name="shield-checkmark" size={48} color={COLORS.primary} />
            </View>
          </View>
          <Text style={styles.title}>You’re verified</Text>
          <Text style={styles.subtitle}>
            You’re ready to borrow across town.
          </Text>
          <HapticPressable
            style={styles.primaryButton}
            onPress={handleVerifiedDone}
            haptic="light"
          >
            <Text style={styles.primaryButtonText}>
              {ENABLE_PAYMENTS && source === 'rental_listing' ? 'Continue' : 'Done'}
            </Text>
          </HapticPressable>
        </ScrollView>
      </View>
    );
  }

  // Submitted — grace period active, but not yet fully verified
  if (status === 'submitted' || status === 'processing') {
    const handleContinue = () => {
      if (source === 'onboarding') {
        navigation.navigate('OnboardingComplete');
      } else if (ENABLE_PAYMENTS && source === 'rental_listing') {
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.iconContainer} testID="Identity.status.submitted" accessibilityLabel="Verification processing" accessibilityRole="image">
            <View style={[styles.successCircle, { backgroundColor: COLORS.warning + '20' }]}>
              <Ionicons name="time" size={48} color={COLORS.warning} />
            </View>
          </View>
          <Text style={styles.title}>Verification Processing</Text>
          <Text style={styles.subtitle}>
            Stripe is reviewing your verification. You can keep browsing and posting while you wait.
          </Text>
          <Text style={styles.graceNotice}>
            Your verified badge will appear once verification is complete.
          </Text>
          <HapticPressable
            style={styles.primaryButton}
            onPress={handleContinue}
            haptic="light"
          >
            <Text style={styles.primaryButtonText}>
              {ENABLE_PAYMENTS && source === 'rental_listing' ? 'Continue' : 'Start Exploring'}
            </Text>
          </HapticPressable>
        </ScrollView>
      </View>
    );
  }

  // Needs input / failed — show retry
  const needsRetry = status === 'requires_input';

  // Context-aware title/subtitle
  const getTitle = () => {
    if (needsRetry) return 'Verification Needs Attention';
    if (source === 'town_browse') return 'Verify to borrow across town';
    if (ENABLE_PAYMENTS && source === 'rental_listing') return 'Verify to List Items';
    return 'Verify to borrow across town';
  };

  const getSubtitle = () => {
    if (needsRetry) return 'Your previous verification attempt needs additional information. Please try again.';
    if (source === 'town_browse') return 'Verification helps keep sharing safer.';
    if (ENABLE_PAYMENTS && source === 'rental_listing') return 'Borrowers trust verified owners.';
    return 'Verification helps keep sharing safer.';
  };

  const actions = (
    <View style={[styles.actionFooter, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
      <View style={styles.readableWidth}>
        <Text style={styles.verificationNote}>Free during launch</Text>
        <StripeVerificationButton onPress={handleVerify} loading={starting} testID="Identity.button.verify" />
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
        >
          <Text style={styles.tertiaryButtonText}>Skip for now</Text>
        </HapticPressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {source !== 'generic' && totalSteps && (
        <GateStepper currentStep={2} totalSteps={totalSteps} source={source} />
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.introductionContent}>
        <View style={styles.readableWidth}>
          <VerificationIntroduction needsRetry={needsRetry} title={getTitle()} subtitle={getSubtitle()} />
        </View>
        {inlineActions && actions}
      </ScrollView>
      {!inlineActions && actions}
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
    flexGrow: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  introductionContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  readableWidth: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  actionFooter: { backgroundColor: COLORS.surface, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight },
  verificationNote: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.sm },
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
    marginBottom: SPACING.md,
  },
  graceNotice: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.warning,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.button,
    fontSize: 16,
  },
  tertiaryButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  tertiaryButtonText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.footnote,
  },
});
