import React from 'react';
import { RefreshControl } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

const mockTransactions = [
  {
    id: 'txn-1', status: 'returned', isBorrower: true,
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
    await findByText('Returned');
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
    await findByText('No history yet');
  });

  it('renders segmented control', async () => {
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('All');
    await findByText('From others');
    await findByText('From you');
  });

  const selectOutcome = async (screen, label) => {
    fireEvent.press(screen.getByRole('button', { name: /^Filter history:/ }));
    fireEvent.press(screen.getByRole('checkbox', { name: label }));
    await waitFor(() => expect(screen.getByRole('button', { name: `Filter history: ${label}` }).props.accessibilityState.expanded).toBe(false));
  };

  it('includes completed transfers and keeps exchanges awaiting pickup or return confirmation out of history', async () => {
    api.getTransactions.mockResolvedValue([
      { ...mockTransactions[0], id: 'waiting-return', paymentStatus: 'authorized' },
      { ...mockTransactions[1], id: 'loan-out', status: 'picked_up' },
      { ...mockTransactions[1], id: 'pending', status: 'pending' },
      { ...mockTransactions[0], id: 'sale', status: 'picked_up', listingType: 'sell', listing: { title: 'Bookshelf' },
        startDate: null, endDate: null, actualPickupAt: '2026-09-16T18:00:00Z' },
      { ...mockTransactions[1], id: 'gift', status: 'picked_up', listingType: 'giveaway', listing: { title: 'Plant' },
        startDate: null, endDate: null },
    ]);
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Bookshelf');
    expect(screen.getByText('Plant')).toBeTruthy();
    expect(screen.getAllByText('Completed')).toHaveLength(2);
    expect(screen.getByText('Bought from Alice Jones')).toBeTruthy();
    expect(screen.getByText('Given to Bob Smith')).toBeTruthy();
    expect(screen.getByText('Picked up Sep 16, 2026')).toBeTruthy();
    expect(screen.queryByText('Camera')).toBeNull();
    expect(screen.queryByText('Drill')).toBeNull();
    expect(screen.queryByText(' – ')).toBeNull();
    fireEvent.press(screen.getByText('Bookshelf'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'sale' });
  });

  it('combines role and outcome filters locally and clears an empty selection', async () => {
    api.getTransactions.mockResolvedValue([...mockTransactions,
      { ...mockTransactions[1], id: 'cancelled', status: 'cancelled', listing: { title: 'Ladder' } },
      { ...mockTransactions[0], id: 'expired', status: 'expired', listing: { title: 'Tent' } },
      { ...mockTransactions[0], id: 'declined', status: 'declined', listing: { title: 'Bike' } },
    ]);
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Camera');
    fireEvent.press(screen.getByRole('tab', { name: 'From you' }));
    expect(screen.queryByText('Camera')).toBeNull();
    expect(screen.getByText('Drill')).toBeTruthy();
    await selectOutcome(screen, 'Cancelled');
    expect(screen.getByText('Ladder')).toBeTruthy();
    expect(screen.getByText('To Bob Smith')).toBeTruthy();
    expect(screen.queryByText('Drill')).toBeNull();
    fireEvent.press(screen.getByRole('tab', { name: 'From others' }));
    expect(screen.getByText('No matching history')).toBeTruthy();
    fireEvent.press(screen.getByText('Clear filters'));
    expect(screen.getByText('Camera')).toBeTruthy();
    expect(screen.getByText('Drill')).toBeTruthy();
    await selectOutcome(screen, 'Completed');
    expect(screen.getByText('Camera')).toBeTruthy();
    expect(screen.getByText('Drill')).toBeTruthy();
    expect(screen.queryByText('Ladder')).toBeNull();
    await selectOutcome(screen, 'Declined');
    expect(screen.getByText('Bike')).toBeTruthy();
    expect(screen.queryByText('Camera')).toBeNull();
    await selectOutcome(screen, 'Expired');
    expect(screen.getByText('Tent')).toBeTruthy();
    expect(screen.queryByText('Bike')).toBeNull();
    expect(api.getTransactions).toHaveBeenCalledTimes(1);
  });

  it('retains results and filters after a failed refresh and supports retry', async () => {
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Camera');
    fireEvent.press(screen.getByRole('tab', { name: 'From others' }));
    await selectOutcome(screen, 'Completed');
    api.getTransactions.mockRejectedValueOnce(new Error('offline'));
    await act(async () => fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'));
    expect(screen.getByText("Couldn't load history. Please try again.")).toBeTruthy();
    expect(screen.getByText('Camera')).toBeTruthy();
    expect(screen.queryByText('Drill')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter history: Completed' })).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText('Retry history')));
    expect(screen.queryByText("Couldn't load history. Please try again.")).toBeNull();
    expect(screen.getByText('Camera')).toBeTruthy();
    expect(screen.queryByText('Drill')).toBeNull();
  });

  it('refreshes on focus and keeps calendar dates in the requested days', async () => {
    const Screen = require('../../src/screens/TransactionHistoryScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Camera');
    expect(screen.getByText('Mar 1, 2026 – Mar 8, 2026')).toBeTruthy();
    api.getTransactions.mockResolvedValue([mockTransactions[1]]);
    const focus = mockNavigation.addListener.mock.calls.find(([event]) => event === 'focus')[1];
    await act(async () => focus());
    expect(screen.queryByText('Camera')).toBeNull();
    expect(screen.getByText('Drill')).toBeTruthy();
  });
});
