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
import ActionSheet from '../../components/ActionSheet';
import SocialSignInButtons from '../../components/SocialSignInButtons';
import SocialAccountLink from '../../components/SocialAccountLink';
import { useAuth } from '../../context/AuthContext';
import { useError } from '../../context/ErrorContext';
import useBiometrics from '../../hooks/useBiometrics';
import { haptics } from '../../utils/haptics';
import { BASE_URL, COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

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
    enableBiometrics,
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
  const [biometricSheetVisible, setBiometricSheetVisible] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);
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
          haptics.success();
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
    haptics.success();
    if (isBiometricsAvailable && !isBiometricsEnabled) {
      setPendingCredentials({ email: loginEmail, password: loginPassword });
      setTimeout(() => { setBiometricSheetVisible(true); }, 500);
    }
  };

  const handleLogin = async () => {
    if (signInLock.current || socialBusy) return;
    if (!email.trim() || !password) {
      haptics.warning();
      setLoginError('Please enter your email and password.');
      return;
    }

    setLoginError(null);
    signInLock.current = true;
    setIsLoading(true);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (error) {
      haptics.error();
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
              <View style={styles.logoBadge}>
                <Image source={require('../../../assets/logo.png')} style={styles.logo} accessible={false} />
              </View>
              <Text accessibilityRole="header" style={styles.wordmark} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>Borrowhood</Text>
              <Text style={styles.authTitle}>Sign in to your account</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email address</Text>
                <TextInput
                  style={[styles.input, focusedField === 'email' && styles.inputFocused]}
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
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.passwordLabelRow}>
                  <Text style={styles.label}>Password</Text>
                  <HapticPressable onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() })}
                    disabled={isLoading || socialBusy} style={styles.recoveryLink} accessibilityRole="link">
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </HapticPressable>
                </View>
                <View style={[styles.passwordContainer, focusedField === 'password' && styles.inputFocused]}>
                  <TextInput
                    ref={passwordInput}
                    style={styles.passwordInput}
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
                    haptic="light"
                    disabled={isLoading || socialBusy}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Text style={styles.eyeButtonText}>
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

              <HapticPressable
                style={[styles.loginButton, (isLoading || socialBusy) && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={isLoading || socialBusy}
                haptic="medium"
                testID="Welcome.button.signIn"
                accessibilityLabel="Sign in"
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoading || socialBusy, busy: isLoading }}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.background} />
                ) : (
                  <Text style={styles.loginButtonText}>Sign in</Text>
                )}
              </HapticPressable>

            </View>

            {canUseBiometrics && !biometricsLoading && (
              <HapticPressable
                style={[styles.biometricButton, (isLoading || socialBusy) && styles.loginButtonDisabled]}
                onPress={handleBiometricLogin}
                disabled={isLoading || socialBusy}
                haptic="medium"
                testID="Welcome.button.biometric"
                accessibilityLabel={`Sign in with ${biometricType}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoading || socialBusy }}
              >
                <BiometricIcon type={biometricType} size={20} color={COLORS.primary} />
                <Text style={styles.biometricButtonText}>Use {biometricType}</Text>
              </HapticPressable>
            )}

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
              <HapticPressable disabled={socialBusy || isLoading} onPress={() => navigation.navigate('Register')} haptic="light" testID="Welcome.link.createAccount" accessibilityLabel="Create an account" accessibilityRole="link" style={styles.createAccountLink}>
                <Text style={styles.footerLink}>Create an account</Text>
              </HapticPressable>
            </View>

            {showBackButton && <HapticPressable style={styles.findAccount} disabled={isLoading || socialBusy}
              onPress={() => navigation.navigate('FindAccount')} accessibilityRole="link">
              <Text style={styles.forgotPasswordText}>Can't find your account?</Text>
            </HapticPressable>}

            <Text style={styles.terms}>By continuing, you agree to our{' '}
              <Text accessibilityRole="link" style={styles.termsLink} onPress={() => Linking.openURL(`${BASE_URL}/terms`)}>Terms</Text> and{' '}
              <Text accessibilityRole="link" style={styles.termsLink} onPress={() => Linking.openURL(`${BASE_URL}/privacy`)}>Privacy Policy</Text>.
            </Text>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ActionSheet
        isVisible={biometricSheetVisible}
        onClose={() => setBiometricSheetVisible(false)}
        title={`Enable ${biometricType || 'Biometrics'}?`}
        message={`Would you like to use ${biometricType || 'biometrics'} for faster sign in next time?`}
        actions={[
          {
            label: 'Enable',
            onPress: async () => {
              if (pendingCredentials) {
                await enableBiometrics(pendingCredentials.email, pendingCredentials.password);
                setPendingCredentials(null);
              }
            },
          },
        ]}
        cancelLabel="Not Now"
      />
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
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  backButton: { minWidth: 44, minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginBottom: SPACING.sm },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  logo: { width: 62, height: 62, resizeMode: 'contain' },
  wordmark: {
    ...TYPOGRAPHY.largeTitle,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -1,
    color: COLORS.primary,
    textAlign: 'center',
    maxWidth: '100%',
    marginBottom: SPACING.xs,
  },
  authTitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center' },
  biometricButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
    backgroundColor: COLORS.primaryMuted,
    borderWidth: 1,
    borderColor: COLORS.borderGreenStrong,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  biometricButtonText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.primary,
    textAlign: 'center',
    flexShrink: 1,
  },
  form: {
    gap: SPACING.md,
  },
  inputContainer: {
    gap: 6,
  },
  label: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.text,
  },
  input: {
    ...TYPOGRAPHY.body,
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.borderGreenStrong,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: '#FFFFFF' },
  passwordLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: SPACING.sm },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.borderGreenStrong,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
  },
  passwordInput: {
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
    ...TYPOGRAPHY.footnote,
    fontWeight: '400',
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
    color: '#FFFFFF',
    ...TYPOGRAPHY.headline,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger + '10',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + '25',
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
    fontWeight: '400',
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
    ...TYPOGRAPHY.subheadline,
    fontWeight: '400',
  },
});
