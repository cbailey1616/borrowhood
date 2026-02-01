import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { useError } from '../../context/ErrorContext';
import useBiometrics from '../../hooks/useBiometrics';
import { COLORS } from '../../utils/config';

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
        } else {
          showError({
            type: 'auth',
            message: 'No stored credentials found. Please sign in with your password.',
          });
        }
      }
    } catch (error) {
      showError({
        type: 'auth',
        message: error.message || 'Unable to sign in. Please check your credentials.',
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

      // After successful login, prompt to enable biometrics if available but not enabled
      if (isBiometricsAvailable && !isBiometricsEnabled) {
        setTimeout(() => {
          Alert.alert(
            `Enable ${biometricType || 'Biometrics'}?`,
            `Would you like to use ${biometricType || 'biometrics'} for faster sign in next time?`,
            [
              { text: 'Not Now', style: 'cancel' },
              {
                text: 'Enable',
                onPress: async () => {
                  await enableBiometrics(email, password);
                },
              },
            ]
          );
        }, 500);
      }
    } catch (error) {
      showError({
        type: 'auth',
        message: error.message || 'Unable to sign in. Please check your email and password.',
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
              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
                disabled={isLoading}
              >
                <Ionicons name={biometricIcon} size={32} color={COLORS.primary} />
                <Text style={styles.biometricButtonText}>
                  Sign in with {biometricType}
                </Text>
              </TouchableOpacity>
            )}

            {canUseBiometrics && (
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or use password</Text>
                <View style={styles.dividerLine} />
              </View>
            )}

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
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                  >
                    <Text style={styles.eyeButtonText}>
                      {showPassword ? 'Hide' : 'Show'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.background} />
                ) : (
                  <Text style={styles.loginButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.footerLink}>Create one</Text>
              </TouchableOpacity>
            </View>
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
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 403,
    height: 144,
  },
  biometricButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 16,
    gap: 8,
  },
  biometricButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.gray[700],
  },
  dividerText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray[700],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[700],
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  eyeButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  eyeButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 12,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: COLORS.background,
    fontSize: 17,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
    paddingVertical: 24,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },
  footerLink: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
