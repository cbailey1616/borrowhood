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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [canUseBiometrics, setCanUseBiometrics] = useState(false);
  const [biometricSheetVisible, setBiometricSheetVisible] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);

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
      showError({
        type: 'validation',
        title: 'Missing Information',
        message: 'Please enter your email and password to sign in.',
      });
      return;
    }

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
      showError({
        type: 'auth',
        message: error.message || 'That didn\'t work. Please double-check your email and password and try again.',
      });
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

            <BlurCard style={styles.formCard}>
              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
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
                      onChangeText={setPassword}
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
              </View>
            </BlurCard>

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
