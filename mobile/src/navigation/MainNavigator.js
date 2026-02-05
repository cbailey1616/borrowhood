import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { COLORS } from '../utils/config';
import api from '../services/api';

import FeedScreen from '../screens/FeedScreen';
import SavedScreen from '../screens/SavedScreen';
import MyItemsScreen from '../screens/MyItemsScreen';
import InboxScreen from '../screens/InboxScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

// Simple tab icon component
function TabIcon({ focused, label, badge }) {
  const icons = {
    Feed: '◉',
    Saved: '♥',
    'My Items': '▤',
    Inbox: '✉',
    Profile: '○',
  };

  return (
    <View style={styles.iconContainer}>
      <Text style={[
        styles.icon,
        { color: focused ? COLORS.primary : COLORS.textMuted }
      ]}>
        {icons[label] || '•'}
      </Text>
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      )}
    </View>
  );
}

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
    const interval = setInterval(fetchUnreadCount, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <TabIcon
            focused={focused}
            label={route.name === 'MyItems' ? 'My Items' : route.name}
            badge={route.name === 'Inbox' ? unreadCount : 0}
          />
        ),
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.gray[800],
          borderTopWidth: 1,
          paddingTop: 8,
          height: 85,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: COLORS.background,
          borderBottomWidth: 0,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTitleStyle: {
          fontWeight: '600',
          color: COLORS.text,
          fontSize: 17,
        },
        headerTintColor: COLORS.text,
      })}
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

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  icon: {
    fontSize: 22,
    fontWeight: '400',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#E53935',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
