import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import { useError } from '../../context/ErrorContext';
import api from '../../services/api';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STEPS = ['email', 'code', 'password'];

function getPasswordStrength(password) {
  if (!password) return { label: '', color: 'transparent', width: 0 };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { label: 'Weak', color: '#C0392B', width: 0.33 };
  if (score <= 3) return { label: 'Fair', color: '#F39C12', width: 0.66 };
  return { label: 'Strong', color: COLORS.primary, width: 1 };
}

export default function ForgotPasswordScreen({ navigation }) {
  const { showError } = useError();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const digitRefs = useRef([]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const animateStep = (nextStep) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep(nextStep);
  };

  const handleSendCode = async () => {
    if (!email) {
      showError({ type: 'validation', message: 'Please enter your email address.' });
      return;
    }
    setIsLoading(true);
    try {
      await api.forgotPassword(email);
      setResendCooldown(60);
      animateStep('code');
      haptics.light();
    } catch (error) {
      showError({
        type: 'network',
        message: error.message || "Couldn't send the reset code. Please check your connection.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDigitChange = (text, index) => {
    const newDigits = [...digits];
    // Handle paste of full code
    if (text.length > 1) {
      const pasted = text.replace(/\D/g, '').slice(0, 6).split('');
      pasted.forEach((d, i) => { if (i < 6) newDigits[i] = d; });
      setDigits(newDigits);
      if (pasted.length >= 6) {
        handleVerifyCode(newDigits.join(''));
      } else {
        digitRefs.current[Math.min(pasted.length, 5)]?.focus();
      }
      return;
    }

    newDigits[index] = text.replace(/\D/g, '');
    setDigits(newDigits);

    if (text && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }

    // Auto-submit on 6th digit
    if (text && index === 5) {
      const fullCode = newDigits.join('');
      if (fullCode.length === 6) {
        handleVerifyCode(fullCode);
      }
    }
  };

  const handleDigitKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
    }
  };

  const handleVerifyCode = async (code) => {
    if (!code || code.length !== 6) {
      showError({ type: 'validation', message: 'Please enter the 6-digit code from your email.' });
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.verifyResetCode(email, code);
      setResetToken(response.resetToken);
      animateStep('password');
      haptics.success();
    } catch (error) {
      haptics.error();
      setDigits(['', '', '', '', '', '']);
      digitRefs.current[0]?.focus();
      showError({
        type: 'auth',
        message: error.message || "That code doesn't look right. Please check your email and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setIsLoading(true);
    try {
      await api.forgotPassword(email);
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      haptics.light();
      showError({
        type: 'success',
        title: 'Code sent',
        message: 'A new reset code has been sent to your email.',
      });
    } catch (error) {
      showError({ type: 'network', message: "Couldn't resend the code. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      showError({ type: 'validation', message: 'Your new password needs to be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      showError({ type: 'validation', message: "Your passwords don't match. Please re-enter them." });
      return;
    }
    setIsLoading(true);
    try {
      await api.resetPassword(resetToken, newPassword);
      haptics.success();
      showError({
        type: 'success',
        title: "You're all set!",
        message: 'Your password has been reset. Go ahead and sign in with your new password.',
      });
      navigation.navigate('Login');
    } catch (error) {
      haptics.error();
      showError({
        type: 'auth',
        message: error.message || 'Reset token expired. Please start over.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'email') {
      navigation.goBack();
    } else if (step === 'code') {
      animateStep('email');
    } else {
      animateStep('code');
      setDigits(['', '', '', '', '', '']);
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const strength = getPasswordStrength(newPassword);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <HapticPressable style={styles.backButton} onPress={handleBack} haptic="light">
          <Text style={styles.backButtonText}>{'\u2039'}</Text>
        </HapticPressable>

        {/* Step dots */}
        <View style={styles.dotsRow}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[styles.dot, i <= stepIndex && styles.dotActive]}
            />
          ))}
        </View>

        <Text style={styles.title}>
          {step === 'email' && 'Reset password'}
          {step === 'code' && 'Enter your code'}
          {step === 'password' && 'Set new password'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'email' && "Enter your email and we'll send you a 6-digit reset code."}
          {step === 'code' && `We sent a code to ${email}. It expires in 1 hour.`}
          {step === 'password' && 'Choose a strong password for your account.'}
        </Text>

        <View style={styles.formCard}>
          <View style={styles.form}>
            {/* Step 1: Email */}
            {step === 'email' && (
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
                    autoFocus
                  />
                </View>
                <HapticPressable
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleSendCode}
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
            )}

            {/* Step 2: Code */}
            {step === 'code' && (
              <>
                <View style={styles.digitRow}>
                  {digits.map((d, i) => (
                    <TextInput
                      key={i}
                      ref={el => digitRefs.current[i] = el}
                      style={[styles.digitBox, d ? styles.digitBoxFilled : null]}
                      value={d}
                      onChangeText={text => handleDigitChange(text, i)}
                      onKeyPress={e => handleDigitKeyPress(e, i)}
                      keyboardType="number-pad"
                      maxLength={i === 0 ? 6 : 1}
                      autoFocus={i === 0}
                      selectTextOnFocus
                    />
                  ))}
                </View>

                {isLoading && (
                  <View style={styles.verifyingRow}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.verifyingText}>Verifying...</Text>
                  </View>
                )}

                <HapticPressable
                  style={styles.resendButton}
                  onPress={handleResend}
                  disabled={resendCooldown > 0 || isLoading}
                  haptic="light"
                >
                  <Text style={[styles.resendButtonText, resendCooldown > 0 && styles.resendDisabled]}>
                    {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                  </Text>
                </HapticPressable>
              </>
            )}

            {/* Step 3: New Password */}
            {step === 'password' && (
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>New Password</Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={styles.passwordInput}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="At least 8 characters"
                      placeholderTextColor={COLORS.textMuted}
                      secureTextEntry={!showPassword}
                      autoFocus
                    />
                    <HapticPressable
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                      haptic="light"
                    >
                      <Text style={styles.eyeButtonText}>{showPassword ? 'Hide' : 'Show'}</Text>
                    </HapticPressable>
                  </View>
                  {/* Strength indicator */}
                  {newPassword.length > 0 && (
                    <View style={styles.strengthRow}>
                      <View style={styles.strengthBar}>
                        <View style={[styles.strengthFill, { width: `${strength.width * 100}%`, backgroundColor: strength.color }]} />
                      </View>
                      <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter your password"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry={!showPassword}
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
              </>
            )}
          </View>
        </View>
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
    marginBottom: SPACING.md,
  },
  backButtonText: {
    fontSize: 36,
    color: COLORS.text,
    fontWeight: '300',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
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
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceElevated,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthLabel: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
  },
  digitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  digitBox: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  digitBoxFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryMuted,
  },
  verifyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  verifyingText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.primary,
    fontWeight: '500',
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
  resendDisabled: {
    color: COLORS.textMuted,
  },
});
