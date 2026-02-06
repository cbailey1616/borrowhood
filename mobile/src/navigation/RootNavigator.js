import { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import { COLORS } from '../utils/config';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingScreen from '../screens/OnboardingScreen';

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
import AddPaymentMethodScreen from '../screens/AddPaymentMethodScreen';
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
import ReferralScreen from '../screens/ReferralScreen';

const Stack = createNativeStackNavigator();

// Shared screen options for native iOS feel
const sharedScreenOptions = {
  headerShown: true,
  headerStyle: {
    backgroundColor: COLORS.surface,
  },
  headerShadowVisible: false,
  headerTintColor: COLORS.text,
  headerTitleStyle: {
    fontWeight: '600',
    color: COLORS.text,
    fontSize: 17,
  },
  contentStyle: { backgroundColor: COLORS.background },
};

export default function RootNavigator() {
  const { isLoading, isAuthenticated, user, refreshUser } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Check if user needs onboarding (no city set)
  const needsOnboarding = isAuthenticated && user && !user.city && !onboardingComplete;

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Show onboarding for new users
  if (needsOnboarding) {
    return (
      <OnboardingScreen
        onComplete={() => {
          refreshUser();
          setOnboardingComplete(true);
        }}
      />
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
            options={{ ...sharedScreenOptions, title: 'Item Details' }}
          />
          <Stack.Screen
            name="TransactionDetail"
            component={TransactionDetailScreen}
            options={{ ...sharedScreenOptions, title: 'Transaction' }}
          />
          <Stack.Screen
            name="UserProfile"
            component={UserProfileScreen}
            options={{ ...sharedScreenOptions, title: 'Profile' }}
          />
          <Stack.Screen
            name="DisputeDetail"
            component={DisputeDetailScreen}
            options={{ ...sharedScreenOptions, title: 'Dispute' }}
          />
          <Stack.Screen
            name="CreateListing"
            component={CreateListingScreen}
            options={{ ...sharedScreenOptions, title: 'List an Item', presentation: 'modal' }}
          />
          <Stack.Screen
            name="EditListing"
            component={EditListingScreen}
            options={{ ...sharedScreenOptions, title: 'Edit Listing', presentation: 'modal' }}
          />
          <Stack.Screen
            name="BorrowRequest"
            component={BorrowRequestScreen}
            options={{ ...sharedScreenOptions, title: 'Request to Borrow', presentation: 'modal' }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{ ...sharedScreenOptions, title: 'Edit Profile', presentation: 'modal' }}
          />
          <Stack.Screen
            name="WantedPosts"
            component={WantedPostsScreen}
            options={{ ...sharedScreenOptions, title: 'Wanted Items' }}
          />
          <Stack.Screen
            name="CreateRequest"
            component={CreateRequestScreen}
            options={{ ...sharedScreenOptions, title: 'Post a Request', presentation: 'modal' }}
          />
          <Stack.Screen
            name="RequestDetail"
            component={RequestDetailScreen}
            options={{ ...sharedScreenOptions, title: 'Request Details' }}
          />
          <Stack.Screen
            name="Conversations"
            component={ConversationsScreen}
            options={{ ...sharedScreenOptions, title: 'Messages' }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ ...sharedScreenOptions, title: 'Chat' }}
          />
          <Stack.Screen
            name="Friends"
            component={FriendsScreen}
            options={{ ...sharedScreenOptions, title: 'Friends' }}
          />
          <Stack.Screen
            name="PaymentMethods"
            component={PaymentMethodsScreen}
            options={{ ...sharedScreenOptions, title: 'Payment Methods' }}
          />
          <Stack.Screen
            name="AddPaymentMethod"
            component={AddPaymentMethodScreen}
            options={{ ...sharedScreenOptions, title: 'Add Card', presentation: 'modal' }}
          />
          <Stack.Screen
            name="MyCommunity"
            component={MyCommunityScreen}
            options={{ ...sharedScreenOptions, title: 'My Neighborhood' }}
          />
          <Stack.Screen
            name="NotificationSettings"
            component={NotificationSettingsScreen}
            options={{ ...sharedScreenOptions, title: 'Notification Settings', presentation: 'formSheet' }}
          />
          <Stack.Screen
            name="Disputes"
            component={DisputesScreen}
            options={{ ...sharedScreenOptions, title: 'Disputes' }}
          />
          <Stack.Screen
            name="SetupPayout"
            component={SetupPayoutScreen}
            options={{ ...sharedScreenOptions, title: 'Payout Settings', presentation: 'formSheet' }}
          />
          <Stack.Screen
            name="ListingDiscussion"
            component={ListingDiscussionScreen}
            options={{ ...sharedScreenOptions, title: 'Questions & Answers' }}
          />
          <Stack.Screen
            name="Subscription"
            component={SubscriptionScreen}
            options={{ ...sharedScreenOptions, title: 'Subscription' }}
          />
          <Stack.Screen
            name="Bundles"
            component={BundlesScreen}
            options={{ ...sharedScreenOptions, title: 'Item Bundles' }}
          />
          <Stack.Screen
            name="JoinCommunity"
            component={JoinCommunityScreen}
            options={{ ...sharedScreenOptions, title: 'Find Your Neighborhood' }}
          />
          <Stack.Screen
            name="InviteMembers"
            component={InviteMembersScreen}
            options={{ ...sharedScreenOptions, title: 'Invite Neighbors' }}
          />
          <Stack.Screen
            name="CommunitySettings"
            component={CommunitySettingsScreen}
            options={{ ...sharedScreenOptions, title: 'Neighborhood Settings' }}
          />
          <Stack.Screen
            name="Referral"
            component={ReferralScreen}
            options={{ ...sharedScreenOptions, title: 'Invite Friends' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
