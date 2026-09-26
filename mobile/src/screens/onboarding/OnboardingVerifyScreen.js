import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, ActivityIndicator, StyleSheet } from 'react-native';
import useNavigationTask from '../../hooks/useNavigationTask';
import useVerificationOffer from '../../hooks/useVerificationOffer';
import VerificationPurchaseActions from '../../components/VerificationPurchaseActions';
import VerificationBenefits from '../../components/VerificationBenefits';
import OnboardingLayout from '../../components/OnboardingLayout';
import HapticPressable from '../../components/HapticPressable';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { COLORS, TYPOGRAPHY } from '../../utils/config';
import { isUserVerified } from '../../utils/auth';

export default function OnboardingVerifyScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const startTask = useNavigationTask(navigation, user?.id);
  const purchase = useVerificationOffer(navigation, startTask, user?.id);
  // Release completion UI together with this lock, even after leaving the step.
  const action = useRef(false);
  const statusVersion = useRef(0);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState('none');
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const checkStatus = useCallback(async () => {
    const isCurrent = startTask();
    const version = ++statusVersion.current;
    setChecking(true); setStatusError('');
    try {
      const result = await api.getVerificationStatus();
      if (isCurrent() && version === statusVersion.current) setStatus(isUserVerified(result) ? 'verified' : result.status || 'none');
    } catch {
      if (isCurrent() && version === statusVersion.current) setStatusError('Could not check verification status. Try again or finish later.');
    } finally {
      if (isCurrent() && version === statusVersion.current) setChecking(false);
    }
  }, [startTask]);
  useEffect(() => {
    checkStatus();
    const unsubscribe = navigation?.addListener?.('focus', checkStatus);
    return () => unsubscribe?.();
  }, [checkStatus, navigation]);

  const complete = async isCurrent => {
    if (!isCurrent()) return;
    setFinishing(true);
    await api.completeOnboarding();
    if (isCurrent()) await refreshUser();
    // RootNavigator switches to the feed only after refreshed server state.
  };
  const finish = async () => {
    if (action.current || purchase.busy) return;
    const isCurrent = startTask();
    action.current = true; setError('');
    try { await complete(isCurrent); }
    catch { if (isCurrent()) setError('Could not finish setup. Please try again.'); }
    finally { action.current = false; setFinishing(false); }
  };
  const verify = async () => {
    if (action.current) return;
    const isCurrent = startTask();
    action.current = true; setError('');
    try {
      const result = await purchase.verify(isCurrent);
      if (!result || !isCurrent()) return;
      // A browser dismissal never completes setup. Processing is not verified.
      if (!isUserVerified(result) && !['processing', 'submitted'].includes(result.status)) return;
      setStatus(isUserVerified(result) ? 'verified' : 'processing');
      await complete(isCurrent);
    } catch (err) {
      if (isCurrent()) setError(err.message || 'Could not start verification. Please try again.');
    } finally { action.current = false; setFinishing(false); }
  };
  const verified = status === 'verified';
  const processing = ['submitted', 'processing'].includes(status);
  const readyToFinish = verified || processing;
  const busy = finishing || purchase.busy;
  return <OnboardingLayout step={3} compact scene="onboardingVerify"
    title={verified ? 'You’re verified' : processing ? 'We’re checking your ID' : 'Get verified.'}
    description={verified ? 'You’re ready to borrow across Town.' : processing
      ? 'Your badge will appear once verification is complete.' : 'Let neighbors know it’s really you.'}
    onBack={() => navigation.navigate('OnboardingNeighborhood')} backDisabled={busy} busy={finishing}
    error={error || statusError}
    buttonLabel={readyToFinish ? 'Continue to Borrowhood' : undefined} onContinue={finish}
    primaryAction={!readyToFinish ? <VerificationPurchaseActions purchase={purchase} onVerify={verify}
      disabled={finishing || checking} branded hideFreeNote testID="OnboardingVerification.button.verify" /> : undefined}
    secondaryActions={!readyToFinish && <HapticPressable accessibilityRole="button" disabled={busy}
      accessibilityState={{ disabled: busy }} onPress={finish} style={styles.linkButton}><Text style={styles.link}>Not now</Text></HapticPressable>}>
    {checking && <ActivityIndicator color={COLORS.spinner} accessibilityLabel="Checking verification" style={styles.loading} />}
    {!readyToFinish && <VerificationBenefits />}
    {status === 'requires_input' && <Text style={styles.notice}>Your ID check needs another try.</Text>}
    {!!statusError && <HapticPressable accessibilityRole="button" onPress={checkStatus} disabled={busy || checking} style={styles.linkButton}>
      <Text style={styles.link}>Check status again</Text></HapticPressable>}
  </OnboardingLayout>;
}
const styles = StyleSheet.create({
  linkButton: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center' },
  link: { ...TYPOGRAPHY.body, color: COLORS.primary, textDecorationLine: 'underline', textAlign: 'center' },
  loading: { marginBottom: 16 },
  notice: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center', marginTop: 16 },
});
