import TextInput from '../../components/AppTextInput';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from '../../components/HapticPressable';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { COLORS, RADIUS, SHADOWS, TYPOGRAPHY } from '../../utils/config';

export default function VerifySignupEmailScreen({ route, navigation }) {
  const { verifySignupCode } = useAuth();
  const insets = useSafeAreaInsets();
  const challenge = route.params || {};
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [codeFocused, setCodeFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible?.() || false);
  const codeInput = useRef(null);
  const [deadline, setDeadline] = useState(() => Date.now() + (challenge.resendAfter || 60) * 1000);
  const [remaining, setRemaining] = useState(challenge.resendAfter || 60);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
      setNotice('New code sent. Use the latest email.');
      codeInput.current?.focus();
    } catch (err) {
      setError(err.message || 'Could not resend your code. Please try again.');
      if (err.retryAfter) setDeadline(Date.now() + err.retryAfter * 1000);
    } finally { busyRef.current = false; setBusy(''); }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <HapticPressable onPress={() => navigation.goBack()} disabled={!!busy} accessibilityLabel="Back to create account" accessibilityRole="button" style={styles.back}>
          <Icon name="chevron-back" size={22} />
        </HapticPressable>
        <Text style={styles.wordmark}>Borrowhood</Text>
        <HapticPressable onPress={() => Linking.openURL('mailto:chris@borrowhood.net').catch(() => setError('Email chris@borrowhood.net for help.'))} accessibilityRole="link" accessibilityLabel="Get help" style={styles.helpButton}>
          <Text style={styles.link}>Help</Text>
        </HapticPressable>
      </View>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top}>
        <ScrollView contentContainerStyle={[styles.content, keyboardVisible && styles.contentCompact]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
          <View style={[styles.intro, keyboardVisible && styles.introCompact]}>
            <View style={[styles.icon, keyboardVisible && styles.iconCompact]}><Icon name="mail" size={keyboardVisible ? 30 : 46} illustrated /></View>
            <View style={styles.introCopy}>
              <Text accessibilityRole="header" style={[styles.title, keyboardVisible && styles.titleCompact]}>Check your email</Text>
              <Text style={[styles.body, keyboardVisible && styles.bodyCompact]}>Enter the 6-digit code sent to</Text>
            </View>
          </View>
          <View style={styles.emailRow}>
            <Text style={styles.email}>{challenge.email}</Text>
            <HapticPressable onPress={() => navigation.goBack()} disabled={!!busy} accessibilityLabel="Change email address" accessibilityRole="button" style={styles.changeEmail}>
              <Text style={styles.link}>Change</Text>
            </HapticPressable>
          </View>
          <View style={styles.codeEntry}>
            <View style={styles.codeSlots} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {Array.from({ length: 6 }, (_, index) => {
                const active = codeFocused && index === Math.min(code.length, 5);
                return (
                  <View key={index} style={[styles.codeSlot, !!code[index] && styles.codeSlotFilled, active && styles.codeSlotActive, !!error && styles.codeSlotError]}>
                    {code[index] ? <Text style={styles.digit}>{code[index]}</Text> : <View style={active ? styles.caret : styles.emptyDigit} />}
                  </View>
                );
              })}
            </View>
            {/* One native input preserves paste, autofill and a single accessible field. */}
            <TextInput
              ref={codeInput}
              testID="VerifySignup.input.code" accessibilityLabel="Six-digit email verification code"
              style={styles.codeInput} value={code} onChangeText={value => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              onFocus={() => setCodeFocused(true)} onBlur={() => setCodeFocused(false)}
              keyboardType="number-pad" textContentType="oneTimeCode" autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'sms-otp'}
              autoFocus maxLength={12} autoCorrect={false} editable={!busy} caretHidden selectionColor="transparent" underlineColorAndroid="transparent"
            />
          </View>
          <Text style={styles.expiry}>Valid for 10 minutes</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
          <HapticPressable onPress={confirm} disabled={!!busy || code.length !== 6} accessibilityRole="button" accessibilityLabel="Verify email and continue"
            style={[styles.button, !busy && code.length !== 6 && styles.buttonDisabled]}>
            {busy === 'verify' ? <ActivityIndicator color={COLORS.background} /> : <>
              <Text style={[styles.buttonText, code.length !== 6 && styles.buttonTextDisabled]}>Continue</Text>
              <Icon name="arrow-forward" size={20} color={code.length === 6 ? COLORS.background : COLORS.primary} />
            </>}
          </HapticPressable>
          <HapticPressable onPress={resend} disabled={!!busy || remaining > 0} accessibilityRole="button" accessibilityLabel="Resend code" style={styles.resendButton}>
            <Text style={[styles.link, (remaining > 0 || !!busy) && styles.muted]}>{busy === 'resend' ? 'Sending…' : remaining > 0 ? `Resend in ${remaining}s` : 'Resend code'}</Text>
          </HapticPressable>
          <View style={styles.deliveryHint}>
            <Icon name="information-circle" size={16} color={COLORS.textSecondary} />
            <Text style={styles.hint}>Not there? Check Spam or Junk.</Text>
          </View>
          <View style={styles.footer}>
            <HapticPressable onPress={() => navigation.navigate('Login')} disabled={!!busy} accessibilityRole="button" style={styles.linkButton}><Text style={styles.link}>Sign in instead</Text></HapticPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: { width: '100%', maxWidth: 488, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  back: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  wordmark: { ...TYPOGRAPHY.h3, color: COLORS.primary },
  helpButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20 },
  contentCompact: { paddingTop: 8 },
  intro: { alignItems: 'center', gap: 16 },
  introCompact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  introCopy: { flexShrink: 1 },
  icon: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.xl, backgroundColor: COLORS.primaryMuted },
  iconCompact: { width: 48, height: 48, borderRadius: RADIUS.md },
  title: { ...TYPOGRAPHY.h1, lineHeight: 34, color: COLORS.primaryDark, textAlign: 'center' },
  titleCompact: { ...TYPOGRAPHY.title2, textAlign: 'left' },
  body: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6 },
  bodyCompact: { ...TYPOGRAPHY.bodySmall, textAlign: 'left', marginTop: 2 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingLeft: 12, paddingRight: 4, marginTop: 16 },
  email: { ...TYPOGRAPHY.bodySmall, color: COLORS.text, flex: 1, paddingVertical: 12 },
  changeEmail: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  codeEntry: { marginTop: 20 },
  codeSlots: { flexDirection: 'row', gap: 8 },
  codeSlot: { flex: 1, minWidth: 0, minHeight: 58, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', ...SHADOWS.sm },
  codeSlotFilled: { borderColor: COLORS.borderGreenStrong },
  codeSlotActive: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: '#FFFFFF' },
  codeSlotError: { borderColor: COLORS.danger },
  digit: { ...TYPOGRAPHY.h1, lineHeight: 36, color: COLORS.primaryDark, fontVariant: ['tabular-nums'] },
  emptyDigit: { width: 5, height: 5, borderRadius: RADIUS.full, backgroundColor: COLORS.borderGreenStrong },
  caret: { width: 2, height: 22, borderRadius: 1, backgroundColor: COLORS.primary },
  codeInput: { ...StyleSheet.absoluteFillObject, color: 'transparent', backgroundColor: 'transparent', fontSize: 28, padding: 0 },
  expiry: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10 },
  error: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger, marginTop: 12, textAlign: 'center' },
  notice: { ...TYPOGRAPHY.bodySmall, color: COLORS.primary, marginTop: 12, textAlign: 'center' },
  button: { width: '100%', minHeight: 52, flexDirection: 'row', gap: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginTop: 20, paddingHorizontal: 16, paddingVertical: 12, opacity: 1 },
  buttonText: { ...TYPOGRAPHY.headline, color: COLORS.background },
  buttonDisabled: { backgroundColor: COLORS.primaryMuted },
  buttonTextDisabled: { color: COLORS.primary },
  resendButton: { minHeight: 44, marginTop: 8, justifyContent: 'center', alignItems: 'center', opacity: 1 },
  deliveryHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  hint: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flexShrink: 1 },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  link: { ...TYPOGRAPHY.footnote, color: COLORS.primary, fontWeight: '400', textAlign: 'center' },
  muted: { color: COLORS.textSecondary },
  footer: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, marginTop: 16, paddingTop: 4 },
});
