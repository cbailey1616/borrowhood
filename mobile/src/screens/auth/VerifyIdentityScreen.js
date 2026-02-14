import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import ActionSheet from '../../components/ActionSheet';
import BlurCard from '../../components/BlurCard';
import { useAuth } from '../../context/AuthContext';
import { useError } from '../../context/ErrorContext';
import api from '../../services/api';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function VerifyIdentityScreen({ navigation, route }) {
  const fromSubscription = route.params?.fromSubscription;
  const { refreshUser } = useAuth();
  const { showError, showToast } = useError();
  const [isLoading, setIsLoading] = useState(false);
  const [skipSheetVisible, setSkipSheetVisible] = useState(false);
  const hasOpenedStripe = useRef(false);

  // Auto-check verification when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && hasOpenedStripe.current) {
        hasOpenedStripe.current = false;
        handleCheckStatus();
      }
    });
    return () => subscription.remove();
  }, []);

  // Also handle deep link return
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url?.includes('verification-complete')) {
        handleCheckStatus();
      }
    });
    return () => subscription.remove();
  }, []);

  const handleStartVerification = async () => {
    setIsLoading(true);
    try {
      const response = await api.startIdentityVerification();
      // Open Stripe Identity verification in browser
      hasOpenedStripe.current = true;
      await Linking.openURL(response.verificationUrl);
    } catch (error) {
      showError({
        type: 'verification',
        title: 'Couldn\'t Start Verification',
        message: error.message || 'Something went wrong. Please check your connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setIsLoading(true);
    try {
      const result = await api.checkVerification();
      if (result.verified) {
        await refreshUser();
        haptics.success();
        showToast('Identity verified!', 'success');
        navigation.goBack();
      } else if (result.status === 'processing') {
        showError({
          title: 'Still Processing',
          message: 'Your verification is being reviewed — this usually takes just a few minutes. We\'ll let you know when it\'s done.',
          primaryAction: 'OK',
        });
      } else {
        showError({
          title: 'Not Started Yet',
          message: 'Looks like verification hasn\'t been completed. Tap "Verify with ID" to get started — it only takes a minute.',
          primaryAction: 'OK',
        });
      }
    } catch (error) {
      showError({
        type: 'network',
        message: error.message || 'Couldn\'t check your verification status. Please check your connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipForNow = () => {
    setSkipSheetVisible(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="shield-checkmark" size={80} color={COLORS.primary} />
        </View>

        <Text style={styles.title}>Verify Your Identity</Text>
        <Text style={styles.subtitle}>
          To keep our community safe, we verify all members with a valid government ID.
          {fromSubscription ? ' We\'ll notify you once your verification is complete — it usually only takes a few minutes.' : ''}
        </Text>

        <BlurCard style={styles.benefits}>
          <View style={styles.benefitsInner}>
            <BenefitItem
              icon="lock-closed"
              text="Your data is encrypted and secure"
            />
            <BenefitItem
              icon="people"
              text="Build trust with your neighbors"
            />
            <BenefitItem
              icon="checkmark-circle"
              text="Required to borrow or lend items"
            />
          </View>
        </BlurCard>

        <View style={styles.buttons}>
          <HapticPressable
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleStartVerification}
            disabled={isLoading}
            haptic="medium"
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="card" size={20} color="#fff" style={{ marginRight: SPACING.sm }} />
                <Text style={styles.primaryButtonText}>Verify with ID</Text>
              </>
            )}
          </HapticPressable>

          <HapticPressable
            style={styles.secondaryButton}
            onPress={handleCheckStatus}
            disabled={isLoading}
            haptic="light"
          >
            <Text style={styles.secondaryButtonText}>I've already verified</Text>
          </HapticPressable>

          <HapticPressable
            style={styles.skipButton}
            onPress={handleSkipForNow}
            haptic="light"
          >
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </HapticPressable>
        </View>
      </View>

      <ActionSheet
        isVisible={skipSheetVisible}
        onClose={() => setSkipSheetVisible(false)}
        title="Skip Verification?"
        message="You can browse items, but you won't be able to borrow or lend until your identity is verified."
        actions={[
          {
            label: 'Skip',
            onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }),
          },
        ]}
        cancelLabel="Cancel"
      />
    </SafeAreaView>
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
  content: {
    flex: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
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
  buttons: {
    gap: SPACING.md,
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
  skipButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  skipButtonText: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.footnote,
  },
});
