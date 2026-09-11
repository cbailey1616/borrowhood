import TextInput from '../../components/AppTextInput';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HapticPressable from '../../components/HapticPressable';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { COLORS, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function VerifySignupEmailScreen({ route, navigation }) {
  const { verifySignupCode } = useAuth();
  const challenge = route.params || {};
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deadline, setDeadline] = useState(() => Date.now() + (challenge.resendAfter || 60) * 1000);
  const [remaining, setRemaining] = useState(challenge.resendAfter || 60);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const confirm = async () => {
    if (busyRef.current || code.length !== 6 || !challenge.challengeId) return;
    busyRef.current = true; setBusy('verify'); setError(''); setNotice('');
    try {
      await verifySignupCode(challenge.challengeId, code);
      Keyboard.dismiss();
      // RootNavigator opens onboarding only after verification stores a valid session.
    } catch (err) { setError(err.message || 'Could not confirm your code. Please try again.'); }
    finally { busyRef.current = false; setBusy(''); }
  };
  const resend = async () => {
    if (busyRef.current || remaining > 0 || !challenge.challengeId) return;
    busyRef.current = true; setBusy('resend'); setError(''); setNotice('');
    try {
      const response = await api.resendSignupCode(challenge.challengeId);
      setCode(''); setDeadline(Date.now() + (response.resendAfter || 60) * 1000);
      setNotice('A new code is on its way. Use the most recent email.');
    } catch (err) {
      setError(err.message || 'Could not resend your code. Please try again.');
      if (err.retryAfter) setDeadline(Date.now() + err.retryAfter * 1000);
    } finally { busyRef.current = false; setBusy(''); }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <HapticPressable onPress={() => navigation.goBack()} disabled={!!busy} accessibilityLabel="Back to create account" accessibilityRole="button" style={styles.back}>
            <Icon name="chevron-back" size={24} />
          </HapticPressable>
          <View style={styles.icon}><Icon name="mail" size={44} illustrated /></View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.body}>Enter the six-digit code we sent to</Text>
          <Text style={styles.email}>{challenge.email}</Text>
          <TextInput
            testID="VerifySignup.input.code" accessibilityLabel="Six-digit email verification code"
            style={styles.code} value={code} onChangeText={value => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            keyboardType="number-pad" textContentType="oneTimeCode" autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'sms-otp'}
            autoFocus maxLength={12} autoCorrect={false} placeholder="000000" placeholderTextColor={COLORS.textMuted} editable={!busy}
          />
          <Text style={styles.hint}>Your code expires in 10 minutes.</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
          <HapticPressable onPress={confirm} disabled={!!busy || code.length !== 6} accessibilityRole="button" accessibilityLabel="Verify email and continue"
            style={[styles.button, (!!busy || code.length !== 6) && styles.disabled]}>
            {busy === 'verify' ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.buttonText}>Verify email & continue</Text>}
          </HapticPressable>
          <HapticPressable onPress={resend} disabled={!!busy || remaining > 0} accessibilityRole="button" accessibilityLabel="Resend code" style={styles.linkButton}>
            <Text style={[styles.link, (remaining > 0 || !!busy) && styles.muted]}>{busy === 'resend' ? 'Sending…' : remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code'}</Text>
          </HapticPressable>
          <HapticPressable onPress={() => navigation.goBack()} disabled={!!busy} accessibilityRole="button" style={styles.linkButton}><Text style={styles.link}>Change email address</Text></HapticPressable>
          <Text style={styles.hint}>Can’t find it? Check your spam or junk folder.</Text>
          <View style={styles.footer}>
            <HapticPressable onPress={() => navigation.navigate('Login')} disabled={!!busy} accessibilityRole="button" style={styles.linkButton}><Text style={styles.link}>Sign in instead</Text></HapticPressable>
            <HapticPressable onPress={() => Linking.openURL('mailto:chris@borrowhood.net').catch(() => setError('Email chris@borrowhood.net for help.'))} accessibilityRole="link" style={styles.linkButton}><Text style={styles.link}>Get help</Text></HapticPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, padding: 24, alignItems: 'center' },
  back: { alignSelf: 'flex-start', minWidth: 44, minHeight: 44, justifyContent: 'center', marginBottom: 12 },
  icon: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: COLORS.primaryMuted, marginBottom: 20 },
  title: { ...TYPOGRAPHY.h1, color: COLORS.primary, textAlign: 'center', marginBottom: 12 },
  body: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center' },
  email: { ...TYPOGRAPHY.body, color: COLORS.text, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  code: { width: '100%', paddingVertical: 16, paddingHorizontal: 12, fontSize: 32, letterSpacing: 8, textAlign: 'center', color: COLORS.text, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg },
  hint: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12 },
  error: { ...TYPOGRAPHY.body, color: COLORS.danger, marginTop: 16, textAlign: 'center' },
  notice: { ...TYPOGRAPHY.body, color: COLORS.primary, marginTop: 16, textAlign: 'center' },
  button: { width: '100%', minHeight: 54, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginTop: 24, paddingHorizontal: 12 },
  buttonText: { ...TYPOGRAPHY.headline, color: COLORS.background },
  disabled: { opacity: 0.55 },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  link: { ...TYPOGRAPHY.footnote, color: COLORS.primary, fontWeight: '600', textAlign: 'center' },
  muted: { color: COLORS.textSecondary },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 },
});
