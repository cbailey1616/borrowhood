import { renderHook, act } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

jest.unmock('../../../src/hooks/useBiometrics');

// Re-import the real hook
const useBiometrics = jest.requireActual('../../../src/hooks/useBiometrics').default;

describe('useBiometrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
    LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([2]); // FACIAL_RECOGNITION
    SecureStore.getItemAsync.mockResolvedValue(null);
  });

  it('returns availability and enabled state', async () => {
    const { result } = renderHook(() => useBiometrics());
    await act(async () => {});
    expect(result.current.isBiometricsAvailable).toBe(true);
    expect(result.current.isBiometricsEnabled).toBe(false);
    expect(result.current.biometricType).toBe('Face ID');
  });

  it('enableBiometrics stores credentials', async () => {
    const { result } = renderHook(() => useBiometrics());
    await act(async () => {});
    await act(async () => {
      await result.current.enableBiometrics('test@test.com', 'password');
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('biometricsEmail', 'test@test.com');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('biometricsPassword', 'password');
    expect(result.current.isBiometricsEnabled).toBe(true);
  });

  it('disableBiometrics clears credentials', async () => {
    SecureStore.getItemAsync.mockResolvedValue('true');
    const { result } = renderHook(() => useBiometrics());
    await act(async () => {});
    await act(async () => {
      await result.current.disableBiometrics();
    });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('biometricsEmail');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('biometricsPassword');
    expect(result.current.isBiometricsEnabled).toBe(false);
  });

  it('detects Touch ID when fingerprint is supported', async () => {
    LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([1]); // FINGERPRINT
    const { result } = renderHook(() => useBiometrics());
    await act(async () => {});
    expect(result.current.biometricType).toBe('Touch ID');
  });
});
