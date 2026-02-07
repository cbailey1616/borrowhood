import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useState, useEffect, useCallback } from 'react';
import { COLORS } from '../utils/config';
import api from '../services/api';
import BlurTabBar from '../components/BlurTabBar';

import FeedScreen from '../screens/FeedScreen';
import SavedScreen from '../screens/SavedScreen';
import MyItemsScreen from '../screens/MyItemsScreen';
import InboxScreen from '../screens/InboxScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function MainNavigator() {
  const [badgeCounts, setBadgeCounts] = useState({ messages: 0, notifications: 0, actions: 0, total: 0 });

  const fetchBadgeCount = useCallback(async () => {
    try {
      const data = await api.getBadgeCount();
      setBadgeCounts(data);
    } catch (error) {
      console.error('Failed to fetch badge count:', error);
    }
  }, []);

  // Fetch on mount and periodically
  useEffect(() => {
    fetchBadgeCount();
    const interval = setInterval(fetchBadgeCount, 30000);
    return () => clearInterval(interval);
  }, [fetchBadgeCount]);

  return (
    <Tab.Navigator
      tabBar={(props) => <BlurTabBar {...props} unreadCount={badgeCounts.total} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{ title: 'Feed' }}
      />
      <Tab.Screen
        name="Saved"
        component={SavedScreen}
        options={{ title: 'Saved' }}
      />
      <Tab.Screen
        name="MyItems"
        component={MyItemsScreen}
        options={{ title: 'My Items' }}
      />
      <Tab.Screen
        name="Inbox"
        options={{ title: 'Inbox' }}
        listeners={{
          tabPress: () => {
            setTimeout(fetchBadgeCount, 1000);
          },
        }}
      >
        {(props) => <InboxScreen {...props} badgeCounts={badgeCounts} onRead={fetchBadgeCount} />}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
