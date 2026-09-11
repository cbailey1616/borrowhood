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

  it('shows free borrowing without a rental-fee or pricing card', async () => {
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByLabelText, queryByText, queryByTestId } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    await findByLabelText('Free to borrow');
    expect(queryByText('Rental fee')).toBeNull();
    expect(queryByTestId('ListingDetail.price')).toBeNull();
  });

  it('displays owner info', async () => {
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByText } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    await findByText(/Alice/);
  });

  it('labels a sale price separately from daily borrowing', async () => {
    api.getListing.mockResolvedValue({ ...mockListing, listingType: 'sell', directFee: { amount: 60, unit: 'flat' } });
    const Screen = require('../../src/screens/ListingDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByLabelText('$60.00 one-time price');
    expect(screen.getByText('Sale price')).toBeTruthy();
    expect(screen.queryByText('Borrowing price')).toBeNull();
  });

  it('keeps giveaways free even if an old fee is still present', async () => {
    api.getListing.mockResolvedValue({ ...mockListing, listingType: 'giveaway', directFee: { amount: 60, unit: 'flat' } });
    const Screen = require('../../src/screens/ListingDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByLabelText('Free to keep');
    expect(screen.queryByText('$60.00')).toBeNull();
    expect(screen.queryByText('Arrange payment directly with your neighbor.')).toBeNull();
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

  it('keeps the owner’s active exchange in the footer even when more requests are waiting', async () => {
    api.getListing.mockResolvedValue({ ...mockListing, isOwner: true, pendingRequests: 2,
      activeTransaction: { id: 'active-1', status: 'picked_up', isBorrower: false } });
    const Screen = require('../../src/screens/ListingDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByTestId('ListingDetail.button.exchange'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'active-1' });
    expect(screen.getByLabelText('View request queue')).toBeTruthy();
    expect(screen.getByLabelText('Edit item')).toBeTruthy();
  });

  it('explains unavailable items and keeps a labeled message action', async () => {
    api.getListing.mockResolvedValue({ ...mockListing, isAvailable: false });
    api.getConversations.mockResolvedValue([]);
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByText, getByLabelText, queryByText } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    await findByText('Not available right now');
    expect(queryByText('Request to Borrow')).toBeNull();
    expect(queryByText('Message owner')).toBeTruthy();
    await act(async () => { fireEvent.press(getByLabelText('Message owner')); });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({
      recipientId: 'user-2', listingId: 'listing-1',
    }));
  });

  it('keeps active requests actionable even when an item is unavailable', async () => {
    api.getListing.mockResolvedValue({ ...mockListing, isAvailable: false, activeTransaction: { id: 'request-1' } });
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByText, queryByText } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    const requestButton = await findByText('View Request');
    expect(queryByText('Not available to borrow right now')).toBeNull();
    expect(queryByText('Message')).toBeTruthy();
    await act(async () => { fireEvent.press(requestButton); });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'request-1' });
  });

  it('does not restore the action bar for completed giveaways', async () => {
    api.getListing.mockResolvedValue({ ...mockListing, listingType: 'giveaway', isAvailable: false });
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const { findByText, queryByTestId } = render(<ListingDetailScreen navigation={mockNavigation} route={route} />);
    await findByText('Camping Tent');
    expect(queryByTestId('ListingDetail.button.message')).toBeNull();
    expect(queryByTestId('ListingDetail.button.borrow')).toBeNull();
  });
});

it('lets a Town preview show the item while protecting profile and contact actions', async () => {
  api.getListing.mockResolvedValue({ ...mockListing, ownerMasked: true, previewOnly: true, owner: { id: null, firstName: 'Town', lastName: 'neighbor' } });
  const Screen = require('../../src/screens/ListingDetailScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'listing-1' } }} />);
  await screen.findByText(mockListing.title);
  expect(screen.queryByTestId('ListingDetail.button.save')).toBeNull();
  fireEvent.press(screen.getByLabelText('Identity hidden. Get verified to see who’s sharing'));
  expect(mockNavigation.navigate).toHaveBeenCalledWith('IdentityVerification', { source: 'town_browse' });
  expect(mockNavigation.navigate).not.toHaveBeenCalledWith('UserProfile', expect.anything());
});
