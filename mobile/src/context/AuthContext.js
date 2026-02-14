import { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';
import usePushNotifications from '../hooks/usePushNotifications';

const AuthContext = createContext(null);

export function AuthProvider({ children, navigationRef }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize push notifications when user is authenticated
  usePushNotifications(isAuthenticated);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        api.setAuthToken(token);
        const userData = await api.getMe();
        setUser(userData);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.log('Auth check failed:', error);
      // Only logout on auth errors (401), not network failures
      if (error?.status === 401) {
        await logout();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await api.login(email, password);
    await SecureStore.setItemAsync('accessToken', response.accessToken);
    await SecureStore.setItemAsync('refreshToken', response.refreshToken);
    api.setAuthToken(response.accessToken);
    setUser(response.user);
    setIsAuthenticated(true);
    // Fetch full user profile in background (login response has limited fields)
    api.getMe().then(full => setUser(full)).catch(() => {});
    return response.user;
  };

  const register = async (data) => {
    const response = await api.register(data);
    await SecureStore.setItemAsync('accessToken', response.accessToken);
    await SecureStore.setItemAsync('refreshToken', response.refreshToken);
    api.setAuthToken(response.accessToken);
    setUser(response.user);
    setIsAuthenticated(true);
    return response.user;
  };

  const loginWithGoogle = async (idToken) => {
    const response = await api.loginWithGoogle(idToken);
    await SecureStore.setItemAsync('accessToken', response.accessToken);
    await SecureStore.setItemAsync('refreshToken', response.refreshToken);
    api.setAuthToken(response.accessToken);
    setUser(response.user);
    setIsAuthenticated(true);
    api.getMe().then(full => setUser(full)).catch(() => {});
    return response.user;
  };

  const loginWithApple = async (identityToken, fullName) => {
    const response = await api.loginWithApple(identityToken, fullName);
    await SecureStore.setItemAsync('accessToken', response.accessToken);
    await SecureStore.setItemAsync('refreshToken', response.refreshToken);
    api.setAuthToken(response.accessToken);
    setUser(response.user);
    setIsAuthenticated(true);
    api.getMe().then(full => setUser(full)).catch(() => {});
    return response.user;
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    api.setAuthToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  const refreshUser = async () => {
    try {
      const userData = await api.getMe();
      setUser(userData);
      return userData;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      throw error;
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated,
    login,
    loginWithGoogle,
    loginWithApple,
    register,
    logout,
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
