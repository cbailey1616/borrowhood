import React from 'react';
import { openAuthSessionAsync } from 'expo-web-browser';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, reset: jest.fn() };
const mockRefreshUser = jest.fn();
const mockShowError = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ refreshUser: mockRefreshUser }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: mockShowToast }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.getVerificationStatus.mockResolvedValue({ status: 'none' });
});

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

  it('uses the guarded shared verification flow instead of opening an unchecked URL', async () => {
    api.startIdentityVerification.mockResolvedValueOnce({ verificationUrl: 'https://verify.stripe.com/test-session' });
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByRole, findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('No payment required.');
    await act(async () => fireEvent.press(getByRole('button', { name: 'Verify now' })));
    expect(api.startIdentityVerification).toHaveBeenCalledTimes(1);
    expect(openAuthSessionAsync).toHaveBeenCalledWith('https://verify.stripe.com/test-session', 'borrowhood://verification-complete');
    expect(mockShowError).not.toHaveBeenCalled();
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

  it('does not open Stripe after leaving the legacy auth verification screen', async () => {
    let resolve;
    api.startIdentityVerification.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('No payment required.');
    fireEvent.press(screen.getByRole('button', { name: 'Verify now' }));
    await waitFor(() => expect(api.startIdentityVerification).toHaveBeenCalledTimes(1));
    act(() => mockNavigation.addListener.mock.calls.find(([name]) => name === 'blur')[1]());
    await act(async () => resolve({ verificationUrl: 'https://verify.stripe.com/start/late' }));
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('does not navigate after an old status check returns on a different screen', async () => {
    let resolve;
    api.checkVerification.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(screen.getByText("I've already verified"));
    act(() => mockNavigation.addListener.mock.calls.find(([name]) => name === 'blur')[1]());
    await act(async () => resolve({ verified: true }));
    expect(mockRefreshUser).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
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
