import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null, city: 'Boston', state: 'MA', latitude: 42.36, longitude: -71.06 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getCommunities.mockResolvedValue([]); api.joinCommunity.mockResolvedValue({}); api.createCommunity.mockResolvedValue({ id: 'comm-new' }); });
describe('JoinCommunityScreen', () => {
  it('loads neighborhoods after returning from setting a profile location', async () => {
    const { useFocusEffect } = require('@react-navigation/native');
    const originalFocusEffect = useFocusEffect.getMockImplementation();
    useFocusEffect.mockImplementation(cb => React.useEffect(cb, [cb]));
    mockUser.city = null;
    try {
      const Screen = require('../../src/screens/JoinCommunityScreen').default;
      const screen = render(<Screen navigation={mockNavigation} />);
      await waitFor(() => expect(api.getCommunities).not.toHaveBeenCalled());
      mockUser.city = 'Boston';
      api.getCommunities.mockResolvedValue([{ id: 'comm-1', name: 'Boston Neighbors' }]);
      screen.rerender(<Screen navigation={mockNavigation} />);
      await screen.findByText('Boston Neighbors');
      expect(api.getCommunities).toHaveBeenCalledTimes(1);
    } finally {
      mockUser.city = 'Boston';
      useFocusEffect.mockImplementation(originalFocusEffect);
    }
  });
  it('fetches communities on mount', async () => {
    const Screen = require('../../src/screens/JoinCommunityScreen').default;
    render(<Screen navigation={mockNavigation} />);
    await waitFor(() => { expect(api.getCommunities).toHaveBeenCalled(); });
  });
  it('displays community list', async () => {
    api.getCommunities.mockResolvedValue([{ id: 'comm-1', name: 'Downtown Boston', memberCount: 50, distance: 0.5, description: 'A great neighborhood', isMember: false, imageUrl: null }]);
    const Screen = require('../../src/screens/JoinCommunityScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Downtown Boston');
  });
  it('shows create new neighborhood option', async () => {
    const Screen = require('../../src/screens/JoinCommunityScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText(/Create New/i);
  });
  it('renders search input', async () => {
    const Screen = require('../../src/screens/JoinCommunityScreen').default;
    const { findByPlaceholderText } = render(<Screen navigation={mockNavigation} />);
    await findByPlaceholderText(/search/i);
  });
});
