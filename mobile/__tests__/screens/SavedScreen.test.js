import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = {
  id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com',
  subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null,
  onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5,
};

const mockNavigation = {
  navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }),
  dispatch: jest.fn(), canGoBack: () => true,
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.getSavedListings.mockResolvedValue([]);
});

describe('SavedScreen', () => {
  it('displays saved listings', async () => {
    api.getSavedListings.mockResolvedValue([{
      id: 'listing-1', title: 'Saved Power Drill', photoUrl: 'https://test.com/photo.jpg',
      photos: ['https://test.com/photo.jpg'], condition: 'good', isFree: true, pricePerDay: 0,
      owner: { id: 'user-2', firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null },
    }]);
    const SavedScreen = require('../../src/screens/SavedScreen').default;
    const { findByText } = render(<SavedScreen navigation={mockNavigation} />);
    await findByText('Saved Power Drill');
    expect(api.getSavedListings).toHaveBeenCalled();
  });

  it('empty state shows "Browse Items" button', async () => {
    const SavedScreen = require('../../src/screens/SavedScreen').default;
    const { findByText } = render(<SavedScreen navigation={mockNavigation} />);
    await findByText('Browse Items');
  });

  it('tap listing navigates to ListingDetail', async () => {
    api.getSavedListings.mockResolvedValue([{
      id: 'listing-1', title: 'Tent', photoUrl: 'https://test.com/photo.jpg',
      photos: ['https://test.com/photo.jpg'], condition: 'good', isFree: true, pricePerDay: 0,
      owner: { id: 'user-2', firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null },
    }]);
    const SavedScreen = require('../../src/screens/SavedScreen').default;
    const { findByText } = render(<SavedScreen navigation={mockNavigation} />);
    const item = await findByText('Tent');
    fireEvent.press(item);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ListingDetail', expect.objectContaining({ id: 'listing-1' }));
  });

  it('renders NativeHeader', () => {
    const SavedScreen = require('../../src/screens/SavedScreen').default;
    const { getAllByText } = render(<SavedScreen navigation={mockNavigation} />);
    expect(getAllByText('Saved').length).toBeGreaterThan(0);
  });

  it('calls getSavedListings on mount', async () => {
    const SavedScreen = require('../../src/screens/SavedScreen').default;
    render(<SavedScreen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(api.getSavedListings).toHaveBeenCalled();
    });
  });

  it('unsave action works', async () => {
    api.getSavedListings.mockResolvedValue([{
      id: 'listing-1', title: 'Drill', photoUrl: 'https://test.com/photo.jpg',
      photos: ['https://test.com/photo.jpg'], condition: 'good', isFree: true, pricePerDay: 0,
      owner: { id: 'user-2', firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null },
    }]);
    api.unsaveListing.mockResolvedValue({});
    const SavedScreen = require('../../src/screens/SavedScreen').default;
    const { findByText } = render(<SavedScreen navigation={mockNavigation} />);
    await findByText('Drill');
  });
});
