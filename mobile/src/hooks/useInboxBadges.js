import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';
import { subscribeInboxChanges } from '../utils/inboxUpdates';

const EMPTY_COUNTS = { messages: 0, notifications: 0, actions: 0, total: 0 };
export const FeedSeenContext = createContext(() => {});
const timestamp = value => new Date(value).getTime() || 0;

export default function useInboxBadges(userId) {
  const [badgeCounts, setBadgeCounts] = useState(EMPTY_COUNTS);
  const [feedState, setFeedState] = useState({ userId, seenAt: 0, latestAt: 0, ready: false });
  const mounted = useRef(false);
  const requestVersion = useRef(0);
  const activeUser = useRef(userId);
  const seenAt = useRef(0);
  const saves = useRef(Promise.resolve());
  const loaded = useRef(Promise.resolve(null));
  const storageKey = `bh_feed_seen_${userId}`;

  useEffect(() => {
    activeUser.current = userId;
    seenAt.current = 0;
    setBadgeCounts(EMPTY_COUNTS);
    setFeedState({ userId, seenAt: 0, latestAt: 0, ready: false });
    let active = true;
    loaded.current = SecureStore.getItemAsync(storageKey).catch(() => null);
    loaded.current.then(value => {
      if (!active) return;
      seenAt.current = Math.max(seenAt.current, Number(value) || 0);
      setFeedState(state => ({ ...state, seenAt: seenAt.current, ready: true }));
    });
    return () => { active = false; requestVersion.current += 1; };
  }, [userId, storageKey]);

  const markFeedSeen = useCallback(latestPostAt => {
    if (latestPostAt === undefined || activeUser.current !== userId) return;
    const value = timestamp(latestPostAt);
    seenAt.current = Math.max(seenAt.current, value);
    setFeedState(state => ({ ...state, seenAt: seenAt.current, latestAt: Math.max(state.latestAt, value) }));
    const savedValue = seenAt.current;
    const accountLoad = loaded.current;
    saves.current = saves.current.catch(() => {}).then(async () => {
      const storedValue = Number(await accountLoad) || 0;
      await SecureStore.setItemAsync(storageKey, String(Math.max(storedValue, savedValue)));
    }).catch(() => {});
  }, [userId, storageKey]);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const isCurrent = () => mounted.current && activeUser.current === userId && version === requestVersion.current;
    await Promise.allSettled([
      api.getBadgeCount().then(data => {
        // A slower request from before a conversation was read must not restore
        // its old unread count after the latest refresh has completed.
        if (isCurrent()) {
          setBadgeCounts(data);
          Notifications.setBadgeCountAsync((data.messages || 0) + (data.notifications || 0)).catch(() => {});
        }
      }),
      api.getFeed({ summary: 'true' }).then(data => {
        if (isCurrent() && data.latestPostAt !== undefined) {
          setFeedState(state => ({ ...state, latestAt: timestamp(data.latestPostAt) }));
        }
      }),
      // Keep the last confirmed count while offline. A failed refresh does
      // not mean that the user has read their messages.
    ]);
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    let appState = AppState.currentState;
    const appStateListener = AppState.addEventListener('change', nextState => {
      appState = nextState;
      if (nextState === 'active') refresh();
    });
    const received = Notifications.addNotificationReceivedListener(refresh);
    const opened = Notifications.addNotificationResponseReceivedListener(refresh);
    const unsubscribeInbox = subscribeInboxChanges(userId, refresh);
    // Also works when push notifications are disabled; stop polling in the
    // background and refresh immediately when the app becomes active again.
    const interval = setInterval(() => {
      if (appState == null || appState === 'active') refresh();
    }, 30000);
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      clearInterval(interval);
      appStateListener.remove();
      received.remove();
      opened.remove();
      unsubscribeInbox();
    };
  }, [refresh, userId]);

  // Returning from Chat to any main tab refreshes the server's read counts.
  // Merely opening Inbox does not mark any conversation as read.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return {
    badgeCounts, refresh, markFeedSeen,
    hasNewFeed: feedState.userId === userId && feedState.ready && feedState.latestAt > feedState.seenAt,
  };
}
