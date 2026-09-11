import React from 'react';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import api from '../../src/services/api';
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '999' }));

const mockLogout = jest.fn();
const mockUser = {
  id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com',
  subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null,
  onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5,
  isFounder: false, referralCode: 'BH-TEST',
};
const mockRefreshUser = jest.fn();

const mockNavigation = {
  navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }),
  dispatch: jest.fn(), canGoBack: () => true,
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser, isLoading: false, isAuthenticated: true,
    logout: mockLogout, refreshUser: mockRefreshUser,
  }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  delete mockUser.displayName;
  delete mockUser.endorsement;
  mockUser.totalTransactions = 5;
  mockRefreshUser.mockResolvedValue(mockUser);
});

describe('ProfileScreen', () => {
  it('renders user name', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByTestId } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByTestId('Profile.header.name')).toBeTruthy();
  });

  it('shows verified badge when user.isVerified', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByLabelText } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByLabelText('Verified identity')).toBeTruthy();
  });

  it('shows a refreshed display name while retaining the verified badge', () => {
    mockUser.displayName = 'New public name';
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText, queryByText, getByLabelText } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByText('New public name')).toBeTruthy();
    expect(queryByText('Test User')).toBeNull();
    expect(getByLabelText('Verified identity')).toBeTruthy();
  });

  it('puts the rank symbol beside your name and verification with exchanges underneath', () => {
    mockUser.endorsement = { count: 10, percent: 90, score: 85 };
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const screen = render(<ProfileScreen navigation={mockNavigation} />);
    const identity = within(screen.getByTestId('MemberSummary.identity'));
    expect(identity.getByTestId('Profile.header.name')).toBeTruthy();
    expect(identity.getByLabelText('Verified identity')).toBeTruthy();
    expect(identity.getByLabelText('Neighbor rating: Good, Archer')).toBeTruthy();
    expect(screen.queryByText('Good')).toBeNull();
    expect(screen.queryByText('Archer')).toBeNull();
    expect(screen.getByText('5 completed exchanges')).toBeTruthy();
  });

  // Subscription menu hidden when ENABLE_PAID_TIERS = false
  it('hides subscription menu when paid tiers disabled', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { queryByTestId } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(queryByTestId('Profile.menu.subscription')).toBeNull();
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

  it('keeps payment setup out of the free launch', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { queryByText } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(queryByText('Payment Methods')).toBeNull();
  });

  it('Sign Out shows confirmation ActionSheet', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByTestId, getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    fireEvent.press(getByTestId('Profile.menu.signOut'));
    // ActionSheet should render
    expect(getByText('Are you sure you want to sign out?')).toBeTruthy();
  });

  it('keeps email with account editing', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByText('test@test.com')).toBeTruthy();
  });

  it('refreshes your score when returning to Profile without refetching on every render', async () => {
    mockUser.endorsement = { count: 0, percent: null, score: null, completedCount: 2 };
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const screen = render(<ProfileScreen navigation={mockNavigation} />);
    expect(screen.getByLabelText('Neighbor rating: New neighbor')).toBeTruthy();
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    const onFocus = mockNavigation.addListener.mock.calls.find(([event]) => event === 'focus')[1];
    mockRefreshUser.mockImplementationOnce(async () => {
      mockUser.endorsement = { count: 0, percent: null, score: 78, completedCount: 3 };
      return mockUser;
    });
    await act(async () => { onFocus(); });
    screen.rerender(<ProfileScreen navigation={mockNavigation} />);
    expect(mockRefreshUser).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Neighbor rating: Good, Archer')).toBeTruthy();
    expect(screen.getByText('3 completed exchanges')).toBeTruthy();
    expect(screen.queryByLabelText('Neighbor rating: New neighbor')).toBeNull();
    expect(screen.queryByText('New neighbor')).toBeNull();
  });

  it('opens and dismisses the rank explanation from your current rank', () => {
    mockUser.endorsement = { count: 10, percent: 90, score: 85 };
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const screen = render(<ProfileScreen navigation={mockNavigation} />);
    fireEvent.press(screen.getByLabelText('Neighbor rating: Good, Archer'));
    expect(screen.getByText('Neighbor rating')).toBeTruthy();
    expect(screen.getByText('Outlaw')).toBeTruthy();
    expect(screen.getByText('Robin')).toBeTruthy();
    expect(screen.getByText('Needs work')).toBeTruthy();
    expect(screen.getByText('Excellent')).toBeTruthy();
    expect(screen.queryByText('Starting point')).toBeNull();
    expect(screen.queryByText('New neighbor')).toBeNull();
    expect(screen.getByText('Current')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close rank explanation'));
    expect(screen.queryByText('Neighbor rating')).toBeNull();
    expect(screen.getByLabelText('Neighbor rating: Good, Archer')).toBeTruthy();
  });

  it('displays version number', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { getByText } = render(<ProfileScreen navigation={mockNavigation} />);
    expect(getByText('Borrowhood 1.0.0 · Build 999')).toBeTruthy();
  });
});
it('shows the safety review queue only to administrators', () => {
  const ProfileScreen=require('../../src/screens/ProfileScreen').default;
  mockUser.isAdmin=false;
  const screen=render(<ProfileScreen navigation={mockNavigation} />);
  expect(screen.queryByText('Safety reports')).toBeNull();
  mockUser.isAdmin=true;
  screen.rerender(<ProfileScreen navigation={mockNavigation} />);
  fireEvent.press(screen.getByText('Safety reports'));
  expect(mockNavigation.navigate).toHaveBeenCalledWith('SafetyReports');
  delete mockUser.isAdmin;
});
