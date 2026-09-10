import React from 'react';
import { Modal } from 'react-native';
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

  it('confirms the return only after the owner explicitly confirms in the sheet', async () => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, status: 'picked_up', isLender: true, isBorrower: false });
    api.confirmRentalReturn.mockResolvedValue({});
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByTestId('Transaction.button.confirmReturn'));
    expect(api.confirmRentalReturn).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText('Close confirmation')).toHaveLength(1);
    expect(screen.queryByText('Cancel')).toBeNull();
    fireEvent.press(screen.getByTestId('Transaction.confirmReturn'));
    await waitFor(() => expect(api.confirmRentalReturn).toHaveBeenCalledTimes(1));
    expect(api.confirmRentalReturn).toHaveBeenCalledWith('txn-1', 'good');
  });

  it('lets the owner message about a return without completing the exchange', async () => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, status: 'return_pending', isLender: true, isBorrower: false,
      borrower: { id: 'user-3', firstName: 'Bob', lastName: 'S' } });
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByTestId('Transaction.button.confirmReturn'));
    fireEvent.press(screen.getByTestId('Transaction.messageAboutReturn'));
    await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ recipientId: 'user-3', listingId: 'l-1' })));
    expect(api.confirmRentalReturn).not.toHaveBeenCalled();
    expect(screen.queryByText('Everything back?')).toBeNull();
  });

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

  it('displays status via RentalProgress steps', async () => {
    const TransactionDetailScreen = require('../../src/screens/TransactionDetailScreen').default;
    const { findByText } = render(<TransactionDetailScreen navigation={mockNavigation} route={route} />);
    await findByText('Requested');
    await findByText('Approved');
    await findByText('Picked up');
    await findByText('Returned');
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
    const { findAllByText } = render(<TransactionDetailScreen navigation={mockNavigation} route={route} />);
    // "Alice" appears in both the counterparty card and the activity copy.
    const matches = await findAllByText(/Alice/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('keeps the item context when messaging from the neighbor card', async () => {
    api.getConversations.mockResolvedValueOnce([{ id: 'chat-1', otherUser: { id: 'user-2' } }]);
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('Message Alice privately'));
    await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ conversationId: 'chat-1', listingId: 'l-1', threadContext: { id: 'l-1', title: 'Camera', type: 'listing' } })));
  });

  it.each([['approved', true], ['paid', true], ['approved', false], ['paid', false]])('lets the %s participant (owner=%s) cancel only after confirmation', async (status, isLender) => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, status, isLender, isBorrower: !isLender });
    api.cancelRental.mockResolvedValue({ success: true });
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('Exchange details'));
    fireEvent.press(screen.getByTestId('Transaction.button.cancel'));
    expect(api.cancelRental).not.toHaveBeenCalled();
    expect(screen.getByText('Cancel this borrow?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('Transaction.confirmCancel'));
    await waitFor(() => expect(api.cancelRental).toHaveBeenCalledTimes(1));
    expect(api.cancelRental).toHaveBeenCalledWith('txn-1');
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalledTimes(1));
  });

  it('keeps the borrow when the confirmation is dismissed', async () => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, status: 'approved', isLender: true, isBorrower: false });
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('Exchange details'));
    fireEvent.press(screen.getByTestId('Transaction.button.cancel'));
    fireEvent.press(screen.getByText('Keep borrow'));
    expect(api.cancelRental).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it.each(['picked_up', 'return_pending', 'returned', 'completed', 'cancelled'])('does not offer cancellation for %s', async status => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, status, isLender: true, isBorrower: false });
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('Camera');
    fireEvent.press(screen.getByLabelText('Exchange details'));
    expect(screen.queryByTestId('Transaction.button.cancel')).toBeNull();
  });
});


it.each([[true, 'Waiting for Alice to confirm'], [false, 'Your turn: confirm the return']])('makes the next actor clear for a reported return (borrower=%s)', async (isBorrower, title) => {
  api.getTransaction.mockResolvedValue({ ...mockTransaction, status: 'return_pending', isBorrower, isLender: !isBorrower });
  const Screen = require('../../src/screens/TransactionDetailScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'txn-1' } }} />);
  await screen.findByText(title);
  expect(!!screen.queryByTestId('Transaction.button.confirmReturn')).toBe(!isBorrower);
});
it('keeps details and cancellation secondary while waiting for approval', async () => {
  api.getTransaction.mockResolvedValue({ ...mockTransaction, borrowerMessage: 'Private pickup notes' });
  const Screen = require('../../src/screens/TransactionDetailScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'txn-1' } }} />);
  await screen.findByText('Waiting for Alice');
  expect(screen.queryByText('Private pickup notes')).toBeNull();
  expect(screen.queryByTestId('Transaction.button.cancel')).toBeNull();
  fireEvent.press(screen.getByLabelText('Exchange details'));
  expect(screen.getByText('Private pickup notes')).toBeTruthy();
  expect(screen.getByTestId('Transaction.button.cancel')).toBeTruthy();
});
it('shows completion without an invented confirmation step for a fee-free return', async () => {
  api.getTransaction.mockResolvedValue({ ...mockTransaction, status: 'completed', paymentStatus: 'none' });
  const Screen = require('../../src/screens/TransactionDetailScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'txn-1' } }} />);
  await screen.findByText('Exchange complete');
  expect(screen.queryByTestId('Transaction.button.confirmReturn')).toBeNull();
});
