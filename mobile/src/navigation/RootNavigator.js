import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import { COLORS } from '../utils/config';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

// Detail screens accessible from anywhere
import ListingDetailScreen from '../screens/ListingDetailScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import DisputeDetailScreen from '../screens/DisputeDetailScreen';
import CreateListingScreen from '../screens/CreateListingScreen';
import BorrowRequestScreen from '../screens/BorrowRequestScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import WantedPostsScreen from '../screens/WantedPostsScreen';
import CreateRequestScreen from '../screens/CreateRequestScreen';
import RequestDetailScreen from '../screens/RequestDetailScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import ChatScreen from '../screens/ChatScreen';
import FriendsScreen from '../screens/FriendsScreen';
import PaymentMethodsScreen from '../screens/PaymentMethodsScreen';
import MyCommunityScreen from '../screens/MyCommunityScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import DisputesScreen from '../screens/DisputesScreen';
import SetupPayoutScreen from '../screens/SetupPayoutScreen';
import EditListingScreen from '../screens/EditListingScreen';
import ListingDiscussionScreen from '../screens/ListingDiscussionScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import BundlesScreen from '../screens/BundlesScreen';
import JoinCommunityScreen from '../screens/JoinCommunityScreen';
import InviteMembersScreen from '../screens/InviteMembersScreen';
import CommunitySettingsScreen from '../screens/CommunitySettingsScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainNavigator} />
          <Stack.Screen
            name="ListingDetail"
            component={ListingDetailScreen}
            options={{
              headerShown: true,
              title: 'Item Details',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="TransactionDetail"
            component={TransactionDetailScreen}
            options={{
              headerShown: true,
              title: 'Transaction',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="UserProfile"
            component={UserProfileScreen}
            options={{
              headerShown: true,
              title: 'Profile',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="DisputeDetail"
            component={DisputeDetailScreen}
            options={{
              headerShown: true,
              title: 'Dispute',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="CreateListing"
            component={CreateListingScreen}
            options={{
              headerShown: true,
              title: 'List an Item',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="EditListing"
            component={EditListingScreen}
            options={{
              headerShown: true,
              title: 'Edit Listing',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="BorrowRequest"
            component={BorrowRequestScreen}
            options={{
              headerShown: true,
              title: 'Request to Borrow',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{
              headerShown: true,
              title: 'Edit Profile',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="WantedPosts"
            component={WantedPostsScreen}
            options={{
              headerShown: true,
              title: 'Wanted Items',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="CreateRequest"
            component={CreateRequestScreen}
            options={{
              headerShown: true,
              title: 'Post a Request',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="RequestDetail"
            component={RequestDetailScreen}
            options={{
              headerShown: true,
              title: 'Request Details',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="Conversations"
            component={ConversationsScreen}
            options={{
              headerShown: true,
              title: 'Messages',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{
              headerShown: true,
              title: 'Chat',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="Friends"
            component={FriendsScreen}
            options={{
              headerShown: true,
              title: 'Friends',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="PaymentMethods"
            component={PaymentMethodsScreen}
            options={{
              headerShown: true,
              title: 'Payment Methods',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="MyCommunity"
            component={MyCommunityScreen}
            options={{
              headerShown: true,
              title: 'My Neighborhood',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="NotificationSettings"
            component={NotificationSettingsScreen}
            options={{
              headerShown: true,
              title: 'Notification Settings',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="Disputes"
            component={DisputesScreen}
            options={{
              headerShown: true,
              title: 'Disputes',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="SetupPayout"
            component={SetupPayoutScreen}
            options={{
              headerShown: true,
              title: 'Payout Settings',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="ListingDiscussion"
            component={ListingDiscussionScreen}
            options={{
              headerShown: true,
              title: 'Questions & Answers',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="Subscription"
            component={SubscriptionScreen}
            options={{
              headerShown: true,
              title: 'Subscription',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="Bundles"
            component={BundlesScreen}
            options={{
              headerShown: true,
              title: 'Item Bundles',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="JoinCommunity"
            component={JoinCommunityScreen}
            options={{
              headerShown: true,
              title: 'Find Your Neighborhood',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="InviteMembers"
            component={InviteMembersScreen}
            options={{
              headerShown: true,
              title: 'Invite Neighbors',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="CommunitySettings"
            component={CommunitySettingsScreen}
            options={{
              headerShown: true,
              title: 'Neighborhood Settings',
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
