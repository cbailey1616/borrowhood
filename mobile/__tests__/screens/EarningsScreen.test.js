import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

const mockEarnings = {
  balance: { available: 5000 },
  stats: { totalEarned: 15000, totalRentals: 5, averagePerRental: 3000, activeRentals: 1 },
  recentTransactions: [
    {
      id: 'txn-1',
      listing: { title: 'Camera', photo: null },
      borrower: { firstName: 'Alice', lastName: 'Jones' },
      lenderPayout: 2500,
      actualReturnAt: '2026-02-15T00:00:00Z',
    },
  ],
  payouts: [
    { id: 'po-1', amount: 5000, status: 'paid', arrivalDate: Math.floor(Date.now() / 1000) },
  ],
  hasConnectAccount: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getEarnings.mockResolvedValue(mockEarnings);
});

describe('EarningsScreen', () => {
  it('fetches earnings on mount', async () => {
    const Screen = require('../../src/screens/EarningsScreen').default;
    render(<Screen navigation={mockNavigation} />);
    await waitFor(() => { expect(api.getEarnings).toHaveBeenCalled(); });
  });

  it('displays total earned', async () => {
    const Screen = require('../../src/screens/EarningsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Total Earned');
  });

  it('displays rental count', async () => {
    const Screen = require('../../src/screens/EarningsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Rentals');
    await findByText('5');
  });

  it('displays recent earnings section', async () => {
    const Screen = require('../../src/screens/EarningsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Recent Earnings');
  });

  it('displays payout history', async () => {
    const Screen = require('../../src/screens/EarningsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Payout History');
  });

  it('shows setup payouts button when no connect account', async () => {
    api.getEarnings.mockResolvedValue({ ...mockEarnings, hasConnectAccount: false });
    const Screen = require('../../src/screens/EarningsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Set Up Payouts');
  });

  it('shows empty state when no transactions', async () => {
    api.getEarnings.mockResolvedValue({ ...mockEarnings, recentTransactions: [], payouts: [] });
    const Screen = require('../../src/screens/EarningsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('No earnings yet');
    await findByText('No payouts yet');
  });
});
