import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';

// Use actual AuthContext
jest.unmock('../../src/context/AuthContext');
const { AuthProvider, useAuth } = jest.requireActual('../../src/context/AuthContext');

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Auth Flow Integration', () => {
  it('register stores tokens and sets user', async () => {
    const mockUser = { id: 'u-1', firstName: 'New', lastName: 'User' };
    api.register.mockResolvedValue({ user: mockUser, accessToken: 'tok', refreshToken: 'ref' });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.register({ firstName: 'New', lastName: 'User', email: 'new@test.com', password: 'pass1234' });
    });
    expect(api.register).toHaveBeenCalled();
  });

  it('login stores tokens and sets user', async () => {
    const mockUser = { id: 'u-1', firstName: 'Test', lastName: 'User' };
    api.login.mockResolvedValue({ user: mockUser, accessToken: 'tok', refreshToken: 'ref' });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login('test@test.com', 'password123');
    });
    expect(api.login).toHaveBeenCalledWith('test@test.com', 'password123');
  });

  it('login failure does not set user', async () => {
    api.login.mockRejectedValue(new Error('Invalid credentials'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    try {
      await act(async () => {
        await result.current.login('bad@test.com', 'wrong');
      });
    } catch (e) {}
    expect(result.current.user).toBeFalsy();
  });

  it('logout clears user', async () => {
    const mockUser = { id: 'u-1', firstName: 'Test', lastName: 'User' };
    api.login.mockResolvedValue({ user: mockUser, accessToken: 'tok', refreshToken: 'ref' });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login('test@test.com', 'password123');
    });
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.user).toBeFalsy();
  });

  it('checks SecureStore for token on mount', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValue('stored-token');
    api.getMe.mockResolvedValue({ id: 'u-1', firstName: 'Stored', lastName: 'User' });
    renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('accessToken');
    });
  });
});
