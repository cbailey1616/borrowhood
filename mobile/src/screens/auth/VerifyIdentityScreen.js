import VerificationIntroduction from '../../components/VerificationIntroduction';
import StripeVerificationButton from '../../components/StripeVerificationButton';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HapticPressable from '../../components/HapticPressable';
import ActionSheet from '../../components/ActionSheet';
import { useAuth } from '../../context/AuthContext';
import { useError } from '../../context/ErrorContext';
import api from '../../services/api';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function VerifyIdentityScreen({ navigation, route }) {
  const { refreshUser } = useAuth();
  const { height, fontScale } = useWindowDimensions();
  const inlineActions = height < 500 || fontScale >= 1.4;
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
        showToast('You’re verified!', 'success');
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
          message: 'Tap "Verify through Stripe" to get started.',
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

  const actions = (
    <View style={styles.actionFooter}>
      <View style={styles.readableWidth}>
        <Text style={styles.verificationNote}>Free during launch</Text>
        <StripeVerificationButton onPress={handleStartVerification} loading={isLoading} />
        <HapticPressable style={styles.skipButton} onPress={handleSkipForNow} haptic="light">
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </HapticPressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.readableWidth}>
          <VerificationIntroduction />
          <HapticPressable
            style={styles.secondaryButton}
            onPress={handleCheckStatus}
            disabled={isLoading}
            haptic="light"
          >
            <Text style={styles.secondaryButtonText}>I've already verified</Text>
          </HapticPressable>
        </View>
        {inlineActions && actions}
      </ScrollView>
      {!inlineActions && actions}

      <ActionSheet
        isVisible={skipSheetVisible}
        onClose={() => setSkipSheetVisible(false)}
        title="Skip Verification?"
        message="You can explore now and verify later. Get verified to see who’s lending in Town borrow listings."
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  readableWidth: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  actionFooter: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight },
  verificationNote: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.sm },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, minHeight: 44, padding: SPACING.md, marginTop: SPACING.lg, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  skipButton: { minHeight: 44, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm, alignItems: 'center', justifyContent: 'center' },
  skipButtonText: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
});
