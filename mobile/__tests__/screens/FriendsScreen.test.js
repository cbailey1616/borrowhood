import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getFriends.mockResolvedValue([]); api.getFriendRequests.mockResolvedValue([]); api.searchUsers.mockResolvedValue([]); });
describe('FriendsScreen', () => {
  const route = { params: {} };
  it('fetches friends on mount', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getFriends).toHaveBeenCalled(); });
  });
  it('shows empty friends state', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('No close friends yet');
  });
  it('displays friend list', async () => {
    api.getFriends.mockResolvedValue([{ id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null }]);
    const Screen = require('../../src/screens/FriendsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/Alice/);
  });
  it('renders search tab', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Search');
  });
  it('renders requests tab', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Requests');
  });
});
