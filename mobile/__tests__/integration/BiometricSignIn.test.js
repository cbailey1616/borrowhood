import React from 'react';
import { Alert, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../src/services/api';
import useBiometrics from '../../src/hooks/useBiometrics';

jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn() }) }));
jest.unmock('../../src/context/AuthContext');
const { AuthProvider, useAuth } = jest.requireActual('../../src/context/AuthContext');
const WelcomeScreen = require('../../src/screens/auth/WelcomeScreen').default;

const authenticate = jest.fn();
const enableBiometrics = jest.fn();
const getStoredCredentials = jest.fn();
const response = { user: { id: 'neighbor-1', email: 'neighbor@example.test' }, accessToken: 'access', refreshToken: 'refresh' };
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
let auth;
function AppFlow() {
  auth = useAuth();
  if (auth.isLoading) return null;
  return auth.isAuthenticated ? <Text>Signed in</Text> : <WelcomeScreen navigation={navigation} />;
}
beforeEach(() => {
  jest.clearAllMocks();
  SecureStore.getItemAsync.mockResolvedValue(null);
  api.login.mockResolvedValue(response);
  api.getMe.mockResolvedValue(response.user);
  authenticate.mockResolvedValue(true);
  enableBiometrics.mockResolvedValue(true);
  getStoredCredentials.mockResolvedValue(null);
  useBiometrics.mockReturnValue({
    isBiometricsAvailable: true, isBiometricsEnabled: false, isLoading: false, biometricType: 'Face ID',
    authenticate, enableBiometrics, getStoredCredentials, hasStoredCredentials: jest.fn().mockResolvedValue(false),
  });
});

async function signIn() {
  const screen = render(<View><AuthProvider><AppFlow /></AuthProvider></View>);
  fireEvent.changeText(await screen.findByTestId('Welcome.input.email'), 'neighbor@example.test');
  fireEvent.changeText(screen.getByTestId('Welcome.input.password'), 'new-password');
  await act(async () => fireEvent.press(screen.getByTestId('Welcome.button.signIn')));
  await screen.findByText('Signed in');
  expect(screen.queryByTestId('Welcome.input.email')).toBeNull();
  return screen;
}

it('keeps enrollment available after the sign-in screen unmounts and saves only after device approval', async () => {
  const screen = await signIn();
  await screen.findByText('Enable Face ID?');
  expect(enableBiometrics).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Enable')));
  await waitFor(() => expect(enableBiometrics).toHaveBeenCalledWith('neighbor@example.test', 'new-password'));
  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(auth.isAuthenticated).toBe(true);
  expect(screen.queryByText('Enable Face ID?')).toBeNull();
});

it('lets the user skip Face ID without losing the signed-in session', async () => {
  const screen = await signIn();
  await act(async () => fireEvent.press(await screen.findByText('Not now')));
  expect(enableBiometrics).not.toHaveBeenCalled();
  expect(authenticate).not.toHaveBeenCalled();
  expect(auth.isAuthenticated).toBe(true);
});

it('does not save credentials if the native Face ID prompt is cancelled', async () => {
  authenticate.mockResolvedValue(false);
  const screen = await signIn();
  await act(async () => fireEvent.press(await screen.findByText('Enable')));
  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(enableBiometrics).not.toHaveBeenCalled();
  expect(auth.isAuthenticated).toBe(true);
});

it('refreshes an already-enabled saved password after a successful password sign-in', async () => {
  useBiometrics.mockReturnValue({ ...useBiometrics(), isBiometricsEnabled: true });
  getStoredCredentials.mockResolvedValue({ email: 'NEIGHBOR@example.test', password: 'old-password' });
  const screen = await signIn();
  await waitFor(() => expect(enableBiometrics).toHaveBeenCalledWith('neighbor@example.test', 'new-password'));
  expect(screen.queryByText('Enable Face ID?')).toBeNull();
});

it('asks before replacing another account saved for Face ID', async () => {
  useBiometrics.mockReturnValue({ ...useBiometrics(), isBiometricsEnabled: true });
  getStoredCredentials.mockResolvedValue({ email: 'another@example.test', password: 'other-password' });
  const screen = await signIn();
  await screen.findByText('Enable Face ID?');
  expect(enableBiometrics).not.toHaveBeenCalled();
});

it('does not save an old account when the session ends during the native prompt', async () => {
  let finish;
  authenticate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const screen = await signIn();
  await act(async () => fireEvent.press(await screen.findByText('Enable')));
  await act(async () => auth.logout());
  await act(async () => finish(true));
  expect(enableBiometrics).not.toHaveBeenCalled();
  expect(auth.isAuthenticated).toBe(false);
});

it('keeps a successful login when device storage cannot save Face ID', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  enableBiometrics.mockResolvedValue(false);
  const screen = await signIn();
  await act(async () => fireEvent.press(await screen.findByText('Enable')));
  expect(alert).toHaveBeenCalledWith('Couldn’t save Face ID', expect.any(String));
  expect(auth.isAuthenticated).toBe(true);
  expect(screen.queryByText('Enable Face ID?')).toBeNull();
  alert.mockRestore();
});

it('does not offer or save Face ID credentials after a rejected password', async () => {
  api.login.mockRejectedValueOnce(new Error('Incorrect password.'));
  const screen = render(<View><AuthProvider><AppFlow /></AuthProvider></View>);
  fireEvent.changeText(await screen.findByTestId('Welcome.input.email'), 'neighbor@example.test');
  fireEvent.changeText(screen.getByTestId('Welcome.input.password'), 'wrong-password');
  await act(async () => fireEvent.press(screen.getByTestId('Welcome.button.signIn')));
  expect(screen.getByText('Incorrect password.')).toBeTruthy();
  expect(screen.queryByText('Enable Face ID?')).toBeNull();
  expect(enableBiometrics).not.toHaveBeenCalled();
  expect(auth.isAuthenticated).toBe(false);
});
