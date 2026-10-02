import useReduceMotion from '../../hooks/useReduceMotion';
import TextInput from '../../components/AppTextInput';
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
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
import { CARD_SURFACE, COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function FindAccountScreen({ navigation }) {
  const { showError } = useError();
  const reduceMotion = useReduceMotion();
  const [step, setStep] = useState('choose'); // 'choose' | 'phone' | 'name' | 'success'
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const animateStep = (nextStep) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep(nextStep);
  };

  const handleSearch = async () => {
    if (step === 'phone' && !phone) {
      showError({ type: 'validation', message: 'Please enter a phone number.' });
      return;
    }
    if (step === 'name' && (!firstName || !lastName)) {
      showError({ type: 'validation', message: 'Please enter both first and last name.' });
      return;
    }

    setIsLoading(true);
    try {
      const params = step === 'phone' ? { phone } : { firstName, lastName };
      await api.findAccount(params);
      animateStep('success');
    } catch (error) {
      showError({
        type: 'network',
        message: error.message || "Couldn't search right now. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'choose') {
      navigation.goBack();
    } else if (step === 'success') {
      navigation.navigate('Login');
    } else {
      animateStep('choose');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <HapticPressable style={styles.backButton} onPress={handleBack} >
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </HapticPressable>

        {step !== 'success' ? (
          <>
            <Text style={styles.title}>Find your account</Text>
            <Text style={styles.subtitle}>
              {step === 'choose' && "We'll send a login hint to the email on file."}
              {step === 'phone' && 'Enter the phone number associated with your account.'}
              {step === 'name' && 'Enter the name you used when you signed up.'}
            </Text>
          </>
        ) : null}

        {/* Choose method */}
        {step === 'choose' && (
          <View style={styles.optionsContainer}>
            <HapticPressable pressedBackgroundColor={COLORS.cardHover}
              style={styles.optionCard}
              onPress={() => animateStep('phone')}

            >
              <Ionicons name="call-outline" size={22} color={COLORS.textSecondary} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Search by phone number</Text>
                <Text style={styles.optionSubtitle}>Find your account using your phone</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </HapticPressable>
            <View style={styles.optionSeparator} />
            <HapticPressable pressedBackgroundColor={COLORS.cardHover}
              style={styles.optionCard}
              onPress={() => animateStep('name')}

            >
              <Ionicons name="person-outline" size={22} color={COLORS.textSecondary} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Search by name</Text>
                <Text style={styles.optionSubtitle}>Find your account using your name</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </HapticPressable>
          </View>
        )}

        {/* Phone search */}
        {step === 'phone' && (
          <View style={styles.formCard}>
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Phone number</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                  autoFocus
                />
              </View>
              <HapticPressable scaleDown={0.97}
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleSearch}
                disabled={isLoading}

              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.background} />
                ) : (
                  <Text style={styles.buttonText}>Search</Text>
                )}
              </HapticPressable>
            </View>
          </View>
        )}

        {/* Name search */}
        {step === 'name' && (
          <View style={styles.formCard}>
            <View style={styles.form}>
              <View style={styles.row}>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <Text style={styles.label}>First name</Text>
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="John"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="words"
                    autoFocus
                  />
                </View>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <Text style={styles.label}>Last name</Text>
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Doe"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="words"
                  />
                </View>
              </View>
              <HapticPressable scaleDown={0.97}
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleSearch}
                disabled={isLoading}

              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.background} />
                ) : (
                  <Text style={styles.buttonText}>Search</Text>
                )}
              </HapticPressable>
            </View>
          </View>
        )}

        {/* Success state */}
        {step === 'success' && (
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} illustrated={true} color={COLORS.primary} />
            </View>
            <Text style={styles.successTitle}>Check your inbox</Text>
            <Text style={styles.successText}>
              If we found a matching account, we sent a login hint to the email on file.
            </Text>

            <HapticPressable scaleDown={0.97}
              style={styles.button}
              onPress={() => navigation.navigate('Login')}

            >
              <Text style={styles.buttonText}>Back to Login</Text>
            </HapticPressable>
          </View>
        )}
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
  content: {
    flexGrow: 1,
    padding: SPACING.xl,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  backButtonText: {
    ...TYPOGRAPHY.largeTitle,
    color: COLORS.text,
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
  optionsContainer: {
    ...CARD_SURFACE,
    overflow: 'hidden',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  optionSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
    marginLeft: SPACING.lg + 22 + SPACING.md,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  optionSubtitle: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: 2,
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
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  inputContainer: {
    gap: SPACING.sm,
  },
  label: {
    ...TYPOGRAPHY.buttonCaption,
    color: COLORS.textSecondary,
  },
  input: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    ...TYPOGRAPHY.body,
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
  successContainer: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
  },
  successIcon: {
    marginBottom: SPACING.lg,
  },
  successTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  successText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
    maxWidth: 280,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.primaryMuted,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.borderGreen,
  },
  hintText: {
    flex: 1,
    ...TYPOGRAPHY.footnote,
    color: COLORS.primary,
    lineHeight: 20,
  },
});
