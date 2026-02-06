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
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await api.getConversations();
      const total = (data || []).reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
      setUnreadCount(total);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, []);

  // Fetch on mount and periodically
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return (
    <Tab.Navigator
      tabBar={(props) => <BlurTabBar {...props} unreadCount={unreadCount} />}
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
            setTimeout(fetchUnreadCount, 1000);
          },
        }}
      >
        {(props) => <InboxScreen {...props} onRead={fetchUnreadCount} />}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
