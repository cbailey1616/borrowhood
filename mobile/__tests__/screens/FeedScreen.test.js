import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = {
  id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com',
  subscriptionTier: 'plus', isVerified: true, city: 'Boston', state: 'MA',
  latitude: 42.36, longitude: -71.06, profilePhotoUrl: null,
  onboardingCompleted: true, onboardingStep: 5, rating: 4.5, ratingCount: 10,
  totalTransactions: 5, isFounder: false, referralCode: 'BH-TEST', hasConnectAccount: false,
};

const mockNavigation = {
  navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }),
  dispatch: jest.fn(), canGoBack: () => true,
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: jest.fn() }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.getFeed.mockResolvedValue({ items: [], hasMore: false });
  api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]);
  api.getBadgeCount.mockResolvedValue({ messages: 0, notifications: 0, actions: 0, total: 0 });
});

describe('FeedScreen', () => {
  it('renders feed items from api.getFeed', async () => {
    api.getFeed.mockResolvedValue({
      items: [{
        id: 'listing-1', type: 'listing', title: 'Power Drill', isFree: true, pricePerDay: 0,
        condition: 'good', visibility: 'close_friends',
        user: { id: 'user-2', firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null, isVerified: false, totalTransactions: 0 },
        photoUrl: 'https://test.com/photo.jpg', createdAt: new Date().toISOString(),
      }],
      hasMore: false,
    });
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { findByText } = render(<FeedScreen navigation={mockNavigation} />);
    await findByText('Power Drill');
    expect(api.getFeed).toHaveBeenCalled();
  });

  it('empty feed shows empty state', async () => {
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { findByText } = render(<FeedScreen navigation={mockNavigation} />);
    await findByText('No activity yet');
  });

  it('search bar renders', async () => {
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { findByTestId } = render(<FeedScreen navigation={mockNavigation} />);
    await findByTestId('Feed.searchBar');
  });

  it('create button renders', async () => {
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { findByTestId } = render(<FeedScreen navigation={mockNavigation} />);
    const createBtn = await findByTestId('Feed.button.create');
    expect(createBtn).toBeTruthy();
  });

  it('tap listing navigates to ListingDetail', async () => {
    api.getFeed.mockResolvedValue({
      items: [{
        id: 'listing-1', type: 'listing', title: 'Camera', isFree: true, pricePerDay: 0,
        condition: 'good', visibility: 'close_friends',
        user: { id: 'user-2', firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null, isVerified: false, totalTransactions: 0 },
        photoUrl: 'https://test.com/photo.jpg', createdAt: new Date().toISOString(),
      }],
      hasMore: false,
    });
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { findByText } = render(<FeedScreen navigation={mockNavigation} />);
    const listing = await findByText('Camera');
    fireEvent.press(listing);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ListingDetail', expect.objectContaining({ id: 'listing-1' }));
  });
});
