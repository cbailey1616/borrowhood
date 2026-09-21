import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { openAuthSessionAsync } from 'expo-web-browser';
import api from '../../src/services/api';
import Screen from '../../src/screens/SubscriptionScreen';
const mockUser = { id: 'user-1', firstName: 'Test', isVerified: false, subscriptionTier: 'free' };
const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
const mockRefreshUser = jest.fn();
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); mockUser.subscriptionTier = 'free'; api.getVerificationStatus.mockResolvedValue({ status: 'none' }); });
const route = { params: { source: 'generic' } };
it('uses the identity screen for legacy subscription links', async () => {
  const screen = render(<Screen navigation={navigation} route={route} />);
  await screen.findByTestId('Identity.button.verify');
  expect(api.getCurrentSubscription).not.toHaveBeenCalled();
});
it('does not offer a subscription or display a verification price', () => {
  const screen = render(<Screen navigation={navigation} route={route} />);
  expect(screen.queryByTestId('Subscription.button.subscribe')).toBeNull();
  expect(screen.queryByText(/\$1/)).toBeNull();
});
it('keeps verification optional from the generic entry point', async () => {
  const screen = render(<Screen navigation={navigation} route={route} />);
  fireEvent.press(await screen.findByTestId('Identity.button.skipForNow'));
  expect(navigation.goBack).toHaveBeenCalled();
});
it('does not treat a legacy paid tier as identity verification', async () => {
  mockUser.subscriptionTier = 'plus';
  const screen = render(<Screen navigation={navigation} route={route} />);
  await screen.findByTestId('Identity.button.verify');
  expect(api.createSubscription).not.toHaveBeenCalled();
});
it('explains Stripe verification and starts it without collecting payment information', async () => {
  api.startIdentityVerification.mockResolvedValueOnce({ verificationUrl: 'https://verify.stripe.com/start/test_session' });
  const screen = render(<Screen navigation={navigation} route={route} />);
  await screen.findByText('Identity verification is securely provided by Stripe.');
  await screen.findByText('No payment required.');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify now' })));
  expect(api.startIdentityVerification).toHaveBeenCalledTimes(1);
  expect(openAuthSessionAsync).toHaveBeenCalledWith('https://verify.stripe.com/start/test_session', 'borrowhood://verification-complete');
  expect(api.createVerificationPayment).not.toHaveBeenCalled();
  expect(api.createSubscription).not.toHaveBeenCalled();
});
