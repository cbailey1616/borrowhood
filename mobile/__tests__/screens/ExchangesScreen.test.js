import React from 'react';
import { AppState, RefreshControl } from 'react-native';
import * as Notifications from 'expo-notifications';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
import ExchangesScreen from '../../src/screens/ExchangesScreen';

let mockUser = { id: 'me' };
const navigation = { navigate: jest.fn(), addListener: jest.fn(() => jest.fn()), isFocused: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
const loan = { id: 'loan', listing: { id: 'item', title: 'Ladder' }, status: 'picked_up', isBorrower: true,
  borrower: { id: 'me' }, lender: { id: 'sam', firstName: 'Sam' }, endDate: '2099-10-04' };
const deferred = () => { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'me' };
  api.getTransactions.mockResolvedValue([loan]);
  api.getDisputes.mockResolvedValue([]);
  AppState.addEventListener.mockReturnValue({ remove: jest.fn() });
});

it('shows every active exchange and links to its next step and history', async () => {
  api.getTransactions.mockResolvedValue([loan,
    { ...loan, id: 'pickup', status: 'approved', listing: { title: 'Camera' } },
    { ...loan, id: 'done', status: 'completed', listing: { title: 'Finished item' } },
  ]);
  const screen = render(<ExchangesScreen navigation={navigation} />);
  await screen.findByText('Ladder');
  expect(screen.getByText('2 active')).toBeTruthy();
  expect(screen.getByText('Borrowing & lending')).toBeTruthy();
  expect(screen.getAllByText('Ready for pickup')).toHaveLength(2);
  expect(screen.getAllByText('From Sam')).toHaveLength(2);
  expect(screen.queryByText('Finished item')).toBeNull();
  fireEvent.press(screen.getByTestId('Exchanges.loan'));
  expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'loan' });
  fireEvent.press(screen.getByLabelText('Exchange history'));
  expect(navigation.navigate).toHaveBeenCalledWith('TransactionHistory');
});

it('opens grouped request queues and return confirmation without mutating an exchange', async () => {
  api.getTransactions.mockResolvedValue(['a', 'b'].map(id => ({ ...loan, id, status: 'pending', isBorrower: false,
    lender: { id: 'me' }, borrower: { id } })));
  const screen = render(<ExchangesScreen navigation={navigation} />);
  await screen.findByText('2 neighbors requested this');
  expect(screen.getByText('1 active')).toBeTruthy();
  fireEvent.press(screen.getByText('Review requests'));
  expect(navigation.navigate).toHaveBeenCalledWith('RequestQueue', { listingId: 'item' });
  api.getTransactions.mockResolvedValue([{ ...loan, isBorrower: false, status: 'return_pending' }]);
  await act(async () => fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'));
  fireEvent.press(screen.getByText('Confirm return'));
  expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'loan' });
});

it('puts an issue needing a response in Needs you', async () => {
  api.getTransactions.mockResolvedValue([{ ...loan, status: 'disputed', disputeId: 'issue' }]);
  api.getDisputes.mockResolvedValue([{ id: 'issue', transactionId: 'loan', status: 'awaitingResponse', respondent: { id: 'me' } }]);
  const screen = render(<ExchangesScreen navigation={navigation} />);
  await screen.findByText('Your turn: review issue');
  expect(screen.getByText('Needs you')).toBeTruthy();
  fireEvent.press(screen.getByText('Review issue'));
  expect(navigation.navigate).toHaveBeenCalledWith('DisputeDetail', { id: 'issue' });
});

it('keeps confirmed results after a failed refresh and recovers on retry', async () => {
  const screen = render(<ExchangesScreen navigation={navigation} />);
  await screen.findByText('Ladder');
  api.getTransactions.mockRejectedValueOnce(new Error('offline'));
  await act(async () => fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'));
  expect(screen.getByText('Ladder')).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByLabelText('Retry exchanges')));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows a retry instead of an empty-state claim when the initial load fails', async () => {
  api.getTransactions.mockRejectedValue(new Error('offline'));
  const screen = render(<ExchangesScreen navigation={navigation} />);
  await screen.findByRole('alert');
  expect(screen.queryByText('No active exchanges')).toBeNull();
  expect(screen.queryByText('0 active')).toBeNull();
});

