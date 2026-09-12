import React from 'react';
import { Modal } from 'react-native';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { getState: jest.fn(() => ({ routes: [{ name: 'RequestQueue' }, { name: 'TransactionDetail' }] })), replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

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

beforeEach(() => { jest.clearAllMocks(); api.getTransaction.mockResolvedValue(mockTransaction); api.endorseTransaction=jest.fn().mockResolvedValue({success:true}); });

describe('TransactionDetailScreen', () => {
  const route = { params: { id: 'txn-1' } };

  it.each([true, false])('requires a handoff confirmation for pickup (borrower=%s)', async isBorrower => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, status: 'approved', isBorrower, isLender: !isBorrower });
    api.confirmRentalPickup.mockResolvedValue({ success: true });
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByTestId('Transaction.button.confirmPickup'));
    expect(api.confirmRentalPickup).not.toHaveBeenCalled();
    expect(screen.getByText(isBorrower ? 'Confirm only after you have received the item.' : 'Confirm only after you have handed the item to Test.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('Transaction.confirmPickup'));
    await waitFor(() => expect(api.confirmRentalPickup).toHaveBeenCalledWith('txn-1'));
  });

  it('offers a visible retry when exchange loading fails', async () => {
    api.getTransaction.mockRejectedValueOnce(new Error('Offline'));
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByText('Try again'));
    await screen.findByText('Camera');
    expect(api.getTransaction).toHaveBeenCalledTimes(2);
  });

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
    api.getTransaction.mockResolvedValue({ ...mockTransaction, status: 'approved' });
    const TransactionDetailScreen = require('../../src/screens/TransactionDetailScreen').default;
    const { findByText } = render(<TransactionDetailScreen navigation={mockNavigation} route={route} />);
    await findByText('Requested');
    await findByText('Approved');
    await findByText('Picked up');
    await findByText('Returned');
  });

  it.each(['lend', 'giveaway', 'sell'])('routes pending %s owner decisions to the queue', async listingType => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, listingType, isBorrower: false, isLender: true });
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByTestId('Transaction.button.queue'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('RequestQueue', { listingId: 'l-1' });
    expect(screen.queryByTestId('Transaction.button.approve')).toBeNull();
    expect(screen.queryByTestId('Transaction.button.decline')).toBeNull();
    expect(api.approveRental).not.toHaveBeenCalled();
    expect(api.declineRental).not.toHaveBeenCalled();
  });

  it('lets the owner open the queue while another exchange is reserved', async () => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, isBorrower: false, isLender: true, queue: { waiting: true } });
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const queue = await screen.findByLabelText('View queue');
    expect(queue).not.toBeDisabled();
    fireEvent.press(queue);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('RequestQueue', { listingId: 'l-1' });
  });

  it('replaces a pending detail opened from an old notification when no queue is on the stack', async () => {
    mockNavigation.getState.mockReturnValueOnce({ routes: [{ name: 'Main' }, { name: 'TransactionDetail' }] });
    api.getTransaction.mockResolvedValue({ ...mockTransaction, isBorrower: false, isLender: true });
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('View queue'));
    expect(mockNavigation.replace).toHaveBeenCalledWith('RequestQueue', { listingId: 'l-1' });
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
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
    fireEvent.press(await screen.findByLabelText('Message owner'));
    await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ conversationId: 'chat-1', listingId: 'l-1', threadContext: { id: 'l-1', title: 'Camera', type: 'listing' } })));
  });

  it.each([['approved', true], ['paid', true], ['approved', false], ['paid', false]])('lets the %s participant (owner=%s) cancel only after confirmation', async (status, isLender) => {
    api.getTransaction.mockResolvedValue({ ...mockTransaction, status, isLender, isBorrower: !isLender });
    api.cancelRental.mockResolvedValue({ success: true });
    const Screen = require('../../src/screens/TransactionDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByTestId('Transaction.button.cancel'));
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
    fireEvent.press(await screen.findByTestId('Transaction.button.cancel'));
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
it.each(['lend', 'giveaway', 'sell'])('shows one cancel request action above details for a pending %s', async listingType => {
  api.getTransaction.mockResolvedValue({ ...mockTransaction, listingType, borrowerMessage: 'Private pickup notes' });
  api.cancelRental.mockResolvedValue({ success: true });
  const Screen = require('../../src/screens/TransactionDetailScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'txn-1' } }} />);
  await screen.findByText('Request sent');
  const nextActions = screen;
  expect(nextActions.getByLabelText('Cancel request')).toBeTruthy();
  expect(nextActions.getByLabelText('Message owner')).toBeTruthy();
  expect(screen.queryByText('Leave queue')).toBeNull();
  expect(screen.getByText('Private pickup notes')).toBeTruthy();
  expect(screen.getAllByTestId('Transaction.button.cancel')).toHaveLength(1);
  fireEvent.press(nextActions.getByLabelText('Cancel request'));
  expect(screen.getByText('Cancel this request?')).toBeTruthy();
  expect(screen.getByText('Keep request')).toBeTruthy();
  expect(api.cancelRental).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('Transaction.confirmCancel'));
  await waitFor(() => expect(api.cancelRental).toHaveBeenCalledWith('txn-1'));
});
it('shows completion without an invented confirmation step for a fee-free return', async () => {
  api.getTransaction.mockResolvedValue({ ...mockTransaction, status: 'completed', paymentStatus: 'none' });
  const Screen = require('../../src/screens/TransactionDetailScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'txn-1' } }} />);
  await screen.findByText('Exchange complete');
  expect(screen.queryByTestId('Transaction.button.confirmReturn')).toBeNull();
});

it('shows dates, queue and message actions before opening Exchange details', async () => {
  api.getTransaction.mockResolvedValue({ ...mockTransaction, isBorrower: false, isLender: true });
  api.getConversations.mockResolvedValue([]);
  const Screen = require('../../src/screens/TransactionDetailScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'txn-1' } }} />);
  await screen.findByText('Pickup');
  expect(screen.getByText('Return by')).toBeTruthy();
  expect(screen.getByLabelText('Exchange details').props.accessibilityState.expanded).toBe(false);
  fireEvent.press(screen.getByLabelText('Message Test privately'));
  await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ recipientId: 'user-1' })));
  expect(api.declineRental).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('Transaction.button.queue'));
  expect(mockNavigation.navigate).toHaveBeenCalledWith('RequestQueue', { listingId: 'l-1' });
});

