import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'free', isVerified: false, profilePhotoUrl: null, onboardingCompleted: false, onboardingStep: 4 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, replace: jest.fn(), reset: jest.fn() };
const mockRefreshUser = jest.fn().mockResolvedValue({ isFounder: false });

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: mockRefreshUser }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.completeOnboarding.mockResolvedValue({});
  api.getCommunities.mockResolvedValue([]);
});

describe('OnboardingCompleteScreen', () => {
  it('renders success title', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingCompleteScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(result.getByText(/All Set/i)).toBeTruthy();
    });
  });

  it('renders Start Exploring button', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingCompleteScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(result.getByTestId('Onboarding.Complete.startExploring')).toBeTruthy();
    });
  });

  it('Start Exploring calls completeOnboarding', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingCompleteScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    const btn = await result.findByTestId('Onboarding.Complete.startExploring');
    await act(async () => { fireEvent.press(btn); });
    expect(api.completeOnboarding).toHaveBeenCalled();
  });
});