it('keeps the refresh animation busy until both status requests settle', async () => {
  const screen = render(<ExchangesScreen navigation={navigation} />);
  await screen.findByText('Ladder');
  const response = deferred();
  api.getDisputes.mockReturnValueOnce(response.promise);
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  expect(screen.getByLabelText('Refreshing')).toBeTruthy();
  await act(async () => response.resolve([]));
  expect(screen.queryByLabelText('Refreshing')).toBeNull();
});

it('ignores an older refresh that finishes after a newer focus load', async () => {
  const screen = render(<ExchangesScreen navigation={navigation} />);
  await screen.findByText('Ladder');
  const old = deferred();
  api.getTransactions.mockReturnValueOnce(old.promise);
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  api.getTransactions.mockResolvedValue([]);
  const focus = navigation.addListener.mock.calls.find(([event]) => event === 'focus')[1];
  await act(async () => focus());
  expect(screen.getByText('No active exchanges')).toBeTruthy();
  await act(async () => old.resolve([loan]));
  expect(screen.queryByText('Ladder')).toBeNull();
  fireEvent.press(screen.getByText('Browse items'));
  expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Feed' });
});

it('clears the previous account and ignores its in-flight response', async () => {
  const old = deferred();
  api.getTransactions.mockReturnValueOnce(old.promise);
  const screen = render(<ExchangesScreen navigation={navigation} />);
  mockUser = { id: 'different' };
  api.getTransactions.mockResolvedValue([]);
  screen.rerender(<ExchangesScreen navigation={navigation} />);
  await screen.findByText('No active exchanges');
  await act(async () => old.resolve([loan]));
  expect(screen.queryByText('Ladder')).toBeNull();
});

it('refreshes current statuses after a notification and cleans up subscriptions', async () => {
  const screen = render(<ExchangesScreen navigation={navigation} />);
  await screen.findByText('Ladder');
  api.getTransactions.mockResolvedValue([]);
  const received = Notifications.addNotificationReceivedListener.mock.calls.at(-1)[0];
  await act(async () => received());
  expect(screen.getByText('No active exchanges')).toBeTruthy();
  const remove = Notifications.addNotificationReceivedListener.mock.results.at(-1).value.remove;
  screen.unmount();
  expect(remove).toHaveBeenCalled();
});

it('refreshes after returning to the app without reloading for duplicate active events', async () => {
  const screen = render(<ExchangesScreen navigation={navigation} />);
  await screen.findByText('Ladder');
  const resume = AppState.addEventListener.mock.calls.at(-1)[1];
  api.getTransactions.mockResolvedValue([{ ...loan, status: 'return_pending' }]);
  await act(async () => { resume('background'); resume('active'); });
  expect(screen.getByText('Waiting for Sam to confirm the return')).toBeTruthy();
  const calls = api.getTransactions.mock.calls.length;
  await act(async () => resume('active'));
  expect(api.getTransactions).toHaveBeenCalledTimes(calls);
  const remove = AppState.addEventListener.mock.results.at(-1).value.remove;
  screen.unmount();
  expect(remove).toHaveBeenCalled();
});

it('does not reload a hidden tracker when a notification arrives', async () => {
  const hiddenNavigation = { ...navigation, isFocused: () => false };
  const screen = render(<ExchangesScreen navigation={hiddenNavigation} />);
  await screen.findByText('Ladder');
  const calls = api.getTransactions.mock.calls.length;
  const received = Notifications.addNotificationReceivedListener.mock.calls.at(-1)[0];
  await act(async () => received());
  expect(api.getTransactions).toHaveBeenCalledTimes(calls);
});
