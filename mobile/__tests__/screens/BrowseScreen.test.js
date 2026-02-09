import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null, onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => { jest.clearAllMocks(); api.getListings.mockResolvedValue([]); api.getRequests.mockResolvedValue([]); api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]); });

describe('BrowseScreen', () => {
  it('fetches listings on mount', async () => {
    const BrowseScreen = require('../../src/screens/BrowseScreen').default;
    render(<BrowseScreen navigation={mockNavigation} />);
    await waitFor(() => { expect(api.getListings).toHaveBeenCalled(); });
  });

  it('displays listing cards', async () => {
    api.getListings.mockResolvedValue([{ id: 'l-1', title: 'Drill', condition: 'good', isFree: true, pricePerDay: 0, photoUrl: 'https://test.com/photo.jpg', owner: { id: 'u-2', firstName: 'Alice', lastName: 'J', profilePhotoUrl: null, isVerified: false, totalTransactions: 0 }, visibility: 'close_friends', createdAt: new Date().toISOString() }]);
    const BrowseScreen = require('../../src/screens/BrowseScreen').default;
    const { findByText } = render(<BrowseScreen navigation={mockNavigation} />);
    await findByText('Drill');
  });

  it('tap listing navigates to ListingDetail', async () => {
    api.getListings.mockResolvedValue([{ id: 'l-1', title: 'Saw', condition: 'good', isFree: true, pricePerDay: 0, photoUrl: 'https://test.com/photo.jpg', owner: { id: 'u-2', firstName: 'Alice', lastName: 'J', profilePhotoUrl: null, isVerified: false, totalTransactions: 0 }, visibility: 'close_friends', createdAt: new Date().toISOString() }]);
    const BrowseScreen = require('../../src/screens/BrowseScreen').default;
    const { findByText } = render(<BrowseScreen navigation={mockNavigation} />);
    const item = await findByText('Saw');
    fireEvent.press(item);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ListingDetail', expect.objectContaining({ id: 'l-1' }));
  });

  it('search filters results', async () => {
    const BrowseScreen = require('../../src/screens/BrowseScreen').default;
    const { findByPlaceholderText } = render(<BrowseScreen navigation={mockNavigation} />);
    const searchInput = await findByPlaceholderText(/search/i);
    await act(async () => { fireEvent.changeText(searchInput, 'drill'); });
  });
});
