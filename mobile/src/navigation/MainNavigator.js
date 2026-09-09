import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS } from '../utils/config';
import useInboxBadges, { FeedSeenContext } from '../hooks/useInboxBadges';
import { useAuth } from '../context/AuthContext';
import BlurTabBar from '../components/BlurTabBar';

import FeedScreen from '../screens/FeedScreen';
import SavedScreen from '../screens/SavedScreen';
import MyItemsScreen from '../screens/MyItemsScreen';
import InboxScreen from '../screens/InboxScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function MainNavigator() {
  const { user } = useAuth();
  const { badgeCounts, refresh: fetchBadgeCount, hasNewFeed, markFeedSeen } = useInboxBadges(user.id);

  return (
    <FeedSeenContext.Provider value={markFeedSeen}>
    <Tab.Navigator
      tabBar={(props) => <BlurTabBar {...props} unreadCount={badgeCounts.messages} hasNewFeed={hasNewFeed} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="Saved"
        component={SavedScreen}
        options={{ title: 'Saved' }}
      />
      <Tab.Screen
        name="MyItems"
        component={MyItemsScreen}
        options={{ title: 'My Posts' }}
      />
      <Tab.Screen
        name="Activity"
        options={{ title: 'Inbox' }}
        listeners={{
          tabPress: fetchBadgeCount,
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
    </FeedSeenContext.Provider>
  );
}
