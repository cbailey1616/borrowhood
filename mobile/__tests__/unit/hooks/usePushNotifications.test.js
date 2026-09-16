import { renderHook, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import api from '../../../src/services/api';
import { AppState } from 'react-native';

jest.unmock('../../../src/hooks/usePushNotifications');
const usePushNotifications = jest.requireActual('../../../src/hooks/usePushNotifications').default;
const foregroundHandler = Notifications.setNotificationHandler.mock.calls.at(-1)[0];
const { setNavigationRef, flushPendingNotification } = jest.requireActual('../../../src/hooks/usePushNotifications');

describe('usePushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test]' });
    Notifications.getLastNotificationResponseAsync.mockResolvedValue(null);
    api.updatePushToken.mockResolvedValue({});
    api.markNotificationRead.mockResolvedValue({});
    api.getBadgeCount.mockResolvedValue({ messages: 0, notifications: 0 });
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

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
    expect(api.updatePushToken).toHaveBeenCalledWith('ExponentPushToken[test]', expect.objectContaining({ installationId: expect.any(String), revocationSecret: expect.any(String) }));
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

  it('registers after permissions are enabled in Settings without asking again', async () => {
    let resume;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => { resume = handler; return { remove: jest.fn() }; });
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const hook = renderHook(() => usePushNotifications(true, { id: 'a', onboardingCompleted: true }));
    await act(async () => {});
    expect(api.updatePushToken).not.toHaveBeenCalled();
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    await act(async () => resume('active'));
    expect(api.updatePushToken).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    hook.unmount(); spy.mockRestore();
  });

  it('retries failed token registration and cancels retries on unmount', async () => {
    jest.useFakeTimers();
    api.updatePushToken.mockRejectedValueOnce(new Error('Offline'));
    const hook = renderHook(() => usePushNotifications(true, { id: 'a', onboardingCompleted: true }));
    await act(async () => {});
    expect(api.updatePushToken).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(5000));
    expect(api.updatePushToken).toHaveBeenCalledTimes(2);
    hook.unmount(); jest.useRealTimers();
  });

  it('drops a late token resolution after switching accounts', async () => {
    let finish;
    Notifications.getExpoPushTokenAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const hook = renderHook(({ user }) => usePushNotifications(true, user), {
      initialProps: { user: { id: 'a', onboardingCompleted: true } },
    });
    await act(async () => {});
    hook.rerender({ user: { id: 'b', onboardingCompleted: true } });
    await act(async () => {});
    await act(async () => finish({ data: 'ExponentPushToken[stale]' }));
    expect(api.updatePushToken).toHaveBeenCalledTimes(1);
    expect(api.updatePushToken.mock.calls[0][0]).toBe('ExponentPushToken[test]');
  });

  it('ignores notification taps and foreground banners belonging to another account', async () => {
    const navigation = { navigate: jest.fn() };
    setNavigationRef(navigation);
    renderHook(() => usePushNotifications(true, { id: 'b', onboardingCompleted: true }));
    await act(async () => {});
    const content = { sound:'default', data:{ recipientUserId:'a', type:'new_message', conversationId:'private' } };
    const respond = Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1)[0];
    await act(async () => respond({ notification: { request: { content } } }));
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(await foregroundHandler.handleNotification({request:{content}})).toEqual({shouldShowAlert:false,shouldPlaySound:false,shouldSetBadge:false});
    expect(api.markNotificationRead).not.toHaveBeenCalled();
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
