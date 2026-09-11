import { renderHook, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import api from '../../../src/services/api';

jest.unmock('../../../src/hooks/usePushNotifications');
const usePushNotifications = jest.requireActual('../../../src/hooks/usePushNotifications').default;
const foregroundHandler = Notifications.setNotificationHandler.mock.calls.at(-1)[0];
const { setNavigationRef } = jest.requireActual('../../../src/hooks/usePushNotifications');

describe('usePushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test]' });
    api.updatePushToken.mockResolvedValue({});
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
});

it.each([[null, false], ['default', true]])('honors foreground notification sound %s', async (sound, expected) => {
  expect((await foregroundHandler.handleNotification({ request: { content: { sound } } })).shouldPlaySound).toBe(expected);
});
