import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { presentIdentityVerificationSheet } from '@stripe/stripe-identity-react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: false, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, popToTop: jest.fn(), replace: jest.fn() };
const mockRefreshUser = jest.fn();
const mockShowError = jest.fn();
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.createVerificationSession.mockResolvedValue({ sessionId: 'vs_test', ephemeralKeySecret: 'ek_test' }); api.getVerificationStatus.mockResolvedValue({ status: 'none' }); });
describe('IdentityVerificationScreen', () => {
  const route = { params: { source: 'generic' } };
  it('renders verify button', async () => { const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.button.verify'); });
  it('renders skip button', async () => { const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.button.skipForNow'); });
  it('shows verified state when already verified', async () => { api.getVerificationStatus.mockResolvedValue({ status: 'verified', verified: true }); const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.status.verified'); });
  it('shows processing state', async () => { api.getVerificationStatus.mockResolvedValue({ status: 'processing' }); const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.status.submitted'); });

  it('opens Stripe and shows the submitted state after the ID check completes', async () => {
    const Screen = require('../../src/screens/IdentityVerificationScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const button = await screen.findByRole('button', { name: 'Verify through Stripe' });
    expect(button.props.testID).toBe('Identity.button.verify');
    await act(async () => fireEvent.press(button));
    expect(api.createVerificationSession).toHaveBeenCalledTimes(1);
    expect(presentIdentityVerificationSheet).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'vs_test', ephemeralKeySecret: 'ek_test',
    }));
    expect(screen.getByTestId('Identity.status.submitted')).toBeTruthy();
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    expect(mockShowError).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Start Exploring' }));
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the verification action available when Stripe is dismissed', async () => {
    presentIdentityVerificationSheet.mockResolvedValueOnce({ error: { code: 'FlowCanceled' } });
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
