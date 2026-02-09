import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

const mockTransaction = {
  id: 'txn-1', status: 'pending',
  listing: { id: 'l-1', title: 'Camera', condition: 'good', photos: ['https://test.com/photo.jpg'] },
  borrower: { id: 'user-1', firstName: 'Test', lastName: 'User', profilePhotoUrl: null },
  lender: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null },
  isBorrower: true, isLender: false,
  borrowerMessage: 'Need it for a project',
  rentalDays: 7, dailyRate: 0, rentalFee: 0, depositAmount: 0,
  startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
};

beforeEach(() => { jest.clearAllMocks(); api.getTransaction.mockResolvedValue(mockTransaction); });

describe('TransactionDetailScreen', () => {
  const route = { params: { id: 'txn-1' } };

  it('fetches transaction via api.getTransaction(id)', async () => {
    const TransactionDetailScreen = require('../../src/screens/TransactionDetailScreen').default;
    render(<TransactionDetailScreen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getTransaction).toHaveBeenCalledWith('txn-1'); });
  });

  it('displays listing info', async () => {
    const TransactionDetailScreen = require('../../src/screens/TransactionDetailScreen').default;
    const { findByText } = render(<TransactionDetailScreen navigation={mockNavigation} route={route} />);
    await findByText('Camera');
  });

  it('displays status', async () => {
    const TransactionDetailScreen = require('../../src/screens/TransactionDetailScreen').default;
    const { findByText } = render(<TransactionDetailScreen navigation={mockNavigation} route={route} />);
    await findByText('Pending Approval');
  });

  it('lender sees approve/decline buttons for pending requests', async () => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, isBorrower: false, isLender: true, borrower: { id: 'user-3', firstName: 'Bob', lastName: 'S', profilePhotoUrl: null }, lender: { id: 'user-1', firstName: 'Test', lastName: 'User', profilePhotoUrl: null } });
    const TransactionDetailScreen = require('../../src/screens/TransactionDetailScreen').default;
    const { findByTestId } = render(<TransactionDetailScreen navigation={mockNavigation} route={route} />);
    const approveBtn = await findByTestId('Transaction.button.approve');
    expect(approveBtn).toBeTruthy();
  });

  it('approve button calls api.approveRental', async () => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, isBorrower: false, isLender: true, borrower: { id: 'user-3', firstName: 'Bob', lastName: 'S', profilePhotoUrl: null }, lender: { id: 'user-1', firstName: 'Test', lastName: 'User', profilePhotoUrl: null } });
    api.approveRental.mockResolvedValue({});
    const TransactionDetailScreen = require('../../src/screens/TransactionDetailScreen').default;
    const { findByTestId } = render(<TransactionDetailScreen navigation={mockNavigation} route={route} />);
    const approveBtn = await findByTestId('Transaction.button.approve');
    await act(async () => { fireEvent.press(approveBtn); });
    expect(api.approveRental).toHaveBeenCalledWith('txn-1');
  });

  it('displays other party info', async () => {
    const TransactionDetailScreen = require('../../src/screens/TransactionDetailScreen').default;
    const { findByText } = render(<TransactionDetailScreen navigation={mockNavigation} route={route} />);
    await findByText(/Alice/);
  });
});
