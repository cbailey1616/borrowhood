import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, reset: jest.fn() };
const mockRefreshUser = jest.fn();
const mockShowError = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ refreshUser: mockRefreshUser }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: mockShowToast }) }));

beforeEach(() => jest.clearAllMocks());

describe('VerifyIdentityScreen', () => {
  const route = { params: {} };

  it('renders verify screen with title', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Verify to borrow across town')).toBeTruthy();
  });

  it('explains which borrowing options need verification', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByLabelText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByLabelText('Borrow from friends. Not verified: available. Verified: available.')).toBeTruthy();
    expect(getByLabelText('Borrow in your neighborhood. Not verified: available. Verified: available.')).toBeTruthy();
    expect(getByLabelText('Borrow across town. Not verified: not available. Verified: available.')).toBeTruthy();
  });

  it('opens the Stripe verification URL from its clearly named button', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    api.startIdentityVerification.mockResolvedValueOnce({ verificationUrl: 'https://verify.stripe.com/test-session' });
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByRole } = render(<Screen navigation={mockNavigation} route={route} />);
    await act(async () => fireEvent.press(getByRole('button', { name: 'Verify through Stripe' })));
    expect(api.startIdentityVerification).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith('https://verify.stripe.com/test-session');
    expect(mockShowError).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it('refreshes the account when an existing verification is confirmed', async () => {
    api.checkVerification.mockResolvedValueOnce({ verified: true });
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await act(async () => fireEvent.press(getByText("I've already verified")));
    expect(api.checkVerification).toHaveBeenCalledTimes(1);
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('has skip for now button', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Skip for now')).toBeTruthy();
  });

  it('skip button shows ActionSheet confirmation', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(getByText('Skip for now'));
    expect(getByText('Skip Verification?')).toBeTruthy();
  });
});
