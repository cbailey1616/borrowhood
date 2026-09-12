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
    await findByText('Build town trust. Get verified.');
  });

  it('shows Get verified button', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingVerifyScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Get verified');
  });

  it('shows skip button', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingVerifyScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText("Explore first");
  });

  it('explains optional verification in one simple card', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingVerifyScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Names and profiles are already visible on Town requests, giveaways, and sale posts.');
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
    const skipBtn = await findByText("Explore first");
    await act(async () => { fireEvent.press(skipBtn); });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('OnboardingComplete');
  });
});
