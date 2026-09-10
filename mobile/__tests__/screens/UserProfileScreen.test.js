import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
const mockProfile = { id: 'user-2', firstName: 'Alice', lastName: 'Jones', city: 'Boston', state: 'MA', isVerified: true, bio: 'Neighbor', rating: 4.8, ratingCount: 10, totalTransactions: 15, profilePhotoUrl: null };
beforeEach(() => { jest.clearAllMocks(); api.getUser.mockResolvedValue(mockProfile); api.getFriends.mockResolvedValue([]); api.getUserListings.mockResolvedValue([]); api.getUserRatings.mockResolvedValue([]); });
describe('UserProfileScreen', () => {
  const route = { params: { id: 'user-2' } };
  it('fetches user on mount', async () => {
    const Screen = require('../../src/screens/UserProfileScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getUser).toHaveBeenCalledWith('user-2'); });
  });
  it('displays user name', async () => {
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/Alice/);
  });
  it('shows verified badge', async () => {
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/Verified/i);
  });
  it('shows Add Friend button for non-friend', async () => {
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/Add Friend/i);
  });
  it('shows reputation without exposing the full inventory', async () => {
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const { findByText, queryByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/never gives access to this member’s full inventory/);
    expect(queryByText(/Items \(/)).toBeNull();
    expect(api.getUserListings).not.toHaveBeenCalled();
  });
  it('displays tier badge based on transaction count', async () => {
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Outlaw · About ranks');
  });
});

it('offers report and block from another member’s profile', async () => {
  const Screen = require('../../src/screens/UserProfileScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'user-2' } }} />);
  await screen.findByText('Report user');
  expect(screen.getByText('Safety')).toBeTruthy();
  expect(screen.queryByText('More')).toBeNull();
  expect(screen.getByText('Block user')).toBeTruthy();
  expect(api.getUserSafety).toHaveBeenCalledWith('user-2');
});
it('does not offer report/block for your own profile', async () => {
  const Screen = require('../../src/screens/UserProfileScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'user-1' } }} />);
  await screen.findByText('Alice Jones');
  expect(screen.queryByText('Report user')).toBeNull();
  expect(screen.queryByText('Block user')).toBeNull();
});
