import { renderHook, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import api from '../../../src/services/api';

jest.unmock('../../../src/hooks/usePushNotifications');
const usePushNotifications = jest.requireActual('../../../src/hooks/usePushNotifications').default;

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
});
