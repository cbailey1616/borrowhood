import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'free', isVerified: false, profilePhotoUrl: null, onboardingCompleted: false, onboardingStep: 3 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, replace: jest.fn() };
const mockRefreshUser = jest.fn().mockResolvedValue({ subscriptionTier: 'free' });

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: mockRefreshUser }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => { jest.clearAllMocks(); api.updateOnboardingStep.mockResolvedValue({}); });

describe('OnboardingPlanScreen', () => {
  it('renders Choose Your Plan title', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingPlanScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(result.getByText('Choose Your Plan')).toBeTruthy();
    });
  });

  it('renders Free and Plus plan names', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingPlanScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      const freeMatches = result.getAllByText(/Free/);
      expect(freeMatches.length).toBeGreaterThan(0);
    });
    const plusMatches = result.getAllByText(/Plus/);
    expect(plusMatches.length).toBeGreaterThan(0);
  });

  it('Start Free button renders', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingPlanScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(result.getByTestId('Onboarding.Plan.startFree')).toBeTruthy();
    });
  });

  it('Start Free navigates to OnboardingComplete', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingPlanScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    const btn = await result.findByTestId('Onboarding.Plan.startFree');
    await act(async () => { fireEvent.press(btn); });
    expect(mockNavigation.navigate).toHaveBeenCalled();
  });

  it('Go Plus button renders', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingPlanScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(result.getByTestId('Onboarding.Plan.goPlus')).toBeTruthy();
    });
  });
});
