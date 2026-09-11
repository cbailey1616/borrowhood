import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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
    const { findByLabelText, queryByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByLabelText('Verified identity');
    expect(queryByText('Verified identity')).toBeNull();
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
  it('shows one score and its woodland rank with completed exchanges for context', async () => {
    api.getUser.mockResolvedValue({ ...mockProfile, endorsement: { count: 10, percent: 90, score: 85 } });
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByLabelText('Neighbor Score 85 out of 100');
    expect(screen.getByText('Archer')).toBeTruthy();
    expect(screen.getByText('15 completed exchanges')).toBeTruthy();
    expect(screen.queryByText('Rank')).toBeNull();
  });
  it('shows new members as New and refreshes their score when returning', async () => {
    api.getUser.mockResolvedValue({ ...mockProfile, endorsement: { count: 0, percent: null, score: null } });
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('New neighbor');
    api.getUser.mockResolvedValue({ ...mockProfile, endorsement: { count: 1, percent: 0, score: 63 } });
    const onFocus = mockNavigation.addListener.mock.calls.find(([event]) => event === 'focus')[1];
    await act(async () => { onFocus(); });
    await screen.findByLabelText('Neighbor Score 63 out of 100');
    expect(screen.getByText('Squire')).toBeTruthy();
    expect(screen.queryByText('New neighbor')).toBeNull();
    api.getUser.mockResolvedValue({ ...mockProfile, endorsement: { count: 10, percent: 40, score: 52 } });
    await act(async () => { onFocus(); });
    await screen.findByText('Outlaw');
    expect(screen.queryByText('Squire')).toBeNull();
  });
  it('shows the same score and rank when opening your own profile route', async () => {
    api.getUser.mockResolvedValue({ ...mockProfile, id: 'user-1', endorsement: { count: 10, percent: 90, score: 85 } });
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'user-1' } }} />);
    await screen.findByText('Alice Jones');
    expect(screen.getByLabelText('Neighbor Score 85 out of 100')).toBeTruthy();
    expect(screen.getByText('Archer')).toBeTruthy();
    expect(screen.getByText('15 completed exchanges')).toBeTruthy();
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
