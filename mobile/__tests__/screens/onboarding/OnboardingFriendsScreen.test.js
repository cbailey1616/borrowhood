import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'free', isVerified: false, profilePhotoUrl: null, onboardingCompleted: false, onboardingStep: 2 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, replace: jest.fn() };
const mockRoute = { params: {} };

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: jest.fn() }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.matchContacts.mockResolvedValue([]);
  api.searchUsers.mockResolvedValue([]);
  api.addFriend.mockResolvedValue({});
});

describe('OnboardingFriendsScreen', () => {
  it('renders search bar', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingFriendsScreen').default;
    const { findByTestId } = render(<Screen navigation={mockNavigation} route={mockRoute} />);
    const bar = await findByTestId('Onboarding.Friends.searchBar');
    expect(bar).toBeTruthy();
  });

  it('renders sync contacts button', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingFriendsScreen').default;
    const { findByTestId } = render(<Screen navigation={mockNavigation} route={mockRoute} />);
    const btn = await findByTestId('Onboarding.Friends.syncContacts');
    expect(btn).toBeTruthy();
  });

  it('renders continue button', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingFriendsScreen').default;
    const { findByTestId } = render(<Screen navigation={mockNavigation} route={mockRoute} />);
    const btn = await findByTestId('Onboarding.Friends.continue');
    expect(btn).toBeTruthy();
  });

  it('continue navigates forward', async () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingFriendsScreen').default;
    const { findByTestId } = render(<Screen navigation={mockNavigation} route={mockRoute} />);
    const btn = await findByTestId('Onboarding.Friends.continue');
    await act(async () => { fireEvent.press(btn); });
    expect(mockNavigation.navigate).toHaveBeenCalled();
  });
});
