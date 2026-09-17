import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { openAuthSessionAsync } from 'expo-web-browser';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: false, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, popToTop: jest.fn(), replace: jest.fn() };
const mockRefreshUser = jest.fn();
const mockShowError = jest.fn();
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.startIdentityVerification.mockResolvedValue({ verificationUrl: 'https://verify.stripe.com/start/test_session' }); api.getVerificationStatus.mockResolvedValue({ status: 'none' }); });
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
    const button = await screen.findByRole('button', { name: 'Verify through Stripe' });
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
    expect(screen.getByRole('button', { name: 'Verify through Stripe' })).toBeEnabled();
    expect(screen.queryByTestId('Identity.status.submitted')).toBeNull();
    expect(mockShowError).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });
});
