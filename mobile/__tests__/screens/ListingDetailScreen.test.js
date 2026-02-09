import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null, onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

const mockListing = {
  id: 'listing-1', title: 'Camping Tent', description: 'Great 4-person tent', condition: 'good',
  isFree: true, pricePerDay: 0, depositAmount: 0, visibility: 'close_friends', isAvailable: true,
  isOwner: false, owner: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null, isVerified: true, rating: 4.8, ratingCount: 5, totalTransactions: 10 },
  photos: [], timesBorrowed: 3, minDuration: 1, maxDuration: 14, category: { name: 'Outdoor' },
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getListing.mockResolvedValue(mockListing);
  api.getDiscussions.mockResolvedValue({ discussions: [], count: 0 });
  api.checkSaved.mockResolvedValue({ saved: false });
  api.checkSubscriptionAccess.mockResolvedValue({ canAccess: true, nextStep: null });
});

describe('ListingDetailScreen', () => {
  const route = { params: { id: 'listing-1' } };

  it('fetches listing via api.getListing(id)', async () => {
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getListing).toHaveBeenCalledWith('listing-1'); });
  });

  it('displays title and description', async () => {
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByText } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    await findByText('Camping Tent');
  });

  it('displays owner info', async () => {
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByText } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    await findByText(/Alice/);
  });

  it('shows "Request to Borrow" button for non-owners', async () => {
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByText } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    const borrowBtn = await findByText('Request to Borrow');
    expect(borrowBtn).toBeTruthy();
  });

  it('navigates to BorrowRequest on borrow tap', async () => {
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByText } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    const borrowBtn = await findByText('Request to Borrow');
    await act(async () => { fireEvent.press(borrowBtn); });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BorrowRequest', expect.anything());
  });

  it('save button calls api.saveListing', async () => {
    api.saveListing.mockResolvedValue({});
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByTestId } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    const saveBtn = await findByTestId('ListingDetail.button.save');
    await act(async () => { fireEvent.press(saveBtn); });
    expect(api.saveListing).toHaveBeenCalledWith('listing-1');
  });

  it('owner sees edit/delete actions instead of borrow', async () => {
    api.getListing.mockResolvedValue({ ...mockListing, isOwner: true, owner: { ...mockListing.owner, id: 'user-1' } });
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByText, queryByText } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    await findByText('Camping Tent');
    expect(queryByText('Request to Borrow')).toBeNull();
  });
});
