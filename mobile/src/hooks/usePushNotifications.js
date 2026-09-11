import { cancelLegacyReturnReminders } from '../utils/returnReminders';
import { notificationDestination } from '../utils/notificationDestination';
import { notifyInboxChanged } from '../utils/inboxUpdates';
import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from '../services/api';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async notification => ({
    shouldShowAlert: notification.request.content.data?.type !== 'item_match',
    shouldPlaySound: notification.request.content.data?.type !== 'item_match' && !!notification.request.content.sound,
    shouldSetBadge: notification.request.content.data?.type !== 'item_match',
  }),
});

// Navigation ref will be set from App.js
let navigationRef = null;
let currentUser = null;
let hasAuthenticatedSession = false;
let pendingNotification = null;

export function setNavigationRef(ref) {
  navigationRef = ref;
  if (pendingNotification) {
    flushPendingNotification();
    return;
  }
  // A cold-start tap may arrive before authentication or onboarding finishes.
  Notifications.getLastNotificationResponseAsync().then(response => {
    if (response) handleNotificationResponse(response.notification.request.content.data);
  }).catch(() => {});
}

const canOpenNotification = () => hasAuthenticatedSession && currentUser?.onboardingCompleted
  && navigationRef && navigationRef.isReady?.() !== false;

export function flushPendingNotification() {
  if (!pendingNotification || !canOpenNotification()) return;
  const data = pendingNotification;
  pendingNotification = null;
  handleNotificationResponse(data);
}

export default function usePushNotifications(isAuthenticated, user) {
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [notification, setNotification] = useState(null);
  const notificationListener = useRef();
  const responseListener = useRef();

  // Track the actual account, not only its onboarding flag.
  useEffect(() => {
    currentUser = user || null;
    hasAuthenticatedSession = isAuthenticated;
    flushPendingNotification();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated) return;
    cancelLegacyReturnReminders();

    // Flush any pending cold-start notification now that auth is ready
    if (pendingNotification && navigationRef) {
      flushPendingNotification();
    }

    // Don't auto-request notification permissions during onboarding —
    // the onboarding flow has a dedicated pre-prompt step
    const skipRequest = user && !user.onboardingCompleted;

    registerForPushNotifications({ skipRequest }).then(token => {
      if (token) {
        setExpoPushToken(token);
        // Send token to backend
        api.updatePushToken(token).catch(console.error);
      }
    });

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // Listen for user interaction with notifications
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      handleNotificationResponse(data);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isAuthenticated, user?.id, user?.onboardingCompleted]);

  return { expoPushToken, notification };
}

async function registerForPushNotifications({ skipRequest = false } = {}) {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
    });
  }

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    // If skipRequest is true (during onboarding), don't show the system prompt yet
    if (skipRequest) return null;
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return token;
}

async function acknowledgeNotification(data) {
  if (!data.notificationId) return;
  const accountId = currentUser?.id;
  try {
    // Only the alert that was tapped was seen. Other messages and requests
    // retain their unread status, including newer alerts in the same queue.
    await api.markNotificationRead(data.notificationId);
    if (!hasAuthenticatedSession || currentUser?.id !== accountId) return;
    if (notifyInboxChanged(accountId)) return;
    // Before the main tabs mount, keep the native icon in sync directly.
    const counts = await api.getBadgeCount();
    if (!hasAuthenticatedSession || currentUser?.id !== accountId) return;
    await Notifications.setBadgeCountAsync((counts.messages || 0) + (counts.notifications || 0));
  } catch {
    // Opening the exchange must still work if acknowledging the alert fails.
  }
}

function handleNotificationResponse(data) {
  if (!data?.type || data.type === 'item_match') return;
  if (!canOpenNotification()) {
    pendingNotification = data;
    return;
  }
  const destination = notificationDestination(data);
  if (!destination) return;
  navigationRef.navigate(destination.name, destination.params);
  acknowledgeNotification(data);
  // A handled notification must not reopen an old exchange next app launch.
  Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
}
