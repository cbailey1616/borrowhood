import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HapticPressable from '../../components/HapticPressable';
import BlurCard from '../../components/BlurCard';
import { useAuth } from '../../context/AuthContext';
import { useError } from '../../context/ErrorContext';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const { showError } = useError();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    referralCode: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRegister = async () => {
    const { firstName, lastName, email, phone, password, confirmPassword } = formData;

    if (!firstName || !lastName || !email || !password) {
      showError({
        type: 'validation',
        title: 'Missing Information',
        message: 'Please fill in your name, email, and password to create an account.',
      });
      return;
    }

    if (password.length < 8) {
      showError({
        type: 'validation',
        title: 'Password Too Short',
        message: 'Your password needs to be at least 8 characters for security.',
      });
      return;
    }

    if (password !== confirmPassword) {
      showError({
        type: 'validation',
        title: 'Passwords Don\'t Match',
        message: 'Please make sure your passwords match.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await register({ firstName, lastName, email, phone: phone || undefined, password, referralCode: formData.referralCode || undefined });
      haptics.success();
      navigation.navigate('VerifyIdentity');
    } catch (error) {
      showError({
        message: error.message || 'Unable to create account. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <HapticPressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            haptic="light"
          >
            <Text style={styles.backButtonText}>{'\u2039'}</Text>
          </HapticPressable>

          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Join your neighborhood sharing community</Text>

          <BlurCard style={styles.formCard}>
            <View style={styles.form}>
              <View style={styles.row}>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <Text style={styles.label}>First name</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.firstName}
                    onChangeText={(v) => updateField('firstName', v)}
                    placeholder="John"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="words"
                  />
                </View>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <Text style={styles.label}>Last name</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.lastName}
                    onChangeText={(v) => updateField('lastName', v)}
                    placeholder="Doe"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={formData.email}
                  onChangeText={(v) => updateField('email', v)}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Phone (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.phone}
                  onChangeText={(v) => updateField('phone', v)}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Referral code (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.referralCode}
                  onChangeText={(v) => updateField('referralCode', v)}
                  placeholder="BH-XXXXXXXX"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={formData.password}
                    onChangeText={(v) => updateField('password', v)}
                    placeholder="At least 8 characters"
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

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm password</Text>
                <TextInput
                  style={styles.input}
                  value={formData.confirmPassword}
                  onChangeText={(v) => updateField('confirmPassword', v)}
                  placeholder="Re-enter your password"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={!showPassword}
                />
              </View>

              <HapticPressable
                style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
                onPress={handleRegister}
                disabled={isLoading}
                haptic="medium"
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.background} />
                ) : (
                  <Text style={styles.registerButtonText}>Create Account</Text>
                )}
              </HapticPressable>

              <Text style={styles.terms}>
                By creating an account, you agree to our Terms of Service and Privacy Policy
              </Text>
            </View>
          </BlurCard>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <HapticPressable onPress={() => navigation.navigate('Login')} haptic="light">
              <Text style={styles.footerLink}>Sign in</Text>
            </HapticPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  form: {
    gap: SPACING.xl - SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
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
  registerButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  registerButtonDisabled: {
    opacity: 0.7,
  },
  registerButtonText: {
    color: COLORS.background,
    ...TYPOGRAPHY.headline,
  },
  terms: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
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
});
