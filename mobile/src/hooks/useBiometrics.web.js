// Browser design review does not store passwords or emulate device biometrics.
const unavailable = async () => false;
export default function useBiometrics() {
  return { isBiometricsAvailable: false, isBiometricsEnabled: false, isLoading: false, biometricType: null, authenticate: unavailable, getStoredCredentials: async () => null, enableBiometrics: unavailable, disableBiometrics: unavailable, hasStoredCredentials: unavailable, refreshBiometrics: unavailable };
}
