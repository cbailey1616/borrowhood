import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Linking,
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

export default function VerifyIdentityScreen({ navigation }) {
  const { refreshUser } = useAuth();
  const { showError, showToast } = useError();
  const [isLoading, setIsLoading] = useState(false);
  const [skipSheetVisible, setSkipSheetVisible] = useState(false);

  const handleStartVerification = async () => {
    setIsLoading(true);
    try {
      const response = await api.startIdentityVerification();
      // Open Stripe Identity verification in browser
      await Linking.openURL(response.verificationUrl);
    } catch (error) {
      showError({
        type: 'verification',
        title: 'Verification Error',
        message: error.message || 'Unable to start verification. Please try again.',
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
        showToast('Identity verified! Welcome to Borrowhood.', 'success');
        navigation.goBack();
      } else if (result.status === 'processing') {
        showError({
          title: 'Verification Processing',
          message: 'Your verification is still being processed. This usually takes a few minutes. Please check back later.',
          primaryAction: 'OK',
        });
      } else {
        showError({
          title: 'Not Yet Verified',
          message: 'We haven\'t received your verification yet. Please tap "Verify with ID" to start the process.',
          primaryAction: 'OK',
        });
      }
    } catch (error) {
      showError({
        type: 'network',
        message: error.message || 'Unable to check verification status. Please try again.',
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
