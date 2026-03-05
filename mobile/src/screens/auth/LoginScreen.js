import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HapticPressable from '../../components/HapticPressable';
import { useAuth } from '../../context/AuthContext';
import { haptics } from '../../utils/haptics';
import { Ionicons } from '../../components/Icon';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);

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
    } catch (error) {
      haptics.error();
      setLoginError(error.message || 'Incorrect email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <HapticPressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          haptic="light"
        >
          <Text style={styles.backButtonText}>{'\u2039'}</Text>
        </HapticPressable>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

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

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <HapticPressable onPress={() => navigation.navigate('Register')} haptic="light">
            <Text style={styles.footerLink}>Sign up</Text>
          </HapticPressable>
        </View>
        <HapticPressable
          style={styles.findAccount}
          onPress={() => navigation.navigate('FindAccount')}
          haptic="light"
        >
          <Text style={styles.findAccountText}>Can't find your account?</Text>
        </HapticPressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: SPACING.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  backButtonText: {
    fontSize: 36,
    color: COLORS.text,
    fontWeight: '300',
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xxl,
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
  forgotPassword: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingVertical: SPACING.xl,
  },
  footerText: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.footnote,
  },
  footerLink: {
    color: COLORS.primary,
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
  },
  findAccount: {
    alignItems: 'center',
    paddingBottom: SPACING.md,
  },
  findAccountText: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.caption1,
  },
});
