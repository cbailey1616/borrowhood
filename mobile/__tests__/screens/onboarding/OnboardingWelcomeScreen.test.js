import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'free', isVerified: false, profilePhotoUrl: null, onboardingCompleted: false, onboardingStep: 0 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, replace: jest.fn() };

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: jest.fn() }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => { jest.clearAllMocks(); });

describe('OnboardingWelcomeScreen', () => {
  it('renders welcome title', () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingWelcomeScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} />);
    expect(getByText(/Welcome to BorrowHood/i)).toBeTruthy();
  });

  it('renders Get Started button', () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingWelcomeScreen').default;
    const { getByTestId } = render(<Screen navigation={mockNavigation} />);
    expect(getByTestId('Onboarding.Welcome.getStarted')).toBeTruthy();
  });

  it('Get Started navigates to OnboardingNeighborhood', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingWelcomeScreen').default;
    const { getByTestId } = render(<Screen navigation={mockNavigation} />);
    await act(async () => { fireEvent.press(getByTestId('Onboarding.Welcome.getStarted')); });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('OnboardingNeighborhood');
  });

  it('calls api.updateOnboardingStep', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingWelcomeScreen').default;
    const { getByTestId } = render(<Screen navigation={mockNavigation} />);
    await act(async () => { fireEvent.press(getByTestId('Onboarding.Welcome.getStarted')); });
    expect(api.updateOnboardingStep).toHaveBeenCalled();
  });
});
