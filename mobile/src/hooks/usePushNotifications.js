import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api from '../services/api';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Navigation ref will be set from App.js
let navigationRef = null;

export function setNavigationRef(ref) {
  navigationRef = ref;
}

export default function usePushNotifications(isAuthenticated) {
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [notification, setNotification] = useState(null);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotifications().then(token => {
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
  }, [isAuthenticated]);

  return { expoPushToken, notification };
}

async function registerForPushNotifications() {
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
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

function handleNotificationResponse(data) {
  if (!navigationRef || !data?.type) {
    console.log('Notification tapped (no navigation):', data);
    return;
  }

  switch (data.type) {
    case 'borrow_request':
    case 'request_approved':
    case 'request_declined':
    case 'pickup_confirmed':
    case 'return_confirmed':
    case 'payment_confirmed':
      if (data.transactionId) {
        navigationRef.navigate('TransactionDetail', { id: data.transactionId });
      }
      break;

    case 'new_message':
      if (data.conversationId) {
        navigationRef.navigate('Chat', { conversationId: data.conversationId });
      }
      break;

    case 'rating_received':
    case 'new_rating':
      navigationRef.navigate('Profile');
      break;

    case 'item_match':
      if (data.listingId) {
        navigationRef.navigate('ListingDetail', { id: data.listingId });
      }
      break;

    case 'new_request':
      if (data.requestId) {
        navigationRef.navigate('RequestDetail', { id: data.requestId });
      }
      break;

    case 'discussion_reply':
    case 'listing_comment':
      if (data.listingId) {
        navigationRef.navigate('ListingDiscussion', { listingId: data.listingId });
      }
      break;

    case 'dispute_opened':
    case 'dispute_resolved':
      if (data.disputeId) {
        navigationRef.navigate('DisputeDetail', { id: data.disputeId });
      }
      break;

    case 'friend_request':
    case 'friend_accepted':
      navigationRef.navigate('Friends');
      break;

    default:
      navigationRef.navigate('Main', { screen: 'Activity' });
      break;
  }
}
