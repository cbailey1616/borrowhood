import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'free', isVerified: false, profilePhotoUrl: null, onboardingCompleted: false, onboardingStep: 3 };
const mockReplace = jest.fn();
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, replace: mockReplace };
const mockRefreshUser = jest.fn().mockResolvedValue({ subscriptionTier: 'free' });

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: mockRefreshUser }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => { jest.clearAllMocks(); api.updateOnboardingStep.mockResolvedValue({}); });

describe('OnboardingPlanScreen', () => {
  // With ENABLE_PAID_TIERS = false, the screen auto-skips
  it('calls replace with OnboardingComplete and updates step', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingPlanScreen').default;
    let rendered;
    await act(async () => {
      try {
        rendered = render(<Screen navigation={mockNavigation} />);
      } catch {
        // Component may fail to mount in test renderer due to immediate navigation
      }
      // Flush microtasks for the async skipPlan function
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(mockReplace).toHaveBeenCalledWith('OnboardingComplete');
    expect(api.updateOnboardingStep).toHaveBeenCalledWith(4);
  });
});
