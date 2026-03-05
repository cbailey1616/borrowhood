import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

const mockTransactions = [
  {
    id: 'txn-1', status: 'active', isBorrower: true,
    listing: { title: 'Camera', photoUrl: 'https://test.com/photo.jpg' },
    borrower: { id: 'user-1', firstName: 'Test', lastName: 'User' },
    lender: { id: 'user-2', firstName: 'Alice', lastName: 'Jones' },
    rentalFee: 25.00,
    startDate: '2026-03-01T00:00:00Z', endDate: '2026-03-08T00:00:00Z',
  },
  {
    id: 'txn-2', status: 'completed', isBorrower: false,
    listing: { title: 'Drill', photoUrl: null },
    borrower: { id: 'user-3', firstName: 'Bob', lastName: 'Smith' },
    lender: { id: 'user-1', firstName: 'Test', lastName: 'User' },
    rentalFee: 10.00,
    startDate: '2026-02-01T00:00:00Z', endDate: '2026-02-05T00:00:00Z',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.getTransactions.mockResolvedValue(mockTransactions);
});

describe('TransactionHistoryScreen', () => {
  it('fetches transactions on mount', async () => {
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    render(<Screen navigation={mockNavigation} />);
    await waitFor(() => { expect(api.getTransactions).toHaveBeenCalledWith({}); });
  });

  it('displays transaction listing titles', async () => {
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Camera');
    await findByText('Drill');
  });

  it('displays role labels correctly', async () => {
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText(/Borrowed from Alice Jones/);
    await findByText(/Lent to Bob Smith/);
  });

  it('displays status badges', async () => {
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Active');
    await findByText('Completed');
  });

  it('navigates to TransactionDetail on press', async () => {
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    const camera = await findByText('Camera');
    fireEvent.press(camera);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'txn-1' });
  });

  it('shows empty state when no transactions', async () => {
    api.getTransactions.mockResolvedValue([]);
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('No transactions yet');
  });

  it('renders segmented control', async () => {
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('All');
    await findByText('Borrowing');
    await findByText('Lending');
  });
});
