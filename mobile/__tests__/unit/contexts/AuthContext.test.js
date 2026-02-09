import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../src/services/api';

// Unmock the context so we test the real implementation
jest.unmock('../../../src/context/AuthContext');
const { AuthProvider, useAuth } = jest.requireActual('../../../src/context/AuthContext');

const mockResponse = {
  user: { id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com' },
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
};

beforeEach(() => {
  jest.clearAllMocks();
  SecureStore.getItemAsync.mockResolvedValue(null);
  api.getMe.mockResolvedValue(mockResponse.user);
  api.login.mockResolvedValue(mockResponse);
  api.register.mockResolvedValue(mockResponse);
  api.loginWithGoogle.mockResolvedValue(mockResponse);
  api.loginWithApple.mockResolvedValue(mockResponse);
});

const wrapper = ({ children }) => React.createElement(AuthProvider, null, children);

describe('AuthContext', () => {
  it('throws when useAuth used outside provider', () => {
    // Suppress console.error for expected error
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within AuthProvider');
    spy.mockRestore();
  });

  it('starts with isLoading true and user null', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('checks SecureStore for token on mount', async () => {
    renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('accessToken');
    });
  });

  it('restores session from stored token', async () => {
    SecureStore.getItemAsync.mockResolvedValue('stored-token');
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockResponse.user);
    });
    expect(api.setAuthToken).toHaveBeenCalledWith('stored-token');
    expect(api.getMe).toHaveBeenCalled();
  });

  it('login stores tokens and sets user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => { expect(result.current.isLoading).toBe(false); });
    await act(async () => {
      await result.current.login('test@test.com', 'password');
    });
    expect(api.login).toHaveBeenCalledWith('test@test.com', 'password');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', 'test-access-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refreshToken', 'test-refresh-token');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('register stores tokens and sets user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => { expect(result.current.isLoading).toBe(false); });
    await act(async () => {
      await result.current.register({ email: 'new@test.com', password: 'pass123' });
    });
    expect(api.register).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('loginWithGoogle stores tokens and sets user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => { expect(result.current.isLoading).toBe(false); });
    await act(async () => {
      await result.current.loginWithGoogle('google-id-token');
    });
    expect(api.loginWithGoogle).toHaveBeenCalledWith('google-id-token');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('loginWithApple stores tokens and sets user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => { expect(result.current.isLoading).toBe(false); });
    await act(async () => {
      await result.current.loginWithApple('apple-identity-token', { givenName: 'Test' });
    });
    expect(api.loginWithApple).toHaveBeenCalledWith('apple-identity-token', { givenName: 'Test' });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('logout clears tokens and user', async () => {
    SecureStore.getItemAsync.mockResolvedValue('stored-token');
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => { expect(result.current.isAuthenticated).toBe(true); });
    await act(async () => {
      await result.current.logout();
    });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('accessToken');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refreshToken');
    expect(api.setAuthToken).toHaveBeenCalledWith(null);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('refreshUser calls api.getMe and updates user', async () => {
    SecureStore.getItemAsync.mockResolvedValue('stored-token');
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => { expect(result.current.isAuthenticated).toBe(true); });
    const updatedUser = { ...mockResponse.user, firstName: 'Updated' };
    api.getMe.mockResolvedValue(updatedUser);
    await act(async () => {
      await result.current.refreshUser();
    });
    expect(result.current.user.firstName).toBe('Updated');
  });
});