it.each(['lend','giveaway','sell'])('makes endorsing the next action for a completed %s and moves messaging lower', async listingType => {
  const transaction={...mockTransaction,listingType,status:'completed',paymentStatus:'none',endorsement:{canRate:true,submitted:false}};
  api.getTransaction.mockResolvedValueOnce(transaction).mockResolvedValue({...transaction,endorsement:{canRate:false,submitted:true,positive:true}});
  api.getConversations.mockResolvedValue([]);
  const Screen=require('../../src/screens/TransactionDetailScreen').default;
  const screen=render(<Screen navigation={mockNavigation} route={{params:{id:'txn-1'}}}/>);
  await screen.findByText('Leave an endorsement');
  const next=within(screen.getByTestId('Transaction.nextStep'));
  expect(next.queryByLabelText('Message Alice privately')).toBeNull();
  expect(screen.getAllByLabelText('Send endorsement')).toHaveLength(1);
  expect(screen.queryByText(/Nothing else to do/)).toBeNull();
  expect(screen.queryByText(/can’t be changed/)).toBeNull();
  fireEvent.press(next.getByLabelText('Thumbs up'));
  fireEvent.press(next.getByLabelText('Send endorsement'));
  await screen.findByText('Endorsement sent');
  expect(api.endorseTransaction).toHaveBeenCalledWith('txn-1',true);
  expect(screen.queryByLabelText('Send endorsement')).toBeNull();
  fireEvent.press(screen.getByLabelText('Message Alice privately'));
  await waitFor(()=>expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat',expect.objectContaining({recipientId:'user-2',listingId:'l-1'})));
});

it('does not prompt for an expired or unavailable endorsement',async()=>{
  api.getTransaction.mockResolvedValue({...mockTransaction,status:'completed',endorsement:{canRate:false,submitted:false}});
  const Screen=require('../../src/screens/TransactionDetailScreen').default;
  const screen=render(<Screen navigation={mockNavigation} route={{params:{id:'txn-1'}}}/>);
  await screen.findByText('Exchange complete');
  expect(screen.queryByText('Leave an endorsement')).toBeNull();
  expect(screen.queryByLabelText('Send endorsement')).toBeNull();
  expect(screen.getByLabelText('Message Alice privately')).toBeTruthy();
});

it('keeps issue guidance visible when an endorsement is also available',async()=>{
  api.getTransaction.mockResolvedValue({...mockTransaction,status:'completed',hasDispute:true,endorsement:{canRate:true}});
  const Screen=require('../../src/screens/TransactionDetailScreen').default;
  const screen=render(<Screen navigation={mockNavigation} route={{params:{id:'txn-1'}}}/>);
  await screen.findByText('An issue is being reviewed');
  expect(screen.getByText('Leave an endorsement')).toBeTruthy();
  expect(screen.getByLabelText('Message Alice privately')).toBeTruthy();
});

it('retains return confirmation ahead of an inconsistent endorsement flag',async()=>{
  api.getTransaction.mockResolvedValue({...mockTransaction,status:'returned',paymentStatus:'authorized',isLender:true,isBorrower:false,endorsement:{canRate:true}});
  const Screen=require('../../src/screens/TransactionDetailScreen').default;
  const screen=render(<Screen navigation={mockNavigation} route={{params:{id:'txn-1'}}}/>);
  await screen.findByTestId('Transaction.button.confirmReturn');
  expect(screen.queryByLabelText('Send endorsement')).toBeNull();
});

it('opens useful giveaway details without notes and closes them again',async()=>{
  api.getTransaction.mockResolvedValue({...mockTransaction,listingType:'giveaway',status:'completed',borrowerMessage:null,createdAt:'2026-09-10T12:00:00Z',actualPickupAt:'2026-09-12T14:30:00Z'});
  const Screen=require('../../src/screens/TransactionDetailScreen').default;
  const screen=render(<Screen navigation={mockNavigation} route={{params:{id:'txn-1'}}}/>);
  const toggle=await screen.findByLabelText('Exchange details');
  expect(screen.queryByTestId('Transaction.detailsBody')).toBeNull();
  fireEvent.press(toggle);
  const details=within(screen.getByTestId('Transaction.detailsBody'));
  expect(details.getByText('Completed')).toBeTruthy();
  expect(details.getByText('Requested')).toBeTruthy();
  expect(details.getByText('Picked up')).toBeTruthy();
  expect(details.getByText('Free to keep')).toBeTruthy();
  expect(details.getAllByText(/2026/)).toHaveLength(2);
  expect(details.queryByText('Return by')).toBeNull();
  expect(toggle.props.accessibilityState.expanded).toBe(true);
  fireEvent.press(toggle);
  expect(screen.queryByTestId('Transaction.detailsBody')).toBeNull();
});

it.each([0, 1, 3])('shows only the requester queue count (%s ahead)', async aheadCount => {
 api.getTransaction.mockResolvedValue({ ...mockTransaction, queue: { aheadCount, waiting: false } });
 const Screen = require('../../src/screens/TransactionDetailScreen').default;
 const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'txn-1' } }} />);
 await screen.findByText(aheadCount === 0 ? 'No one ahead of you' : `${aheadCount} ${aheadCount === 1 ? 'person' : 'people'} ahead of you`);
 expect(screen.queryByTestId('Transaction.button.queue')).toBeNull();
});
it('keeps a reserved request waiting without promising a pickup', async () => {
 api.getTransaction.mockResolvedValue({ ...mockTransaction, queue: { aheadCount: 0, waiting: true } });
 const Screen = require('../../src/screens/TransactionDetailScreen').default;
 const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'txn-1' } }} />);
 await screen.findByText('Reserved for another neighbor');
 expect(screen.queryByTestId('Transaction.button.confirmPickup')).toBeNull();
 expect(screen.getByLabelText('Cancel request')).toBeTruthy();
});
