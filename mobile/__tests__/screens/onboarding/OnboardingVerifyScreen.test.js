import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import api from '../../../src/services/api';
import { openAuthSessionAsync } from 'expo-web-browser';
import Screen from '../../../src/screens/onboarding/OnboardingVerifyScreen';
const navigation = { navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) };
const mockRefreshUser = jest.fn();
jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' }, refreshUser: mockRefreshUser }) }));
beforeEach(() => {
  jest.clearAllMocks();
  api.getVerificationStatus.mockResolvedValue({ status: 'none' });
  api.getVerificationEligibility.mockResolvedValue({ mode: 'free_launch', paymentRequired: false, canStartVerification: true, hasVerificationPurchase: false, isVerified: false });
  api.completeOnboarding.mockResolvedValue({});
  mockRefreshUser.mockResolvedValue({});
  openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
});
const ready = async screen => { await waitFor(() => expect(screen.getByRole('button', { name: 'Verify through Stripe' })).toBeEnabled()); };
it('shows the approved screen and comparison popup without a footer paragraph', async () => {
  const screen = render(<Screen navigation={navigation} />);
  await ready(screen);
  expect(screen.getByText('Get verified.')).toBeTruthy();
  expect(screen.queryByText(/Borrowhood receives/)).toBeNull();
  expect(screen.queryByText('No payment required.')).toBeNull();
  expect(screen.queryByLabelText('Browse Town borrowing. Not verified: Preview. Verified: Yes.')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'What does verification unlock?' }));
  expect(screen.getByLabelText('Browse Town borrowing. Not verified: Preview. Verified: Yes.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Close comparison' }));
  expect(screen.queryByLabelText('Browse Town borrowing. Not verified: Preview. Verified: Yes.')).toBeNull();
});
it('completes setup when verification is skipped, without opening Stripe', async () => {
  const screen = render(<Screen navigation={navigation} />);
  await ready(screen);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Not now' })));
  expect(api.completeOnboarding).toHaveBeenCalledTimes(1);
  expect(mockRefreshUser).toHaveBeenCalledTimes(1);
  expect(api.startIdentityVerification).not.toHaveBeenCalled();
});
it('keeps skip available if verification options cannot load', async () => {
  api.getVerificationEligibility.mockRejectedValueOnce(new Error('Verification unavailable'));
  const screen = render(<Screen navigation={navigation} />);
  await screen.findByText('Verification unavailable');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Not now' })));
  expect(api.completeOnboarding).toHaveBeenCalledTimes(1);
});
it('shows a retryable completion error without claiming setup succeeded', async () => {
  api.completeOnboarding.mockRejectedValueOnce(new Error('offline'));
  const screen = render(<Screen navigation={navigation} />);
  await ready(screen);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Not now' })));
  expect(screen.getByText('Could not finish setup. Please try again.')).toBeTruthy();
  expect(mockRefreshUser).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Not now' })));
  expect(mockRefreshUser).toHaveBeenCalledTimes(1);
});
it('allows already verified members to finish without opening another ID check', async () => {
  api.getVerificationStatus.mockResolvedValue({ verified: true, status: 'verified' });
  const screen = render(<Screen navigation={navigation} />);
  await screen.findByText('You’re verified');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Continue to Borrowhood' })));
  expect(api.completeOnboarding).toHaveBeenCalledTimes(1);
  expect(api.startIdentityVerification).not.toHaveBeenCalled();
});
it('finishes after server-confirmed processing without claiming the member is verified', async () => {
  api.getVerificationStatus.mockResolvedValueOnce({ status: 'none' }).mockResolvedValue({ status: 'processing' });
  const screen = render(<Screen navigation={navigation} />);
  await ready(screen);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify through Stripe' })));
  expect(openAuthSessionAsync).toHaveBeenCalled();
  expect(api.completeOnboarding).toHaveBeenCalledTimes(1);
  expect(mockRefreshUser).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('You’re verified')).toBeNull();
});
it('stays on verification when Stripe is canceled without a submitted check', async () => {
  const screen = render(<Screen navigation={navigation} />);
  await ready(screen);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify through Stripe' })));
  expect(api.completeOnboarding).not.toHaveBeenCalled();
  expect(mockRefreshUser).not.toHaveBeenCalled();
});
it('submits only one completion request after repeated taps', async () => {
  let resolve;
  api.completeOnboarding.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const screen = render(<Screen navigation={navigation} />);
  await ready(screen);
  const button = screen.getByRole('button', { name: 'Not now' });
  act(() => { fireEvent.press(button); fireEvent.press(button); });
  expect(api.completeOnboarding).toHaveBeenCalledTimes(1);
  await act(async () => resolve({}));
});
