import { useState, useEffect, useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRICS_ENABLED_KEY = 'biometricsEnabled';
const STORED_EMAIL_KEY = 'biometricsEmail';
const STORED_PASSWORD_KEY = 'biometricsPassword';

export default function useBiometrics() {
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState(false);
  const [isBiometricsEnabled, setIsBiometricsEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    try {
      // Check if hardware supports biometrics
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        setIsLoading(false);
        return;
      }

      // Check if biometrics are enrolled
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricsAvailable(enrolled);

      // Get biometric type (Face ID, Touch ID, etc.)
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('Face ID');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('Touch ID');
      } else {
        setBiometricType('Biometrics');
      }

      // Check if user has enabled biometrics for this app
      const enabled = await SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY);
      setIsBiometricsEnabled(enabled === 'true');
    } catch (error) {
      console.error('Error checking biometrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const authenticate = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Sign in with ${biometricType || 'Biometrics'}`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      return result.success;
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return false;
    }
  }, [biometricType]);

  const getStoredCredentials = useCallback(async () => {
    try {
      const email = await SecureStore.getItemAsync(STORED_EMAIL_KEY);
      const password = await SecureStore.getItemAsync(STORED_PASSWORD_KEY);

      if (email && password) {
        return { email, password };
      }
      return null;
    } catch (error) {
      console.error('Error getting stored credentials:', error);
      return null;
    }
  }, []);

  const enableBiometrics = useCallback(async (email, password) => {
    try {
      await SecureStore.setItemAsync(STORED_EMAIL_KEY, email);
      await SecureStore.setItemAsync(STORED_PASSWORD_KEY, password);
      await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, 'true');
      setIsBiometricsEnabled(true);
      return true;
    } catch (error) {
      console.error('Error enabling biometrics:', error);
      return false;
    }
  }, []);

  const disableBiometrics = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(STORED_EMAIL_KEY);
      await SecureStore.deleteItemAsync(STORED_PASSWORD_KEY);
      await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, 'false');
      setIsBiometricsEnabled(false);
      return true;
    } catch (error) {
      console.error('Error disabling biometrics:', error);
      return false;
    }
  }, []);

  const hasStoredCredentials = useCallback(async () => {
    try {
      const email = await SecureStore.getItemAsync(STORED_EMAIL_KEY);
      const password = await SecureStore.getItemAsync(STORED_PASSWORD_KEY);
      return !!(email && password);
    } catch (error) {
      return false;
    }
  }, []);

  return {
    isBiometricsAvailable,
    isBiometricsEnabled,
    biometricType,
    isLoading,
    authenticate,
    getStoredCredentials,
    enableBiometrics,
    disableBiometrics,
    hasStoredCredentials,
    refreshBiometrics: checkBiometrics,
  };
}
