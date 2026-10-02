import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../src/services/api';
import Screen from '../../src/screens/AdminReportsScreen';

const mockUser = { id: 'staff', isAdmin: true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
const navigation = { navigate: jest.fn() };
const counts = { total: 31, ready: 20, waiting: 8, appeals: 2, reviewed: 1 };
const missing = { id: 'return-1', source: 'return', issue: 'non_return', title: 'Ladder', reporterName: 'Sam', reportedName: 'Alex',
  status: 'open', queueStatus: 'waiting', photoCount: 2, responseDueAt: '2026-10-04T12:00:00Z', createdAt: '2026-10-02T12:00:00Z' };
const damage = { ...missing, id: 'damage-1', source: 'safety', issue: 'damage', title: 'Pressure washer',
  queueStatus: 'ready', reporterRole: 'borrower', photoCount: 1 };
const result = (reports = [missing, damage], extra = {}) => ({ reports, counts, page: 1, hasMore: false, ...extra });
let onFocus;
beforeEach(() => {
  jest.clearAllMocks(); mockUser.isAdmin = true;
  useFocusEffect.mockImplementation(callback => React.useEffect(() => {
    let cleanup;
    onFocus = () => { cleanup?.(); cleanup = callback(); };
    onFocus(); return () => cleanup?.();
  }, [callback]));
  api.getAdminReports.mockResolvedValue(result());
});
const open = async () => {
  const screen = render(<Screen navigation={navigation} />);
  await screen.findByText('Ladder', {}, { timeout: 10000 });
  return screen;
};
it('denies nonadmins without fetching private reports', () => {
  mockUser.isAdmin = false;
  const screen = render(<Screen navigation={navigation} />);
  expect(screen.getByText('Administrator access is required.')).toBeTruthy();
  expect(api.getAdminReports).not.toHaveBeenCalled();
});
it('shows both issue types, full queue totals and account moderation wording', async () => {
  const screen = await open();
  expect(screen.getByLabelText('Ready to review: 20')).toBeTruthy();
  expect(screen.getByLabelText('Waiting for response: 8')).toBeTruthy();
  expect(screen.getByLabelText('Appeals: 2')).toBeTruthy();
  expect(screen.getByText('30 reports')).toBeTruthy();
  expect(screen.getByText('Pressure washer')).toBeTruthy();
  expect(screen.getByText('Borrower disclosure')).toBeTruthy();
  expect(screen.getByText('Account moderation only. Borrowhood does not recover items, cover loss or damage, or resolve disputes.')).toBeTruthy();
});
it('opens the exact report in its existing review screen without making a decision', async () => {
  const screen = await open();
  fireEvent.press(screen.getByRole('button', { name: 'Review not returned report for Ladder by Sam' }));
  expect(navigation.navigate).toHaveBeenCalledWith('ReturnHelp', { admin: true, reportId: 'return-1' });
  fireEvent.press(screen.getByRole('button', { name: 'Review damaged report for Pressure washer by Sam' }));
  expect(navigation.navigate).toHaveBeenCalledWith('SafetyReports', { reportId: 'damage-1' });
  expect(api.reviewReturnReport).not.toHaveBeenCalled();
});
it('requests issue and state filters from the server, including reviewed history', async () => {
  const screen = await open();
  fireEvent.press(screen.getByRole('tab', { name: 'Damaged' }));
  await waitFor(() => expect(api.getAdminReports).toHaveBeenLastCalledWith('damage', 'pending', 1));
  fireEvent.press(screen.getByRole('tab', { name: 'Reviewed' }));
  await waitFor(() => expect(api.getAdminReports).toHaveBeenLastCalledWith('damage', 'reviewed', 1));
  expect(await screen.findByText('1 report')).toBeTruthy();
});
it('ignores an old response after changing the issue filter', async () => {
  let finish;
  api.getAdminReports.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const screen = render(<Screen navigation={navigation} />);
  await waitFor(() => expect(api.getAdminReports).toHaveBeenCalledTimes(1));
  api.getAdminReports.mockResolvedValue(result([damage]));
  fireEvent.press(screen.getByRole('tab', { name: 'Damaged' }));
  await screen.findByText('Pressure washer');
  await act(async () => { finish(result([missing])); });
  expect(screen.queryByText('Ladder')).toBeNull();
});
it('loads further pages while preserving totals and deduplicating shifted rows', async () => {
  api.getAdminReports.mockResolvedValueOnce(result([missing], { hasMore: true }));
  const screen = await open();
  api.getAdminReports.mockResolvedValueOnce(result([missing, damage], { page: 2 }));
  fireEvent.press(screen.getByRole('button', { name: 'Load more reports' }));
  await screen.findByText('Pressure washer');
  expect(api.getAdminReports).toHaveBeenLastCalledWith('all', 'pending', 2);
  expect(screen.getAllByText('Ladder')).toHaveLength(1);
  expect(screen.getByLabelText('Ready to review: 20')).toBeTruthy();
});
it('refreshes the queue when returning from a report decision', async () => {
  const screen = await open();
  api.getAdminReports.mockResolvedValue(result([damage], { counts: { ...counts, ready: 19, reviewed: 2 } }));
  await act(async () => { onFocus(); });
  expect(await screen.findByLabelText('Ready to review: 19')).toBeTruthy();
  expect(screen.queryByText('Ladder')).toBeNull();
});
it('offers retry after a failure without showing a false empty queue', async () => {
  api.getAdminReports.mockRejectedValueOnce(new Error('Could not load reports.'));
  const screen = render(<Screen navigation={navigation} />);
  await screen.findByText('Could not load reports.');
  expect(screen.queryByText('No pending reports')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Ladder')).toBeTruthy();
});
