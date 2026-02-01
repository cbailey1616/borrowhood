import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../utils/config';

import FeedScreen from '../screens/FeedScreen';
import SavedScreen from '../screens/SavedScreen';
import MyItemsScreen from '../screens/MyItemsScreen';
import ActivityScreen from '../screens/ActivityScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

// Simple tab icon component
function TabIcon({ focused, label }) {
  const icons = {
    Feed: '◉',
    Saved: '♥',
    'My Items': '▤',
    Activity: '⇄',
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
    </View>
  );
}

export default function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <TabIcon focused={focused} label={route.name === 'MyItems' ? 'My Items' : route.name} />
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
        name="Activity"
        component={ActivityScreen}
        options={{ title: 'Activity' }}
      />
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
});
