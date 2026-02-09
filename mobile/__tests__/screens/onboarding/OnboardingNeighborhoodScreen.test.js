import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as Location from 'expo-location';
import api from '../../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'free', isVerified: false, profilePhotoUrl: null, onboardingCompleted: false, onboardingStep: 1, city: null, state: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, replace: jest.fn() };
const mockRefreshUser = jest.fn().mockResolvedValue(mockUser);

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: mockRefreshUser }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.getCommunities.mockResolvedValue([]);
  api.getNearbyNeighborhoods.mockResolvedValue([]);
  api.joinCommunity.mockResolvedValue({});
  api.updateOnboardingStep.mockResolvedValue({});
  api.updateProfile.mockResolvedValue({});
});

describe('OnboardingNeighborhoodScreen', () => {
  it('renders title', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    const Screen = require('../../../src/screens/onboarding/OnboardingNeighborhoodScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(result.getByText('Join a Neighborhood')).toBeTruthy();
    });
  });

  it('renders Use My Location button when location denied', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    const Screen = require('../../../src/screens/onboarding/OnboardingNeighborhoodScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(result.getByTestId('Onboarding.Neighborhood.useLocation')).toBeTruthy();
    });
  });

  it('renders city and state inputs when location denied', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    const Screen = require('../../../src/screens/onboarding/OnboardingNeighborhoodScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(result.getByTestId('Onboarding.Neighborhood.cityInput')).toBeTruthy();
      expect(result.getByTestId('Onboarding.Neighborhood.stateInput')).toBeTruthy();
    });
  });

  it('renders continue button after location is auto-detected', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingNeighborhoodScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(result.getByTestId('Onboarding.Neighborhood.continue')).toBeTruthy();
    });
  });

  it('city input accepts text when location denied', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    const Screen = require('../../../src/screens/onboarding/OnboardingNeighborhoodScreen').default;
    const result = render(<Screen navigation={mockNavigation} />);
    const input = await result.findByTestId('Onboarding.Neighborhood.cityInput');
    fireEvent.changeText(input, 'Boston');
  });
});
