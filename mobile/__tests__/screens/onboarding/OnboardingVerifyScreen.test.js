import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockRefreshUser = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ refreshUser: mockRefreshUser }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.getVerificationStatus.mockResolvedValue({ status: 'none' });
});

describe('OnboardingVerifyScreen', () => {
  it('renders verify title after status check', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingVerifyScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Verify Your Identity');
  });

  it('shows Verify with ID button', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingVerifyScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Verify with ID');
  });

  it('shows skip button', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingVerifyScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText("I'll do this later");
  });

  it('displays tier comparison cards', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingVerifyScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Without Verification');
    await findByText('With Verification');
  });

  it('shows already verified state when user is verified', async () => {
    api.getVerificationStatus.mockResolvedValue({ verified: true, status: 'submitted' });
    const Screen = require('../../../src/screens/onboarding/OnboardingVerifyScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Already Verified');
  });

  it('skip navigates to OnboardingComplete', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingVerifyScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    const skipBtn = await findByText("I'll do this later");
    await act(async () => { fireEvent.press(skipBtn); });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('OnboardingComplete');
  });
});
