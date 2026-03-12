import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View, Text } from 'react-native';
import { COLORS } from '../utils/config';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator';

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
import RequestSuggestionsScreen from '../screens/RequestSuggestionsScreen';
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
import EditRequestScreen from '../screens/EditRequestScreen';
import ListingDiscussionScreen from '../screens/ListingDiscussionScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import BundlesScreen from '../screens/BundlesScreen';
import JoinCommunityScreen from '../screens/JoinCommunityScreen';
import InviteMembersScreen from '../screens/InviteMembersScreen';
import CommunitySettingsScreen from '../screens/CommunitySettingsScreen';
import CommunityMembersScreen from '../screens/CommunityMembersScreen';
import ReferralScreen from '../screens/ReferralScreen';
import VerifyIdentityScreen from '../screens/auth/VerifyIdentityScreen';
import IdentityVerificationScreen from '../screens/IdentityVerificationScreen';
import PaymentFlowScreen from '../screens/PaymentFlowScreen';
import RentalCheckoutScreen from '../screens/RentalCheckoutScreen';
import DamageClaimScreen from '../screens/DamageClaimScreen';
import ReportIssueScreen from '../screens/ReportIssueScreen';
import RespondToDisputeScreen from '../screens/RespondToDisputeScreen';
import EarningsScreen from '../screens/EarningsScreen';
import TransactionHistoryScreen from '../screens/TransactionHistoryScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

const Stack = createNativeStackNavigator();

// Shared screen options for native iOS feel
const GrabHandle = () => (
  <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, backgroundColor: COLORS.textMuted, opacity: 0.4, marginBottom: 4 }} />
);

const sharedScreenOptions = {
  headerShown: true,
  headerStyle: {
    backgroundColor: COLORS.background,
  },
  headerShadowVisible: false,
  headerTintColor: COLORS.primary,
  headerTitleStyle: {
    fontWeight: '600',
    color: COLORS.primary,
    fontSize: 17,
  },
  contentStyle: { backgroundColor: COLORS.background },
};

const modalScreenOptions = (title) => ({
  ...sharedScreenOptions,
  title,
  presentation: 'modal',
  header: ({ options }) => (
    <View style={{ backgroundColor: COLORS.background, paddingTop: 8 }}>
      <GrabHandle />
      <View style={{ alignItems: 'center', paddingVertical: 10 }}>
        <Text style={{ fontWeight: '600', color: COLORS.primary, fontSize: 17 }}>{options.title}</Text>
      </View>
    </View>
  ),
});

export default function RootNavigator() {
  const { isLoading, isAuthenticated, user } = useAuth();

  // Check if user needs onboarding
  const needsOnboarding = isAuthenticated && user && !user.onboardingCompleted;

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
      <OnboardingNavigator initialStep={user?.onboardingStep || 1} />
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
            options={modalScreenOptions('List an Item')}
          />
          <Stack.Screen
            name="EditListing"
            component={EditListingScreen}
            options={modalScreenOptions('Edit Listing')}
          />
          <Stack.Screen
            name="BorrowRequest"
            component={BorrowRequestScreen}
            options={modalScreenOptions('Request to Borrow')}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={modalScreenOptions('Edit Profile')}
          />
          <Stack.Screen
            name="WantedPosts"
            component={WantedPostsScreen}
            options={{ ...sharedScreenOptions, title: 'Wanted Items' }}
          />
          <Stack.Screen
            name="CreateRequest"
            component={CreateRequestScreen}
            options={modalScreenOptions('Post a Request')}
          />
          <Stack.Screen
            name="RequestSuggestions"
            component={RequestSuggestionsScreen}
            options={{ ...sharedScreenOptions, title: 'Suggestions', headerShown: false }}
          />
          <Stack.Screen
            name="RequestDetail"
            component={RequestDetailScreen}
            options={{ ...sharedScreenOptions, title: 'Request Details' }}
          />
          <Stack.Screen
            name="EditRequest"
            component={EditRequestScreen}
            options={modalScreenOptions('Edit Request')}
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
            options={modalScreenOptions('Add Card')}
          />
          <Stack.Screen
            name="MyCommunity"
            component={MyCommunityScreen}
            options={{ ...sharedScreenOptions, title: 'My Neighborhood' }}
          />
          <Stack.Screen
            name="NotificationSettings"
            component={NotificationSettingsScreen}
            options={modalScreenOptions('Notification Settings')}
          />
          <Stack.Screen
            name="Disputes"
            component={DisputesScreen}
            options={{ ...sharedScreenOptions, title: 'Disputes' }}
          />
          <Stack.Screen
            name="SetupPayout"
            component={SetupPayoutScreen}
            options={modalScreenOptions('Payout Settings')}
          />
          <Stack.Screen
            name="ListingDiscussion"
            component={ListingDiscussionScreen}
            options={({ route }) => ({
              ...sharedScreenOptions,
              title: route.params?.requestId ? 'Discussion' : 'Questions & Answers',
            })}
          />
          <Stack.Screen
            name="Subscription"
            component={SubscriptionScreen}
            options={modalScreenOptions('Subscription')}
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
            name="CommunityMembers"
            component={CommunityMembersScreen}
            options={{ ...sharedScreenOptions, title: 'Members' }}
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
          <Stack.Screen
            name="VerifyIdentity"
            component={VerifyIdentityScreen}
            options={{ ...sharedScreenOptions, title: 'Verify Identity' }}
          />
          <Stack.Screen
            name="IdentityVerification"
            component={IdentityVerificationScreen}
            options={modalScreenOptions('Verify Identity')}
          />
          <Stack.Screen
            name="PaymentFlow"
            component={PaymentFlowScreen}
            options={modalScreenOptions('Payment')}
          />
          <Stack.Screen
            name="RentalCheckout"
            component={RentalCheckoutScreen}
            options={modalScreenOptions('Rental Checkout')}
          />
          <Stack.Screen
            name="DamageClaim"
            component={DamageClaimScreen}
            options={modalScreenOptions('Damage Claim')}
          />
          <Stack.Screen
            name="ReportIssue"
            component={ReportIssueScreen}
            options={modalScreenOptions('Report an Issue')}
          />
          <Stack.Screen
            name="RespondToDispute"
            component={RespondToDisputeScreen}
            options={({ route }) => modalScreenOptions(
              route.params?.mode === 'counter' ? 'Counter Proposal' : 'Decline Claim'
            )}
          />
          <Stack.Screen
            name="Earnings"
            component={EarningsScreen}
            options={{ ...sharedScreenOptions, title: 'Earnings' }}
          />
          <Stack.Screen
            name="TransactionHistory"
            component={TransactionHistoryScreen}
            options={{ ...sharedScreenOptions, title: 'Transaction History' }}
          />
          <Stack.Screen
            name="ChangePassword"
            component={ForgotPasswordScreen}
            options={modalScreenOptions('Change Password')}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
