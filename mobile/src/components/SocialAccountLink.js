import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TextInput from './AppTextInput';
import ActionButton from './ActionButton';
import HapticPressable from './HapticPressable';
import LayeredCard from './LayeredCard';
import { Ionicons } from './Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function SocialAccountLink({ link, navigation, onCancel, onPasswordSignIn }) {
  const { completeSocialLinkCode } = useAuth();
  const provider = link.provider === 'apple' ? 'Apple' : 'Google';
  const [method, setMethod] = useState('code');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState(link.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  const passwordInput = useRef(null);
  const usingPassword = method === 'password';
  const codeSent = !usingPassword && !!challenge;
  const accountEmail = challenge?.email || link.email;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!resendAt) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  const run = async (action, task) => {
    if (lock.current) return;
    lock.current = true; setBusy(action); setError(''); setNotice('');
    try { await task(); }
    catch (err) {
      if (!mounted.current) return;
      setError(err.message || 'Could not connect your account. Please try again.');
      // A resend replaces the old challenge before email delivery. Only a
      // rate-limit rejection guarantees that the previous code is still usable.
      if (action === 'send' && challenge && err.status !== 429) { setChallenge(null); setCode(''); }
      if (action === 'send' && err.status === 429) setResendAt(Date.now() + (err.retryAfter || 60) * 1000);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy('');
    }
  };

  const sendCode = () => {
    if (Date.now() < resendAt) return;
    return run('send', async () => {
      const next = await api.startSocialLinkCode(link.provider, link.token);
      if (!next?.challengeId) throw new Error('Could not send a code. Please try again.');
      if (!mounted.current) return;
      setNotice(challenge ? 'A new code was sent. Use the latest email.' : '');
      setChallenge(next); setCode(''); setResendAt(Date.now() + 60000);
    });
  };
  const verifyCode = () => {
    if (!challenge || !/^\d{6}$/.test(code)) return;
    return run('verify', async () => {
      await completeSocialLinkCode(link, challenge.challengeId, code);
      Keyboard.dismiss(); haptics.success();
    });
  };
  const signInWithPassword = () => {
    if (!email.trim() || !password) {
      setError('Enter your email and Borrowhood password.');
      return;
    }
    return run('password', async () => {
      await onPasswordSignIn(email.trim(), password, link);
      Keyboard.dismiss();
    });
  };
  const switchMethod = () => {
    if (lock.current) return;
    Keyboard.dismiss(); setMethod(usingPassword ? 'code' : 'password');
    setError(''); setNotice(''); setPassword(''); setShowPassword(false); setCode('');
  };
  const primaryLabel = usingPassword ? 'Connect & sign in' : codeSent ? 'Verify & sign in'
    : remaining > 0 ? `Send code in ${remaining}s` : 'Email me a code';

  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <View style={styles.header}>
          <HapticPressable onPress={onCancel} disabled={!!busy} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to sign-in">
            <Ionicons name="chevron-back" size={24} color={COLORS.primary}/>
          </HapticPressable>
          <Text style={styles.wordmark}>Borrowhood</Text>
          <View style={styles.headerSpacer}/>
        </View>

        <View style={styles.intro}>
          <View style={styles.heroIcon}><Ionicons name={usingPassword ? 'lock-closed-outline' : codeSent ? 'mail-outline' : 'link-outline'} size={40} color={COLORS.primary}/></View>
          <Text accessibilityRole="header" style={styles.title}>{usingPassword ? 'Confirm your account' : codeSent ? 'Check your email' : 'Finish signing in'}</Text>
          <Text style={styles.body}>{usingPassword ? `Enter your Borrowhood password to connect ${provider}.`
            : codeSent ? `Enter the six-digit code to connect ${provider}.`
              : `You already have a Borrowhood account. Confirm it's yours to use ${provider}.`}</Text>
        </View>

        <LayeredCard accent>
          <View style={styles.account}>
            {link.provider === 'google' ? <Image source={require('../../assets/brand/google-g.png')} style={styles.providerLogo} accessible={false}/>
              : <Ionicons name="lock-closed-outline" size={28} color={COLORS.primary}/>}
            <View style={styles.accountCopy}>
              <Text style={styles.accountLabel}>{codeSent ? 'Code sent to' : `Connect ${provider}`}</Text>
              <Text style={styles.accountEmail}>{accountEmail || 'Your Borrowhood email'}</Text>
            </View>
          </View>
        </LayeredCard>

        <View style={styles.form}>
          {usingPassword && <>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={email} onChangeText={value => { setEmail(value); setError(''); }}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="username"
                returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()}
                editable={!busy} placeholder="you@example.com" placeholderTextColor={COLORS.textMuted}
                accessibilityLabel="Email address" testID="Welcome.input.email"/>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Borrowhood password</Text>
              <View style={styles.passwordField}>
                <TextInput ref={passwordInput} style={styles.passwordInput} value={password} onChangeText={value => { setPassword(value); setError(''); }}
                  secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="password" textContentType="password"
                  editable={!busy} placeholder="Borrowhood password" placeholderTextColor={COLORS.textMuted}
                  returnKeyType="go" onSubmitEditing={signInWithPassword} accessibilityLabel="Borrowhood password" testID="Welcome.input.password"/>
                <HapticPressable onPress={() => setShowPassword(!showPassword)} disabled={!!busy} style={styles.showPassword} accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}><Text style={styles.link}>{showPassword ? 'Hide' : 'Show'}</Text></HapticPressable>
              </View>
              <HapticPressable onPress={() => navigation.navigate('ForgotPassword', { email })} disabled={!!busy} style={styles.textButton} accessibilityRole="link">
                <Text style={styles.link}>Forgot your password?</Text>
              </HapticPressable>
            </View>
          </>}
          {codeSent && <View style={styles.field}>
            <Text style={styles.label}>Email code</Text>
            <TextInput style={[styles.input, styles.codeInput]} value={code} onChangeText={value => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              keyboardType="number-pad" textContentType="oneTimeCode" autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'sms-otp'}
              maxLength={12} autoFocus autoCorrect={false} editable={!busy} placeholder="000000" placeholderTextColor={COLORS.textMuted}
              accessibilityLabel="Six-digit email code" testID="Welcome.input.linkCode"/>
            <Text style={styles.hint}>Code expires in 10 minutes.</Text>
          </View>}
          {!!error && <View style={styles.error}><Ionicons name="alert-circle-outline" size={20} color={COLORS.danger}/><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text></View>}
          {!!notice && <Text accessibilityLiveRegion="polite" style={styles.hint}>{notice}</Text>}
          <ActionButton label={primaryLabel} variant="primary" icon={usingPassword ? undefined : codeSent ? 'checkmark-circle-outline' : 'mail-outline'}
            testID="Welcome.button.signIn" accessibilityLabel={usingPassword ? `Connect ${provider} and sign in` : codeSent ? 'Verify code and sign in' : primaryLabel}
            onPress={usingPassword ? signInWithPassword : codeSent ? verifyCode : sendCode}
            loading={!!busy && !(codeSent && busy === 'send')}
            disabled={!!busy || (codeSent ? code.length !== 6 : !usingPassword && remaining > 0)}/>
          {codeSent && <HapticPressable onPress={sendCode} disabled={!!busy || remaining > 0} style={styles.textButton} accessibilityRole="button" accessibilityLabel="Resend code"
            accessibilityState={{ disabled: !!busy || remaining > 0 }}>
            <Text style={[styles.link, (remaining > 0 || !!busy) && styles.muted]}>{busy === 'send' ? 'Sending code...' : remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code'}</Text>
          </HapticPressable>}
          <ActionButton label={usingPassword ? 'Use email code instead' : 'Use password instead'} disabled={!!busy} onPress={switchMethod}/>
          <Text style={styles.hint}>{codeSent ? 'Check your spam folder if the email is missing.' : `Next time, just sign in with ${provider}.`}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl, gap: SPACING.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: SPACING.sm },
  back: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  wordmark: { ...TYPOGRAPHY.title3, color: COLORS.primary, flex: 1, textAlign: 'center' },
  headerSpacer: { width: 44 },
  intro: { alignItems: 'center', gap: SPACING.md },
  heroIcon: { width: 72, height: 72, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  title: { ...TYPOGRAPHY.title2, letterSpacing: 0, color: COLORS.primary, textAlign: 'center' },
  body: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center' },
  account: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, gap: SPACING.md },
  accountCopy: { flex: 1, minWidth: 0, gap: SPACING.xs },
  providerLogo: { width: 28, height: 28, resizeMode: 'contain' },
  accountLabel: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  accountEmail: { ...TYPOGRAPHY.body, color: COLORS.primary },
  form: { gap: SPACING.md },
  field: { gap: SPACING.sm },
  label: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  input: { ...TYPOGRAPHY.body, minHeight: 52, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingVertical: 14, paddingHorizontal: SPACING.lg },
  passwordField: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  passwordInput: { ...TYPOGRAPHY.body, flex: 1, minWidth: 0, minHeight: 52, padding: SPACING.md, color: COLORS.text },
  showPassword: { minWidth: 52, minHeight: 44, paddingHorizontal: SPACING.md, alignItems: 'center', justifyContent: 'center' },
  codeInput: { fontSize: 28, lineHeight: 36, textAlign: 'center', letterSpacing: 0 },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.sm },
  link: { ...TYPOGRAPHY.footnote, color: COLORS.primary, textAlign: 'center' },
  muted: { color: COLORS.textSecondary },
  hint: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center' },
  error: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.dangerMuted, padding: SPACING.md, borderRadius: RADIUS.md },
  errorText: { ...TYPOGRAPHY.footnote, color: COLORS.danger, flex: 1 },
});
