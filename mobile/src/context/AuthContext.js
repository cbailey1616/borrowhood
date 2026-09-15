import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import api from '../services/api';
import usePushNotifications, { resetPushSession } from '../hooks/usePushNotifications';
import { revokePushRegistration } from '../utils/pushRegistration';

const AuthContext = createContext(null);

export function AuthProvider({ children, navigationRef }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const sessionRevision = useRef(0);
  const credentialWrites = useRef(Promise.resolve());
  const assertCurrent = revision => {
    if (revision !== sessionRevision.current) throw Object.assign(new Error('Your account changed. Please sign in again.'), { code: 'SESSION_CHANGED' });
  };
  const writeCredentials = task => {
    const next = credentialWrites.current.catch(() => {}).then(task);
    credentialWrites.current = next;
    return next;
  };
  const acceptSession = (response, revision, { hydrate = true, passwordChange = false } = {}) => writeCredentials(async () => {
    assertCurrent(revision);
    if (!response.accessToken || !response.refreshToken || (!passwordChange && !response.user)) throw new Error('Could not confirm your session. Please try again.');
    try {
      await SecureStore.setItemAsync('accessToken', response.accessToken);
      await SecureStore.setItemAsync('refreshToken', response.refreshToken);
      assertCurrent(revision);
    } catch (error) {
      // Credential writes are serialized, so cleanup cannot erase a newer login.
      await Promise.allSettled([SecureStore.deleteItemAsync('accessToken'), SecureStore.deleteItemAsync('refreshToken')]);
      throw error;
    }
    api.setAuthToken(response.accessToken);
    if (!passwordChange) {
      setUser(response.user);
      setIsAuthenticated(true);
      if (hydrate) api.getMe().then(full => {
        if (revision === sessionRevision.current) setUser(current => current?.id === response.user.id ? full : current);
      }).catch(() => {});
    }
    return response.user;
  });

  // Initialize push notifications when user is authenticated
  usePushNotifications(isAuthenticated, user, isLoading);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => api.setSessionExpiredHandler?.(() => logout({ sessionExpired: true })), []);

  const checkAuth = async () => {
    const revision = sessionRevision.current;
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      assertCurrent(revision);
      if (token) {
        api.setAuthToken(token);
        const userData = await api.getMe();
        assertCurrent(revision);
        setUser(userData);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.log('Auth check failed:', error);
      // Only logout on auth errors (401), not network failures
      if (revision === sessionRevision.current && error?.status === 401) {
        await logout();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password, pendingLink) => {
    const revision = ++sessionRevision.current;
    const response = await api.login(email, password);
    assertCurrent(revision);
    // Keep the welcome screen visible until both proofs have been checked.
    if (pendingLink) await api.linkAccount(pendingLink.provider, pendingLink.token, response.accessToken);
    return acceptSession(response, revision);
  };

  const register = async (data) => {
    const response = await api.register(data);
    if (!response.verificationRequired || !response.challengeId) throw new Error('Could not start email verification. Please try again.');
    return response;
  };

  const verifySignupCode = async (challengeId, code) => {
    const revision = ++sessionRevision.current;
    const response = await api.verifySignupCode(challengeId, code);
    if (!response.accessToken || !response.refreshToken || !response.user) throw new Error('Could not confirm your account. Please try again.');
    return acceptSession(response, revision, { hydrate: false });
  };

  const loginWithGoogle = async (idToken) => {
    const revision = ++sessionRevision.current;
    const response = await api.loginWithGoogle(idToken);
    return acceptSession(response, revision);
  };

  const loginWithApple = async (identityToken, fullName) => {
    const revision = ++sessionRevision.current;
    const response = await api.loginWithApple(identityToken, fullName);
    return acceptSession(response, revision);
  };

  const completeSocialLinkCode = async (pendingLink, challengeId, code) => {
    const revision = ++sessionRevision.current;
    const response = await api.completeSocialLinkCode(pendingLink.provider, pendingLink.token, challengeId, code);
    return acceptSession(response, revision);
  };

  const logout = async ({ sessionExpired = false } = {}) => {
    const revision = ++sessionRevision.current;
    try { await revokePushRegistration(); }
    catch (error) {
      if (!sessionExpired) {
        Alert.alert('Couldn’t sign out', 'Connect to the internet and try again so this device stops receiving notifications.');
        return false;
      }
      // Keep the revocation capability for retry on the next launch/sign-in.
    }
    return writeCredentials(async () => {
      if (revision !== sessionRevision.current) return false;
      await resetPushSession();
      if (revision !== sessionRevision.current) return false;
      api.setAuthToken(null);
      setUser(null);
      setIsAuthenticated(false);
      await Promise.allSettled([
        SecureStore.deleteItemAsync('accessToken'),
        SecureStore.deleteItemAsync('refreshToken'),
      ]);
      return true;
    });
  };

  const changePassword = async (currentPassword, newPassword) => {
    const revision = sessionRevision.current;
    const response = await api.changePassword(currentPassword, newPassword);
    await acceptSession(response, revision, { passwordChange: true });
  };

  const refreshUser = useCallback(async () => {
    const revision = sessionRevision.current;
    try {
      const userData = await api.getMe();
      assertCurrent(revision);
      setUser(current => current?.id === userData.id ? userData : current);
      return userData;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      throw error;
    }
  }, []);

  const isGracePeriodActive = useMemo(() => {
    if (!user?.verificationGraceUntil) return false;
    return new Date(user.verificationGraceUntil) > new Date();
  }, [user?.verificationGraceUntil]);

  const value = {
    user,
    isLoading,
    isAuthenticated,
    isGracePeriodActive,
    login,
    loginWithGoogle,
    loginWithApple,
    completeSocialLinkCode,
    register,
    verifySignupCode,
    logout,
    changePassword,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
