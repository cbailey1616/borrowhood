import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import api from '../../../src/services/api';
import useInboxBadges from '../../../src/hooks/useInboxBadges';
import { notifyInboxChanged } from '../../../src/utils/inboxUpdates';

let mockFocus;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: callback => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

const oldPost = '2026-09-08T12:00:00.000Z';
const newPost = '2026-09-09T12:00:00.000Z';
const counts = messages => ({ messages, notifications: 6, actions: 1, total: messages + 7 });
beforeEach(() => {
  jest.clearAllMocks();
  AppState.addEventListener.mockReturnValue({ remove: jest.fn() });
  SecureStore.getItemAsync.mockResolvedValue(String(Date.parse(oldPost)));
  SecureStore.setItemAsync.mockResolvedValue();
  api.getBadgeCount.mockResolvedValue(counts(2));
  api.getFeed.mockResolvedValue({ latestPostAt: oldPost });
});

it('refreshes on an incoming notification and clears messages after returning from Chat', async () => {
  const { result } = renderHook(() => useInboxBadges('user-a'));
  await waitFor(() => expect(result.current.badgeCounts.messages).toBe(2));
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(8);
  api.getBadgeCount.mockResolvedValue(counts(3));
  await act(async () => Notifications.addNotificationReceivedListener.mock.calls.at(-1)[0]({}));
  expect(result.current.badgeCounts.messages).toBe(3);
  api.getBadgeCount.mockResolvedValue(counts(0));
  await act(async () => mockFocus());
  expect(result.current.badgeCounts.messages).toBe(0);
  expect(result.current.badgeCounts.notifications).toBe(6);
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(6);
  expect(api.markConversationRead).not.toHaveBeenCalled();
});

it('persists feed visits per account and only clears posts up to the loaded feed timestamp', async () => {
  api.getFeed.mockResolvedValue({ latestPostAt: newPost });
  const { result } = renderHook(() => useInboxBadges('user-a'));
  await waitFor(() => expect(result.current.hasNewFeed).toBe(true));
  act(() => result.current.markFeedSeen(oldPost));
  expect(result.current.hasNewFeed).toBe(true);
  await act(async () => result.current.markFeedSeen(newPost));
  expect(result.current.hasNewFeed).toBe(false);
  expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith('bh_feed_seen_user-a', String(Date.parse(newPost)));
});

it('does not restore a stale unread count or clear indicators on a failed refresh', async () => {
  let finishOld;
  api.getBadgeCount.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  api.getFeed.mockResolvedValue({ latestPostAt: newPost });
  const { result } = renderHook(() => useInboxBadges('user-a'));
  await waitFor(() => expect(result.current.hasNewFeed).toBe(true));
  api.getBadgeCount.mockResolvedValue(counts(1));
  await act(async () => result.current.refresh());
  await act(async () => finishOld(counts(7)));
  expect(result.current.badgeCounts.messages).toBe(1);
  api.getBadgeCount.mockRejectedValue(new Error('offline'));
  api.getFeed.mockRejectedValue(new Error('offline'));
  await act(async () => result.current.refresh());
  expect(result.current.badgeCounts.messages).toBe(1);
  expect(result.current.hasNewFeed).toBe(true);
});

it('does not restore a pre-read push badge after a tapped alert is acknowledged', async () => {
  const { result, unmount } = renderHook(() => useInboxBadges('user-a'));
  await waitFor(() => expect(result.current.badgeCounts.messages).toBe(2));
  let finishBeforeRead;
  api.getBadgeCount.mockImplementationOnce(() => new Promise(resolve => { finishBeforeRead = resolve; }));
  // The response listener starts refreshing before the push handler finishes
  // marking the tapped notification read on the server.
  act(() => { Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1)[0]({}); });
  api.getBadgeCount.mockResolvedValue({ messages: 2, notifications: 5, actions: 1, total: 8 });
  await act(async () => expect(notifyInboxChanged('user-a')).toBe(true));
  expect(result.current.badgeCounts.notifications).toBe(5);
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(7);
  await act(async () => finishBeforeRead(counts(2)));
  expect(result.current.badgeCounts.notifications).toBe(5);
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(7);
  expect(notifyInboxChanged('another-user')).toBe(false);
  unmount();
  expect(notifyInboxChanged('user-a')).toBe(false);
});

it('refreshes immediately on resume and removes subscriptions on unmount', async () => {
  const remove = jest.fn();
  AppState.addEventListener.mockReturnValue({ remove });
  const { result, unmount } = renderHook(() => useInboxBadges('user-a'));
  await waitFor(() => expect(result.current.badgeCounts.messages).toBe(2));
  api.getBadgeCount.mockResolvedValue(counts(4));
  await act(async () => AppState.addEventListener.mock.calls.at(-1)[1]('active'));
  expect(result.current.badgeCounts.messages).toBe(4);
  const pushSubscription = Notifications.addNotificationReceivedListener.mock.results.at(-1).value;
  unmount();
  expect(remove).toHaveBeenCalled();
  expect(pushSubscription.remove).toHaveBeenCalled();
});

it('does not carry indicators or late responses into a different account', async () => {
  let finishOld;
  api.getFeed.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  const { result, rerender } = renderHook(({ id }) => useInboxBadges(id), { initialProps: { id: 'user-a' } });
  await waitFor(() => expect(result.current.badgeCounts.messages).toBe(2));
  api.getBadgeCount.mockResolvedValue(counts(0));
  rerender({ id: 'user-b' });
  await act(async () => finishOld({ latestPostAt: newPost }));
  expect(result.current.hasNewFeed).toBe(false);
  expect(result.current.badgeCounts.messages).toBe(0);
  expect(SecureStore.getItemAsync).toHaveBeenLastCalledWith('bh_feed_seen_user-b');
});

it('does not overwrite a newer saved feed visit when storage loads after the feed', async () => {
  let finishLoad;
  SecureStore.getItemAsync.mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve; }));
  const { result } = renderHook(() => useInboxBadges('user-a'));
  await waitFor(() => expect(result.current.badgeCounts.messages).toBe(2));
  act(() => result.current.markFeedSeen(oldPost));
  await act(async () => finishLoad(String(Date.parse(newPost))));
  await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalledWith('bh_feed_seen_user-a', String(Date.parse(newPost))));
  expect(result.current.hasNewFeed).toBe(false);
});
