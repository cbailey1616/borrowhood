import { renderHook, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import api from '../../../src/services/api';

jest.unmock('../../../src/hooks/usePushNotifications');
const usePushNotifications = jest.requireActual('../../../src/hooks/usePushNotifications').default;
const foregroundHandler = Notifications.setNotificationHandler.mock.calls.at(-1)[0];
const { setNavigationRef, flushPendingNotification } = jest.requireActual('../../../src/hooks/usePushNotifications');

describe('usePushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test]' });
    Notifications.getLastNotificationResponseAsync.mockResolvedValue(null);
    api.updatePushToken.mockResolvedValue({});
    api.markNotificationRead.mockResolvedValue({});
    api.getBadgeCount.mockResolvedValue({ messages: 0, notifications: 0 });
  });

  it('registers for notifications when authenticated', async () => {
    const { result } = renderHook(() => usePushNotifications(true));
    await act(async () => {});
    expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
  });

  it('calls api.updatePushToken', async () => {
    const { result } = renderHook(() => usePushNotifications(true));
    await act(async () => {
      // Allow async registration to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    expect(api.updatePushToken).toHaveBeenCalledWith('ExponentPushToken[test]');
  });

  it('sets up notification listeners', () => {
    renderHook(() => usePushNotifications(true));
    expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
    expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
  });

  it('does not register when not authenticated', () => {
    renderHook(() => usePushNotifications(false));
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });
  it('opens incoming item requests in the queue and accepted requests in the tracker', async () => {
    const navigation = { navigate: jest.fn() };
    setNavigationRef(navigation);
    renderHook(() => usePushNotifications(true, { onboardingCompleted: true }));
    await act(async () => {});
    const respond = Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1)[0];
    for (const type of ['borrow_request', 'giveaway_claim']) {
      respond({ notification: { request: { content: { data: { type, listingId: 'tea', transactionId: 'request-1' } } } } });
      expect(navigation.navigate).toHaveBeenLastCalledWith('RequestQueue', { listingId: 'tea' });
    }
    respond({ notification: { request: { content: { data: { type: 'request_approved', listingId: 'tea', transactionId: 'request-1' } } } } });
    expect(navigation.navigate).toHaveBeenLastCalledWith('TransactionDetail', { id: 'request-1' });
  });
  it('ignores retired match pushes and opens explicit offers in the request', async () => {
    const navigation = { navigate: jest.fn() };
    setNavigationRef(navigation);
    renderHook(() => usePushNotifications(true, { onboardingCompleted: true }));
    await act(async () => {});
    const respond = Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1)[0];
    respond({ notification: { request: { content: { data: { type: 'item_match', listingId: 'item-1' } } } } });
    expect(navigation.navigate).not.toHaveBeenCalled();
    respond({ notification: { request: { content: { data: { type: 'request_offer', listingId: 'item-1', requestId: 'request-1' } } } } });
    expect(navigation.navigate).toHaveBeenCalledWith('RequestDetail', { id: 'request-1' });
    expect(await foregroundHandler.handleNotification({ request: { content: { sound: 'default', data: { type: 'item_match' } } } })).toEqual({ shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false });
  });
  it('opens the personal rating explanation from a tier notification', async () => {
    const navigation = { navigate: jest.fn() };
    setNavigationRef(navigation);
    renderHook(() => usePushNotifications(true, { onboardingCompleted: true }));
    await act(async () => {});
    const respond = Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1)[0];
    respond({ notification: { request: { content: { data: { type: 'rank_up' } } } } });
    expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Profile', params: { openRating: true } });
  });

  it('acknowledges only the tapped cancellation and preserves other unread badges', async () => {
    const navigation = { navigate: jest.fn() };
    setNavigationRef(navigation);
    renderHook(() => usePushNotifications(true, { id: 'neighbor', onboardingCompleted: true }));
    await act(async () => {});
    api.getBadgeCount.mockResolvedValue({ messages: 2, notifications: 1, actions: 5 });
    const respond = Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1)[0];
    await act(async () => respond({ notification: { request: { content: { data: {
      type: 'borrow_cancelled', notificationId: 'notice-1', transactionId: 'exchange-1',
    } } } } }));
    expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'exchange-1' });
    expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
    expect(api.markNotificationRead).toHaveBeenCalledWith('notice-1');
    expect(api.markAllNotificationsRead).not.toHaveBeenCalled();
    expect(api.markConversationRead).not.toHaveBeenCalled();
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(3);
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });

  it('still opens the exchange when acknowledging a push fails', async () => {
    const navigation = { navigate: jest.fn() };
    setNavigationRef(navigation);
    renderHook(() => usePushNotifications(true, { id: 'neighbor', onboardingCompleted: true }));
    await act(async () => {});
    api.markNotificationRead.mockRejectedValueOnce(new Error('Offline'));
    const respond = Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1)[0];
    await act(async () => respond({ notification: { request: { content: { data: {
      type: 'return_confirmed', notificationId: 'notice-1', transactionId: 'exchange-1',
    } } } } }));
    expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'exchange-1' });
    expect(Notifications.setBadgeCountAsync).not.toHaveBeenCalled();
  });

  it('keeps a startup tap through sign-in and onboarding, then opens it once', async () => {
    const notification = { notification: { request: { content: { data: {
      type: 'request_approved', notificationId: 'notice-1', transactionId: 'exchange-1',
    } } } } };
    const navigation = { navigate: jest.fn(), isReady: () => true };
    const hook = renderHook(({ authenticated, user }) => usePushNotifications(authenticated, user), {
      initialProps: { authenticated: false, user: null },
    });
    Notifications.getLastNotificationResponseAsync.mockResolvedValueOnce(notification);
    await act(async () => setNavigationRef(navigation));
    expect(navigation.navigate).not.toHaveBeenCalled();
    hook.rerender({ authenticated: true, user: { id: 'neighbor', onboardingCompleted: false } });
    await act(async () => { flushPendingNotification(); flushPendingNotification(); });
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(api.markNotificationRead).not.toHaveBeenCalled();
    hook.rerender({ authenticated: true, user: { id: 'neighbor', onboardingCompleted: true } });
    await act(async () => flushPendingNotification());
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'exchange-1' });
    expect(api.markNotificationRead).toHaveBeenCalledWith('notice-1');
  });

  it('waits for the navigation container before opening a deferred tap', async () => {
    const navigation = { navigate: jest.fn(), isReady: jest.fn(() => false) };
    renderHook(() => usePushNotifications(true, { id: 'neighbor', onboardingCompleted: true }));
    await act(async () => {});
    Notifications.getLastNotificationResponseAsync.mockResolvedValueOnce({ notification: { request: { content: { data: {
      type: 'join_approved', notificationId: 'welcome',
    } } } } });
    await act(async () => setNavigationRef(navigation));
    expect(navigation.navigate).not.toHaveBeenCalled();
    navigation.isReady.mockReturnValue(true);
    await act(async () => setNavigationRef(navigation));
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Feed' });
  });
});

it.each([[null, false], ['default', true]])('honors foreground notification sound %s', async (sound, expected) => {
  expect((await foregroundHandler.handleNotification({ request: { content: { sound } } })).shouldPlaySound).toBe(expected);
});
