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
import BlurCard from '../../components/BlurCard';
import { useError } from '../../context/ErrorContext';
import api from '../../services/api';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function ForgotPasswordScreen({ navigation }) {
  const { showError } = useError();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState('email'); // 'email' | 'reset'
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestReset = async () => {
    if (!email) {
      showError({
        type: 'validation',
        message: 'Please enter your email address.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await api.forgotPassword(email);
      setStep('reset');
    } catch (error) {
      showError({
        type: 'network',
        message: error.message || 'Couldn\'t send the reset code. Please check your connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!code || code.length !== 6) {
      showError({
        type: 'validation',
        message: 'Please enter the 6-digit code from your email.',
      });
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      showError({
        type: 'validation',
        message: 'Your new password needs to be at least 8 characters.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      showError({
        type: 'validation',
        message: 'Your passwords don\'t match. Please re-enter them.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await api.resetPassword(email, code, newPassword);
      haptics.success();
      showError({
        type: 'success',
        title: 'You\'re all set!',
        message: 'Your password has been reset. Go ahead and sign in with your new password.',
      });
      navigation.navigate('Login');
    } catch (error) {
      showError({
        type: 'auth',
        message: error.message || 'That code doesn\'t look right. Please check your email and try again, or request a new code.',
      });
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

        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          {step === 'email'
            ? "Enter your email and we'll send you a reset code."
            : 'Enter the code from your email and your new password.'}
        </Text>

        <BlurCard style={styles.formCard}>
          <View style={styles.form}>
            {step === 'email' ? (
              <>
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
                  />
                </View>

                <HapticPressable
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleRequestReset}
                  disabled={isLoading}
                  haptic="medium"
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.background} />
                  ) : (
                    <Text style={styles.buttonText}>Send Reset Code</Text>
                  )}
                </HapticPressable>
              </>
            ) : (
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Reset Code</Text>
                  <TextInput
                    style={styles.input}
                    value={code}
                    onChangeText={setCode}
                    placeholder="123456"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>New Password</Text>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter your password"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry
                  />
                </View>

                <HapticPressable
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleResetPassword}
                  disabled={isLoading}
                  haptic="medium"
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.background} />
                  ) : (
                    <Text style={styles.buttonText}>Reset Password</Text>
                  )}
                </HapticPressable>

                <HapticPressable
                  style={styles.resendButton}
                  onPress={handleRequestReset}
                  haptic="light"
                >
                  <Text style={styles.resendButtonText}>Resend code</Text>
                </HapticPressable>
              </>
            )}
          </View>
        </BlurCard>
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
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: COLORS.background,
    ...TYPOGRAPHY.headline,
  },
  resendButton: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  resendButtonText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
  },
});
