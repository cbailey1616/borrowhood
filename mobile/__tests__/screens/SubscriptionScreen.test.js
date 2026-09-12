import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { presentIdentityVerificationSheet } from '@stripe/stripe-identity-react-native';
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
  api.createVerificationSession.mockResolvedValueOnce({ sessionId: 'vs_test', ephemeralKeySecret: 'ek_test' });
  const screen = render(<Screen navigation={navigation} route={route} />);
  await screen.findByText('Stripe handles verification and shares the result with Borrowhood.');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify through Stripe' })));
  expect(api.createVerificationSession).toHaveBeenCalledTimes(1);
  expect(presentIdentityVerificationSheet).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'vs_test', ephemeralKeySecret: 'ek_test' }));
  expect(api.createVerificationPayment).not.toHaveBeenCalled();
  expect(api.createSubscription).not.toHaveBeenCalled();
});
