import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import SocialSignInButtons from '../../../src/components/SocialSignInButtons';

const mockGoogle = jest.fn();
const mockApple = jest.fn();
jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ loginWithGoogle: mockGoogle, loginWithApple: mockApple }) }));
beforeEach(() => { jest.clearAllMocks(); mockGoogle.mockResolvedValue({}); mockApple.mockResolvedValue({}); });

it('passes the SDK v16 Google token to the existing session flow', async () => {
  const screen = render(<SocialSignInButtons />);
  fireEvent.press(screen.getByTestId('Auth.google'));
  await waitFor(() => expect(mockGoogle).toHaveBeenCalledWith('mock-google-token'));
  expect(GoogleSignin.configure).toHaveBeenCalledWith(expect.objectContaining({ webClientId: expect.stringContaining('.apps.googleusercontent.com') }));
});
it('keeps cancellation quiet and allows a retry', async () => {
  GoogleSignin.signIn.mockResolvedValueOnce({ type: 'cancelled' });
  const screen = render(<SocialSignInButtons />);
  await act(async () => fireEvent.press(screen.getByTestId('Auth.google')));
  expect(mockGoogle).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.press(screen.getByTestId('Auth.google'));
  await waitFor(() => expect(mockGoogle).toHaveBeenCalledTimes(1));
});
it('does not call the API without a Google ID token', async () => {
  GoogleSignin.signIn.mockResolvedValueOnce({ type: 'success', data: {} });
  const screen = render(<SocialSignInButtons />);
  fireEvent.press(screen.getByTestId('Auth.google'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(mockGoogle).not.toHaveBeenCalled();
});
it('checks Apple state and passes first-sign-in name information', async () => {
  const screen = render(<SocialSignInButtons />);
  fireEvent.press(await screen.findByTestId('Auth.apple'));
  await waitFor(() => expect(mockApple).toHaveBeenCalledWith('apple-token', { givenName: 'Chris' }));
});
it('rejects a mismatched Apple response', async () => {
  AppleAuthentication.signInAsync.mockResolvedValueOnce({ identityToken: 'apple-token', state: 'different' });
  const screen = render(<SocialSignInButtons />);
  fireEvent.press(await screen.findByTestId('Auth.apple'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(mockApple).not.toHaveBeenCalled();
});
it('asks for existing-account proof rather than creating a duplicate', async () => {
  mockGoogle.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { status: 409, code: 'ACCOUNT_LINK_REQUIRED' }));
  const onLinkRequired = jest.fn();
  const screen = render(<SocialSignInButtons onLinkRequired={onLinkRequired} />);
  fireEvent.press(screen.getByTestId('Auth.google'));
  await waitFor(() => expect(onLinkRequired).toHaveBeenCalledWith({ provider: 'google', token: { idToken: 'mock-google-token' } }));
});
it('prevents duplicate taps from starting overlapping sign-ins', async () => {
  let complete;
  GoogleSignin.signIn.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const screen = render(<SocialSignInButtons />);
  fireEvent.press(screen.getByTestId('Auth.google'));
  fireEvent.press(screen.getByTestId('Auth.google'));
  expect(GoogleSignin.signIn).toHaveBeenCalledTimes(1);
  await act(async () => complete({ type: 'cancelled' }));
});
