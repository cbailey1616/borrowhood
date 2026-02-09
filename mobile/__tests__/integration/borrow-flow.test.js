import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

const mockListing = {
  id: 'l-1',
  title: 'Camera',
  description: 'DSLR',
  condition: 'good',
  photos: ['https://test.com/photo.jpg'],
  isFree: true,
  pricePerDay: 0,
  depositAmount: 0,
  minDuration: 1,
  maxDuration: 14,
  visibility: 'close_friends',
  isAvailable: true,
  isOwner: false,
  owner: {
    id: 'user-2',
    firstName: 'Alice',
    lastName: 'Jones',
    profilePhotoUrl: null,
    isVerified: true,
    rating: 4.8,
    ratingCount: 5,
    totalTransactions: 10,
  },
  category: { id: 'cat-1', name: 'Electronics' },
  timesBorrowed: 3,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getListing.mockResolvedValue(mockListing);
  api.createTransaction.mockResolvedValue({ id: 'txn-1' });
  api.checkSubscriptionAccess.mockResolvedValue({ canAccess: true, nextStep: null });
});

describe('Borrow Flow Integration', () => {
  it('listing detail shows borrow button for non-owner', async () => {
    const ListingDetailScreen = require('../../src/screens/ListingDetailScreen').default;
    const route = { params: { id: 'l-1' } };
    const { findByTestId } = render(
      <ListingDetailScreen navigation={mockNavigation} route={route} />
    );
    await findByTestId('ListingDetail.button.borrow');
  });

  it('borrow request screen shows listing info', async () => {
    const BorrowRequestScreen = require('../../src/screens/BorrowRequestScreen').default;
    const route = { params: { listing: mockListing } };
    const { findByText } = render(
      <BorrowRequestScreen navigation={mockNavigation} route={route} />
    );
    await findByText('Camera');
  });

  it('submitting borrow request creates transaction', async () => {
    const BorrowRequestScreen = require('../../src/screens/BorrowRequestScreen').default;
    const route = { params: { listing: mockListing } };
    const { findByPlaceholderText, getByText } = render(
      <BorrowRequestScreen navigation={mockNavigation} route={route} />
    );
    const input = await findByPlaceholderText(/Introduce yourself/);
    fireEvent.changeText(input, 'Need for a trip!');
    await act(async () => {
      fireEvent.press(getByText('Send Request'));
    });
    expect(api.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 'l-1' })
    );
  });

  it('transaction detail shows pending status after request', async () => {
    api.getTransaction.mockResolvedValue({
      id: 'txn-1',
      status: 'pending',
      isBorrower: true,
      isLender: false,
      listing: {
        id: 'l-1',
        title: 'Camera',
        condition: 'good',
        photos: ['https://test.com/photo.jpg'],
      },
      borrower: { id: 'user-1', firstName: 'Test', lastName: 'User', profilePhotoUrl: null },
      lender: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null },
      message: 'Need for a trip!',
      isFree: true,
      totalAmount: 0,
      depositAmount: 0,
      rentalFee: 0,
      dailyRate: 0,
      rentalDays: 7,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    const TransactionDetailScreen = require('../../src/screens/TransactionDetailScreen').default;
    const route = { params: { id: 'txn-1' } };
    const { getByText } = render(
      <TransactionDetailScreen navigation={mockNavigation} route={route} />
    );
    await waitFor(() => {
      expect(getByText(/Pending Approval/i)).toBeTruthy();
    });
  });

  it('subscription access check runs before borrow', async () => {
    const BorrowRequestScreen = require('../../src/screens/BorrowRequestScreen').default;
    const route = { params: { listing: mockListing } };
    render(<BorrowRequestScreen navigation={mockNavigation} route={route} />);
    await waitFor(() => {
      expect(api.checkSubscriptionAccess).toHaveBeenCalled();
    });
  });
});
