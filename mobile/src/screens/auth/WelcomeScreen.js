import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import ActionSheet from '../../components/ActionSheet';
import BlurCard from '../../components/BlurCard';
import { useAuth } from '../../context/AuthContext';
import { useError } from '../../context/ErrorContext';
import useBiometrics from '../../hooks/useBiometrics';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

const logo = require('../../../assets/logo.png');

export default function WelcomeScreen({ navigation }) {
  const { login, loginWithApple, loginWithGoogle } = useAuth();

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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [canUseBiometrics, setCanUseBiometrics] = useState(false);
  const [biometricSheetVisible, setBiometricSheetVisible] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null); // 'apple' | 'google' | null

  useEffect(() => {
    checkBiometricsReady();
  }, [isBiometricsAvailable, isBiometricsEnabled]);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
    }
  }, []);

  const checkBiometricsReady = async () => {
    if (isBiometricsAvailable && isBiometricsEnabled) {
      const hasCredentials = await hasStoredCredentials();
      setCanUseBiometrics(hasCredentials);
    } else {
      setCanUseBiometrics(false);
    }
  };

  const handleAppleSignIn = async () => {
    setSocialLoading('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const fullName = credential.fullName?.givenName
        ? { givenName: credential.fullName.givenName, familyName: credential.fullName.familyName }
        : null;
      await loginWithApple(credential.identityToken, fullName);
      haptics.success();
    } catch (err) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        haptics.error();
        showError({
          type: 'auth',
          message: err.message || 'Apple Sign-In failed. Please try again.',
        });
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setSocialLoading('google');
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken || response.idToken;
      if (!idToken) throw new Error('No ID token received from Google');
      await loginWithGoogle(idToken);
      haptics.success();
    } catch (err) {
      if (err.code !== 'SIGN_IN_CANCELLED' && err.code !== '12501') {
        haptics.error();
        showError({
          type: 'auth',
          message: err.message || 'Google Sign-In failed. Please try again.',
        });
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const handleBiometricLogin = async () => {
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
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      haptics.warning();
      setLoginError('Please enter your email and password.');
      return;
    }

    setLoginError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      haptics.success();

      // After successful login, prompt to enable biometrics if available but not enabled
      if (isBiometricsAvailable && !isBiometricsEnabled) {
        setPendingCredentials({ email, password });
        setTimeout(() => {
          setBiometricSheetVisible(true);
        }, 500);
      }
    } catch (error) {
      haptics.error();
      setLoginError(error.message || 'Incorrect email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const biometricIcon = biometricType === 'Face ID' ? 'scan-outline' : 'finger-print-outline';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.logoContainer}>
              <Image source={logo} style={styles.logo} resizeMode="contain" />
            </View>

            {/* Biometric Login Button */}
            {canUseBiometrics && !biometricsLoading && (
              <HapticPressable
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
                disabled={isLoading}
                haptic="medium"
                testID="Welcome.button.biometric"
                accessibilityLabel="Sign in with biometrics"
                accessibilityRole="button"
              >
                <Ionicons name={biometricIcon} size={32} color={COLORS.primary} />
                <Text style={styles.biometricButtonText}>
                  Sign in with {biometricType}
                </Text>
              </HapticPressable>
            )}

            <View style={styles.formCard}>
              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(t) => { setEmail(t); setLoginError(null); }}
                    placeholder="you@example.com"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    testID="Welcome.input.email"
                    accessibilityLabel="Email address"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={styles.passwordInput}
                      value={password}
                      onChangeText={(t) => { setPassword(t); setLoginError(null); }}
                      placeholder="Enter your password"
                      placeholderTextColor={COLORS.textMuted}
                      secureTextEntry={!showPassword}
                      testID="Welcome.input.password"
                      accessibilityLabel="Password"
                    />
                    <HapticPressable
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                      haptic="light"
                    >
                      <Text style={styles.eyeButtonText}>
                        {showPassword ? 'Hide' : 'Show'}
                      </Text>
                    </HapticPressable>
                  </View>
                </View>

                {loginError && (
                  <View style={styles.errorCard}>
                    <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
                    <Text style={styles.errorText}>{loginError}</Text>
                  </View>
                )}

                <HapticPressable
                  style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
                  onPress={handleLogin}
                  disabled={isLoading}
                  haptic="medium"
                  testID="Welcome.button.signIn"
                  accessibilityLabel="Sign in"
                  accessibilityRole="button"
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.background} />
                  ) : (
                    <Text style={styles.loginButtonText}>Sign In</Text>
                  )}
                </HapticPressable>

                <HapticPressable
                  onPress={() => navigation.navigate('ForgotPassword')}
                  style={styles.forgotPassword}
                  haptic="light"
                >
                  <Text style={styles.forgotPasswordText}>Forgot your password?</Text>
                </HapticPressable>
              </View>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={RADIUS.full}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}

            <HapticPressable
              style={[styles.googleButton, socialLoading === 'google' && styles.loginButtonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={!!socialLoading}
              haptic="medium"
              testID="Welcome.button.google"
              accessibilityLabel="Sign in with Google"
              accessibilityRole="button"
            >
              {socialLoading === 'google' ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color={COLORS.text} />
                  <Text style={styles.googleButtonText}>Sign in with Google</Text>
                </>
              )}
            </HapticPressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <HapticPressable onPress={() => navigation.navigate('Register')} haptic="light" testID="Welcome.link.createAccount" accessibilityLabel="Create an account" accessibilityRole="link">
                <Text style={styles.footerLink}>Create one</Text>
              </HapticPressable>
            </View>
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
    flex: 1,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xxl + SPACING.lg,
  },
  logo: {
    width: 403,
    height: 144,
    tintColor: COLORS.primary,
  },
  biometricButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl - SPACING.xs,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    gap: SPACING.sm,
  },
  biometricButtonText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.button,
    fontSize: 16,
  },
  formCard: {
    padding: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  form: {
    gap: SPACING.xl - SPACING.xs,
  },
  inputContainer: {
    gap: SPACING.sm,
  },
  label: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  input: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: COLORS.surfaceElevated,
    color: COLORS.text,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  eyeButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
  },
  eyeButtonText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: COLORS.background,
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
  forgotPassword: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
  },
  dividerText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    paddingHorizontal: SPACING.md,
  },
  appleButton: {
    height: 50,
    marginBottom: SPACING.sm,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 50,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
    backgroundColor: COLORS.surface,
  },
  googleButtonText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.xxl,
    paddingVertical: SPACING.xl,
  },
  footerText: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.subheadline,
  },
  footerLink: {
    color: COLORS.primary,
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
  },
});
