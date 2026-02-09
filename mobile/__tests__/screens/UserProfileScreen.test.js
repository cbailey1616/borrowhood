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
  it('shows items and reviews tabs', async () => {
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    // Tab labels render as "Items (0)" and "Reviews (0)"
    await findByText(/Items \(/);
    await findByText(/Reviews \(/);
  });
  it('displays transaction count', async () => {
    const Screen = require('../../src/screens/UserProfileScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('15');
  });
});
