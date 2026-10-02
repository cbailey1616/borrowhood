import TextInput from '../../components/AppTextInput';
import BiometricIcon from '../../components/BiometricIcon';
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import SocialSignInButtons from '../../components/SocialSignInButtons';
import SocialAccountLink from '../../components/SocialAccountLink';
import WoodlandBackdrop from '../../components/WoodlandBackdrop';
import { useAuth } from '../../context/AuthContext';
import { useError } from '../../context/ErrorContext';
import useBiometrics from '../../hooks/useBiometrics';
import { CARD_SURFACE, BASE_URL, COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function WelcomeScreen({ navigation, showBackButton = false }) {
  const { login } = useAuth();

  const { showError } = useError();
  const {
    isBiometricsAvailable,
    isBiometricsEnabled,
    biometricType,
    isLoading: biometricsLoading,
    authenticate,
    getStoredCredentials,
    hasStoredCredentials,
  } = useBiometrics();

  const passwordInput = useRef(null);
  const signInLock = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [canUseBiometrics, setCanUseBiometrics] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [socialBusy, setSocialBusy] = useState(false);
  const [pendingLink, setPendingLink] = useState(null);
  const resetLink = () => {
    setPendingLink(null);
    setPassword('');
    setShowPassword(false);
    setLoginError(null);
  };
  useEffect(() => {
    checkBiometricsReady();
  }, [isBiometricsAvailable, isBiometricsEnabled]);

  const checkBiometricsReady = async () => {
    if (isBiometricsAvailable && isBiometricsEnabled) {
      const hasCredentials = await hasStoredCredentials();
      setCanUseBiometrics(hasCredentials);
    } else {
      setCanUseBiometrics(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (signInLock.current || socialBusy) return;
    signInLock.current = true;
    setIsLoading(true);
    try {
      const success = await authenticate();
      if (success) {
        const credentials = await getStoredCredentials();
        if (credentials) {
          await login(credentials.email, credentials.password);
        } else {
          showError({
            type: 'auth',
            message: 'Your saved login has expired. Please sign in with your email and password.',
          });
        }
      }
    } catch (error) {
      showError({
        type: 'auth',
        message: error.message || 'Couldn\'t sign you in. Please try entering your email and password.',
      });
    } finally {
      signInLock.current = false;
      setIsLoading(false);
    }
  };

  const signInWithPassword = async (loginEmail, loginPassword, link) => {
    if (link) await login(loginEmail, loginPassword, link);
    else await login(loginEmail, loginPassword);
  };

  const handleLogin = async () => {
    if (signInLock.current || socialBusy) return;
    if (!email.trim() || !password) {
      setLoginError('Please enter your email and password.');
      return;
    }

    setLoginError(null);
    signInLock.current = true;
    setIsLoading(true);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (error) {
      setLoginError(error.message || 'Incorrect email or password. Please try again.');
    } finally {
      signInLock.current = false;
      setIsLoading(false);
    }
  };

  if (pendingLink) return <SocialAccountLink link={pendingLink} navigation={navigation} onPasswordSignIn={signInWithPassword}
    onCancel={() => { resetLink(); setSocialBusy(false); }}/>;

  return (
    <SafeAreaView style={styles.container}>
      <WoodlandBackdrop fullScreen />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {showBackButton && <HapticPressable style={styles.backButton} onPress={() => navigation.goBack()}
              disabled={isLoading || socialBusy} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
            </HapticPressable>}
            <View style={styles.logoContainer}>
              <View style={styles.brandRow}>
                <Image source={require('../../../assets/logo.png')} style={styles.logo} accessible={false} />
                <Text maxFontSizeMultiplier={1.4} accessibilityRole="header" style={styles.wordmark} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>Borrowhood</Text>
              </View>
              <Text style={styles.authTitle}>Sign in to your account</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email address</Text>
                <View style={[styles.fieldContainer, focusedField === 'email' && styles.inputFocused]}>
                  <TextInput
                    style={styles.fieldInput}
                    value={email}
                    onChangeText={(t) => { setEmail(t); setLoginError(null); }}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    editable={!isLoading && !socialBusy}
                    placeholder="you@example.com"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => passwordInput.current?.focus()}
                    textContentType="username"
                    autoComplete="email"
                    testID="Welcome.input.email"
                    accessibilityLabel="Email address"
                  />
                  {canUseBiometrics && !biometricsLoading && (
                    <HapticPressable
                      style={[styles.biometricAction, (isLoading || socialBusy) && styles.loginButtonDisabled]}
                      onPress={handleBiometricLogin}
                      disabled={isLoading || socialBusy}

                      testID="Welcome.button.biometric"
                      accessibilityLabel={`Sign in with ${biometricType}`}
                      accessibilityHint="Sign in using your saved account"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isLoading || socialBusy }}
                    >
                      <BiometricIcon type={biometricType} size={22} color={COLORS.primary} />
                    </HapticPressable>
                  )}
                </View>
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.passwordLabelRow}>
                  <Text style={styles.label}>Password</Text>
                  <HapticPressable onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() })}
                    disabled={isLoading || socialBusy} style={styles.recoveryLink} accessibilityRole="link">
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </HapticPressable>
                </View>
                <View style={[styles.fieldContainer, focusedField === 'password' && styles.inputFocused]}>
                  <TextInput
                    ref={passwordInput}
                    style={styles.fieldInput}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setLoginError(null); }}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    editable={!isLoading && !socialBusy}
                    placeholder="Enter your password"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                    testID="Welcome.input.password"
                    accessibilityLabel="Password"
                  />
                  <HapticPressable
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                    haptic="selection"
                    disabled={isLoading || socialBusy}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Text maxFontSizeMultiplier={1.4} style={styles.eyeButtonText}>
                      {showPassword ? 'Hide' : 'Show'}
                    </Text>
                  </HapticPressable>
                </View>
              </View>

              {loginError && (
                <View style={styles.errorCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
                  <Text style={styles.errorText}>{loginError}</Text>
                </View>
              )}

              <HapticPressable scaleDown={0.97}
                style={[styles.loginButton, (isLoading || socialBusy) && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={isLoading || socialBusy}

                testID="Welcome.button.signIn"
                accessibilityLabel="Sign in"
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoading || socialBusy, busy: isLoading }}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.background} />
                ) : (
                  <Text maxFontSizeMultiplier={1.4} style={styles.loginButtonText}>Sign in</Text>
                )}
              </HapticPressable>

            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <SocialSignInButtons disabled={isLoading} onBusyChange={busy => {
              setSocialBusy(busy);
              if (busy) resetLink();
            }} onLinkRequired={link => { setSocialBusy(false); setPendingLink(link); if (link.email) setEmail(link.email); }} />

            <View style={styles.footer}>
              <Text style={styles.footerText}>New here?</Text>
              <HapticPressable disabled={socialBusy || isLoading} onPress={() => navigation.navigate('Register')}  testID="Welcome.link.createAccount" accessibilityLabel="Create an account" accessibilityRole="link" style={styles.createAccountLink}>
                <Text maxFontSizeMultiplier={1.4} style={styles.footerLink}>Create an account</Text>
              </HapticPressable>
            </View>

            {showBackButton && <HapticPressable style={styles.findAccount} disabled={isLoading || socialBusy}
              onPress={() => navigation.navigate('FindAccount')} accessibilityRole="link">
              <Text style={styles.forgotPasswordText}>Can't find your account?</Text>
            </HapticPressable>}

            <Text style={styles.terms}>By continuing, you agree to our{' '}
              <Text maxFontSizeMultiplier={1.4} accessibilityRole="link" style={styles.termsLink} onPress={() => Linking.openURL(`${BASE_URL}/terms`)}>Terms</Text> and{' '}
              <Text maxFontSizeMultiplier={1.4} accessibilityRole="link" style={styles.termsLink} onPress={() => Linking.openURL(`${BASE_URL}/privacy`)}>Privacy Policy</Text>.
            </Text>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  terms: { ...TYPOGRAPHY.caption1, lineHeight: 18, textAlign: 'center', color: COLORS.textSecondary, paddingTop: SPACING.sm },
  termsLink: { color: COLORS.primary, textDecorationLine: 'underline' },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.md,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'stretch',
    marginBottom: SPACING.xl,
  },
  backButton: { minWidth: 44, minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginBottom: SPACING.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm },
  logo: { width: 48, height: 48, resizeMode: 'contain' },
  wordmark: {
    ...TYPOGRAPHY.largeTitle,
    lineHeight: 44,
    letterSpacing: -1,
    color: COLORS.primary,
    textAlign: 'left',
    flex: 1,
    maxWidth: '100%',
    marginBottom: SPACING.xs,
    fontFamily: 'Fraunces_600SemiBold',
    fontWeight: '600',
  },
  authTitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'left' },
  biometricAction: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    minHeight: 48,
    marginRight: SPACING.xs,
  },
  form: {
    ...CARD_SURFACE,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 16,
    gap: SPACING.md,
  },
  inputContainer: {
    gap: 6,
  },
  label: {
    ...TYPOGRAPHY.buttonSmall,
    color: COLORS.text,
  },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.white },
  passwordLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: SPACING.sm },
  fieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.borderGreenStrong,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
  },
  fieldInput: {
    ...TYPOGRAPHY.body,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.text,
  },
  eyeButton: {
    minWidth: 52,
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeButtonText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.buttonCaption,
  },
  loginButton: {
    backgroundColor: COLORS.primary,
    minHeight: 48,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: COLORS.white,
    ...TYPOGRAPHY.headline,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.tints.danger10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.tints.danger25,
    padding: SPACING.md,
  },
  errorText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.danger,
    flex: 1,
    lineHeight: 20,
  },
  recoveryLink: { minHeight: 44, justifyContent: 'center' },
  forgotPasswordText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.bodySmall,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
    columnGap: SPACING.xs,
  },
  createAccountLink: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xs },
  findAccount: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginVertical: SPACING.lg },
  dividerLine: { height: 1, flex: 1, backgroundColor: COLORS.borderGreenStrong },
  dividerText: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary },
  footerText: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.subheadline,
  },
  footerLink: {
    color: COLORS.primary,
    ...TYPOGRAPHY.buttonSmall,
  },
});
