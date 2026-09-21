import VerificationIntroduction from '../../components/VerificationIntroduction';
import VerificationPurchaseActions from '../../components/VerificationPurchaseActions';
import useVerificationOffer from '../../hooks/useVerificationOffer';
import useNavigationTask from '../../hooks/useNavigationTask';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HapticPressable from '../../components/HapticPressable';
import ActionSheet from '../../components/ActionSheet';
import { useAuth } from '../../context/AuthContext';
import { useError } from '../../context/ErrorContext';
import api from '../../services/api';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';
import { isUserVerified } from '../../utils/auth';

export default function VerifyIdentityScreen({ navigation, route }) {
  const { user, refreshUser } = useAuth();
  const startNavigationTask = useNavigationTask(navigation, `${user?.id || ''}:${route?.params?.source || ''}`);
  const purchase = useVerificationOffer(navigation, startNavigationTask, user?.id);
  const { height, fontScale } = useWindowDimensions();
  const inlineActions = height < 500 || fontScale >= 1.4;
  const { showError, showToast } = useError();
  const [isLoading, setIsLoading] = useState(false);
  const [skipSheetVisible, setSkipSheetVisible] = useState(false);
  const checkingStatus = useRef(null);

  useEffect(() => {
    const resetStaleCheck = () => {
      if (checkingStatus.current && !checkingStatus.current()) {
        checkingStatus.current = null;
        setIsLoading(false);
      }
    };
    resetStaleCheck();
    const unsubscribe = navigation?.addListener?.('focus', resetStaleCheck);
    return () => unsubscribe?.();
  }, [navigation, user?.id]);

  const handleStartVerification = async () => {
    if (checkingStatus.current) return;
    const isCurrent = startNavigationTask();
    try {
      const result = await purchase.verify(isCurrent);
      if (!result || !isCurrent()) return;
      await refreshUser();
      if (!isCurrent()) return;
      if (isUserVerified(result)) {
        haptics.success();
        showToast('You’re verified!', 'success');
        navigation.goBack();
      } else {
        showToast('Verification is processing. You can keep exploring.', 'info');
      }
    } catch (error) {
      if (!isCurrent()) return;
      showError({
        type: 'verification',
        title: 'Couldn\'t Start Verification',
        message: error.message || 'Something went wrong. Please check your connection and try again.',
      });
    }
  };

  const handleCheckStatus = async () => {
    if (checkingStatus.current || purchase.busy) return;
    const isCurrent = startNavigationTask();
    checkingStatus.current = isCurrent;
    setIsLoading(true);
    try {
      const result = await api.checkVerification();
      if (!isCurrent()) return;
      if (isUserVerified(result)) {
        await refreshUser();
        if (!isCurrent()) return;
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
          message: 'Use the verification button to get started.',
          primaryAction: 'OK',
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
      showError({
        type: 'network',
        message: error.message || 'Couldn\'t check your verification status. Please check your connection and try again.',
      });
    } finally {
      if (checkingStatus.current === isCurrent) {
        checkingStatus.current = null;
        if (isCurrent()) setIsLoading(false);
      }
    }
  };

  const handleSkipForNow = () => {
    setSkipSheetVisible(true);
  };

  const actions = (
    <View style={styles.actionFooter}>
      <View style={styles.readableWidth}>
        <VerificationPurchaseActions purchase={purchase} onVerify={handleStartVerification} disabled={isLoading} />
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
            disabled={isLoading || purchase.busy}
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
  secondaryButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, minHeight: 44, padding: SPACING.md, marginTop: SPACING.lg, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  skipButton: { minHeight: 44, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm, alignItems: 'center', justifyContent: 'center' },
  skipButtonText: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
});
