import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockLogout = jest.fn();
const mockUser = {
  id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com',
  subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null,
  onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5,
  isFounder: false, referralCode: 'BH-TEST',
};

const mockNavigation = {
  navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }),
  dispatch: jest.fn(), canGoBack: () => true,
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser, isLoading: false, isAuthenticated: true,
    logout: mockLogout, refreshUser: jest.fn(),
  }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

beforeEach(() => jest.clearAllMocks());

describe('ProfileScreen', () => {
  it('renders user name', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByTestId } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByTestId('Profile.header.name')).toBeTruthy();
  });

  it('shows verified badge when user.isVerified', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByText('Verified')).toBeTruthy();
  });

  it('shows rating and transaction count', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByText('5')).toBeTruthy(); // totalTransactions
    expect(getByText('4.5')).toBeTruthy(); // rating
  });

  it('subscription menu navigates', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByTestId } = render(<ProfileScreen navigation={mockNavigation} />);
    fireEvent.press(getByTestId('Profile.menu.subscription'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Subscription');
  });

  it('Edit Profile menu item navigates', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    fireEvent.press(getByText('Edit Profile'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('EditProfile');
  });

  it('Friends menu item navigates', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    fireEvent.press(getByText('Friends'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Friends');
  });

  it('Payment Methods menu item navigates', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    fireEvent.press(getByText('Payment Methods'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PaymentMethods');
  });

  it('Sign Out shows confirmation ActionSheet', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByTestId, getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    fireEvent.press(getByTestId('Profile.menu.signOut'));
    // ActionSheet should render
    expect(getByText('Are you sure you want to sign out?')).toBeTruthy();
  });

  it('displays email', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByText('test@test.com')).toBeTruthy();
  });

  it('displays version number', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByText(/v1\.0\.0/)).toBeTruthy();
  });
});
