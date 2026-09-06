import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import api from '../../src/services/api';
import Screen from '../../src/screens/SubscriptionScreen';
const mockUser = { id: 'user-1', firstName: 'Test', isVerified: false, subscriptionTier: 'free' };
const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: jest.fn() }) }));
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
it('explains identity handling without collecting payment information', async () => {
  const screen = render(<Screen navigation={navigation} route={route} />);
  await screen.findByText(/Your ID images are handled by Stripe/);
  expect(api.createVerificationPayment).not.toHaveBeenCalled();
});
