import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { openAuthSessionAsync } from 'expo-web-browser';
import * as store from 'expo-iap';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: false, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, popToTop: jest.fn(), replace: jest.fn() };
const mockRefreshUser = jest.fn();
const mockShowError = jest.fn();
const freeEligibility = {
  mode: 'free_launch', productId: 'com.borrowhood.app.verification',
  appAccountToken: '11111111-1111-4111-8111-111111111111',
  paymentRequired: false, canStartVerification: true, hasVerificationPurchase: false, isVerified: false,
};
const paidEligibility = overrides => ({
  ...freeEligibility, mode: 'apple_iap', paymentRequired: true, canStartVerification: false, ...overrides,
});
const ownedPurchase = {
  productId: freeEligibility.productId, purchaseState: 'purchased',
  appAccountToken: freeEligibility.appAccountToken, purchaseToken: 'signed-apple-purchase',
};
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockUser.id = 'user-1';
  api.startIdentityVerification.mockResolvedValue({ verificationUrl: 'https://verify.stripe.com/start/test_session' });
  api.getVerificationStatus.mockResolvedValue({ status: 'none' });
  api.getVerificationEligibility.mockResolvedValue(freeEligibility);
  api.confirmAppleVerificationPurchase.mockReset();
  store.fetchProducts.mockResolvedValue([{ id: freeEligibility.productId, displayPrice: '$1.99' }]);
  store.getAvailablePurchases.mockResolvedValue([]);
  store.getPendingTransactionsIOS.mockResolvedValue([]);
  store.syncIOS.mockResolvedValue(true);
  store.requestPurchase.mockReset();
});
describe('IdentityVerificationScreen', () => {
  it('returns to the original item after town verification rather than clearing the stack', async () => {
    api.getVerificationStatus.mockResolvedValue({ status: 'verified' });
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    render(<Screen navigation={mockNavigation} route={{ params: { source: 'town_browse' } }} />);
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalledTimes(1));
    expect(mockNavigation.popToTop).not.toHaveBeenCalled();
  });

  it('does not open Stripe if the user leaves before the session request returns', async () => {
    let resolve;
    api.startIdentityVerification.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { source: 'generic' } }} />);
    fireEvent.press(await screen.findByTestId('Identity.button.verify'));
    await waitFor(() => expect(api.startIdentityVerification).toHaveBeenCalledTimes(1));
    act(() => mockNavigation.addListener.mock.calls.find(([name]) => name === 'blur')[1]());
    await act(async () => resolve({ verificationUrl: 'https://verify.stripe.com/start/late' }));
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });
  const route = { params: { source: 'generic' } };
  it('renders verify button', async () => { const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.button.verify'); });
  it('renders skip button', async () => { const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.button.skipForNow'); });
  it('shows verified state when already verified', async () => { api.getVerificationStatus.mockResolvedValue({ status: 'verified', verified: true }); const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.status.verified'); });
  it('shows processing state', async () => { api.getVerificationStatus.mockResolvedValue({ status: 'processing' }); const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.status.submitted'); });

  it('opens Stripe and shows the submitted state after the ID check completes', async () => {
    api.getVerificationStatus.mockResolvedValueOnce({ status: 'none' }).mockResolvedValue({ status: 'processing' });
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const button = await screen.findByRole('button', { name: 'Verify now' });
    expect(button.props.testID).toBe('Identity.button.verify');
    await act(async () => fireEvent.press(button));
    expect(api.startIdentityVerification).toHaveBeenCalledTimes(1);
    expect(openAuthSessionAsync).toHaveBeenCalledWith('https://verify.stripe.com/start/test_session', 'borrowhood://verification-complete');
    expect(screen.getByTestId('Identity.status.submitted')).toBeTruthy();
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    expect(mockShowError).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Start Exploring' }));
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the verification action available when Stripe is dismissed', async () => {
    openAuthSessionAsync.mockResolvedValueOnce({ type: 'cancel' });
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const button = await screen.findByTestId('Identity.button.verify');
    await act(async () => fireEvent.press(button));
    expect(screen.getByRole('button', { name: 'Verify now' })).toBeEnabled();
    expect(screen.queryByTestId('Identity.status.submitted')).toBeNull();
    expect(mockShowError).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });

  it('clearly offers free verification without connecting to StoreKit', async () => {
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('No payment required.');
    expect(screen.getByRole('button', { name: 'Verify now' })).toBeEnabled();
    expect(screen.queryByText('Free during launch')).toBeNull();
    expect(screen.queryByText('Restore purchase')).toBeNull();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify now' })));
    expect(store.initConnection).not.toHaveBeenCalled();
    expect(store.fetchProducts).not.toHaveBeenCalled();
    expect(store.requestPurchase).not.toHaveBeenCalled();
  });

  it('uses the localized App Store price and discloses the one-time verification fee', async () => {
    api.getVerificationEligibility.mockResolvedValue(paidEligibility());
    store.fetchProducts.mockResolvedValue([{ id: freeEligibility.productId, displayPrice: '2,29 €' }]);
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    expect(await screen.findByRole('button', { name: 'Verify · 2,29 €' })).toBeEnabled();
    expect(screen.getByText('One-time payment through Apple.')).toBeTruthy();
    expect(screen.getByText('Payment does not guarantee successful identity verification.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore purchase' })).toBeEnabled();
    expect(screen.queryByText(/\$1\.99/)).toBeNull();
    expect(store.requestPurchase).not.toHaveBeenCalled();
  });

  it('lets an entitled user continue without querying a price or charging again', async () => {
    api.getVerificationEligibility.mockResolvedValue(paidEligibility({
      hasVerificationPurchase: true, canStartVerification: true, paymentRequired: false,
    }));
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const button = await screen.findByRole('button', { name: 'Continue verification' });
    await act(async () => fireEvent.press(button));
    expect(api.startIdentityVerification).toHaveBeenCalledTimes(1);
    expect(store.fetchProducts).not.toHaveBeenCalled();
    expect(store.requestPurchase).not.toHaveBeenCalled();
    expect(screen.queryByTestId('Identity.status.verified')).toBeNull();
  });

  it('keeps Restore and Skip usable when the paid product is unavailable', async () => {
    api.getVerificationEligibility.mockResolvedValue(paidEligibility());
    store.fetchProducts.mockResolvedValue([]);
    store.getAvailablePurchases.mockResolvedValue([ownedPurchase]);
    api.confirmAppleVerificationPurchase.mockImplementation(async () => {
      const entitled = paidEligibility({ hasVerificationPurchase: true, canStartVerification: true, paymentRequired: false });
      api.getVerificationEligibility.mockResolvedValue(entitled);
      return entitled;
    });
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByRole('button', { name: 'Verify now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();
    const restore = screen.getByRole('button', { name: 'Restore purchase' });
    expect(restore).toBeEnabled();
    await act(async () => fireEvent.press(restore));
    expect(screen.getByRole('button', { name: 'Continue verification' })).toBeEnabled();
    expect(screen.getByText('Purchase restored. Continue verification.')).toBeTruthy();
    expect(screen.queryByTestId('Identity.status.verified')).toBeNull();
    expect(store.requestPurchase).not.toHaveBeenCalled();
    expect(api.startIdentityVerification).not.toHaveBeenCalled();
  });

  it('retries loading an offer while leaving exploration available', async () => {
    api.getVerificationEligibility.mockRejectedValueOnce(new Error('Verification options are unavailable.'));
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByRole('button', { name: 'Verify now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();
    await act(async () => fireEvent.press(retry));
    expect(screen.getByRole('button', { name: 'Verify now' })).toBeEnabled();
    expect(screen.getByText('No payment required.')).toBeTruthy();
  });

  it('prevents two simultaneous verification attempts', async () => {
    let resolve;
    api.startIdentityVerification.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('No payment required.');
    const button = screen.getByRole('button', { name: 'Verify now' });
    act(() => { fireEvent.press(button); fireEvent.press(button); });
    await waitFor(() => expect(api.startIdentityVerification).toHaveBeenCalledTimes(1));
    await act(async () => resolve({ verificationUrl: 'https://verify.stripe.com/start/test_session' }));
    expect(api.startIdentityVerification).toHaveBeenCalledTimes(1);
  });

  it('shows the new price without purchasing when free launch ends after the offer loaded', async () => {
    api.getVerificationEligibility.mockResolvedValueOnce(freeEligibility).mockResolvedValue(paidEligibility());
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('No payment required.');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify now' })));
    expect(screen.getByRole('button', { name: 'Verify · $1.99' })).toBeEnabled();
    expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Review the current price'),
    }));
    expect(store.requestPurchase).not.toHaveBeenCalled();
    expect(api.startIdentityVerification).not.toHaveBeenCalled();
  });

  it('does not show verified status or open Stripe for a pending Apple purchase', async () => {
    api.getVerificationEligibility.mockResolvedValue(paidEligibility());
    store.requestPurchase.mockResolvedValue({ ...ownedPurchase, purchaseState: 'pending' });
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const button = await screen.findByRole('button', { name: 'Verify · $1.99' });
    await act(async () => fireEvent.press(button));
    expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('awaiting approval'),
    }));
    expect(screen.queryByTestId('Identity.status.verified')).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();
    expect(api.startIdentityVerification).not.toHaveBeenCalled();
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('does not open an old account’s identity session after the signed-in user changes', async () => {
    let resolve;
    api.startIdentityVerification.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('No payment required.');
    fireEvent.press(screen.getByRole('button', { name: 'Verify now' }));
    await waitFor(() => expect(api.startIdentityVerification).toHaveBeenCalledTimes(1));
    mockUser.id = 'user-2';
    screen.rerender(<Screen navigation={mockNavigation} route={route} />);
    await act(async () => resolve({ verificationUrl: 'https://verify.stripe.com/start/previous_account' }));
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Verify now' })).toBeEnabled();
  });
});
