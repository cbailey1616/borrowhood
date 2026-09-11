import TextInput from '../components/AppTextInput';
import RequestQueueScreen from '../screens/RequestQueueScreen';
import OfferItemScreen from '../screens/OfferItemScreen';
import InsightsScreen from '../screens/InsightsScreen';
import SafetyReportsScreen from '../screens/SafetyReportsScreen';
import { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View, Modal, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import HapticPressable from '../components/HapticPressable';
import { ModalHeader } from '../components/ModalControls';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

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
const sharedScreenOptions = {
  headerShown: true,
  headerStyle: {
    backgroundColor: COLORS.background,
  },
  headerShadowVisible: false,
  gestureEnabled: true,
  headerBackTitleVisible: false,
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
  gestureEnabled: true,
  header: () => <ModalHeader title={title} />,
});

export default function RootNavigator() {
  const { isLoading, isAuthenticated, user, refreshUser } = useAuth();
  const [nameInput, setNameInput] = useState({ first: '', last: '' });
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  const showNamePrompt = isAuthenticated && user?.needsName;

  const handleSaveName = async () => {
    if (!nameInput.first.trim() || savingName) return;
    setSavingName(true); setNameError('');
    try {
      await api.updateProfile({
        firstName: nameInput.first.trim(),
        lastName: nameInput.last.trim(),
      });
      await refreshUser();
    } catch (e) {
      setNameError('Could not save your name. Check your connection and try again.');
    } finally {
      setSavingName(false);
    }
  };

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
    <>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainNavigator} />
          <Stack.Screen name="OfferItem" component={OfferItemScreen} options={modalScreenOptions("Private offer")} />
          <Stack.Screen
            name="ListingDetail"
            component={ListingDetailScreen}
            options={{ ...sharedScreenOptions, title: 'Item Details' }}
          />
          <Stack.Screen name="RequestQueue" component={RequestQueueScreen} options={{ ...sharedScreenOptions, title: 'People waiting' }} />
          <Stack.Screen name="Insights" component={InsightsScreen} options={{ ...sharedScreenOptions, title: 'App insights' }} />
          <Stack.Screen name="SafetyReports" component={SafetyReportsScreen} options={{ ...sharedScreenOptions, title: 'Safety reports' }} />
          <Stack.Screen
            name="TransactionDetail"
            component={TransactionDetailScreen}
            options={{ ...sharedScreenOptions, title: 'Borrow details' }}
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
            options={modalScreenOptions('Add an item')}
          />
          <Stack.Screen
            name="EditListing"
            component={EditListingScreen}
            options={modalScreenOptions('Edit item')}
          />
          <Stack.Screen
            name="BorrowRequest"
            component={BorrowRequestScreen}
            options={({ route }) => modalScreenOptions(
              route.params?.listing?.listingType === 'sell' ? 'Request to Buy' : route.params?.listing?.listingType === 'giveaway' ? 'Request Free Item' : 'Request to Borrow'
            )}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={modalScreenOptions('Edit Profile')}
          />
          <Stack.Screen
            name="WantedPosts"
            component={WantedPostsScreen}
            options={{ ...sharedScreenOptions, title: 'Requests' }}
          />
          <Stack.Screen
            name="CreateRequest"
            component={CreateRequestScreen}
            options={modalScreenOptions('Post a Request')}
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
            options={({ route }) => route.params?.fromPosting
              ? modalScreenOptions('Friends')
              : { ...sharedScreenOptions, title: 'Friends' }}
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
            options={{ ...sharedScreenOptions, title: 'Notification Settings' }}
          />
          <Stack.Screen
            name="Disputes"
            component={DisputesScreen}
            options={{ ...sharedScreenOptions, title: 'Disputes' }}
          />
          <Stack.Screen
            name="SetupPayout"
            component={SetupPayoutScreen}
            options={{ ...sharedScreenOptions, title: 'Payout Settings' }}
          />
          <Stack.Screen
            name="ListingDiscussion"
            component={ListingDiscussionScreen}
            options={({ route }) => ({
              ...sharedScreenOptions,
              title: 'Comments',
            })}
          />
          <Stack.Screen
            name="Subscription"
            component={SubscriptionScreen}
            options={modalScreenOptions('Verification')}
          />
          <Stack.Screen
            name="JoinCommunity"
            component={JoinCommunityScreen}
            options={({ route }) => route.params?.fromPosting
              ? modalScreenOptions('Find your neighborhood')
              : { ...sharedScreenOptions, title: 'Find Your Neighborhood' }}
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
            options={modalScreenOptions('Borrow Checkout')}
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
            options={{ ...sharedScreenOptions, title: 'Past exchanges' }}
          />
          <Stack.Screen
            name="ChangePassword"
            component={ForgotPasswordScreen}
            options={modalScreenOptions('Change Password')}
          />
        </>
      )}
    </Stack.Navigator>
    {showNamePrompt && <NamePromptModal nameInput={nameInput} setNameInput={setNameInput} saving={savingName} error={nameError} onSave={handleSaveName} />}
    </>
  );
}

function NamePromptModal({ nameInput, setNameInput, saving, error, onSave }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={nameStyles.container} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <Text style={nameStyles.title}>What's your name?</Text>
        <Text style={nameStyles.subtitle}>
          We need your name so neighbors know who they're borrowing from.
        </Text>
        <TextInput
          style={nameStyles.input}
          placeholder="First name" accessibilityLabel="First name" editable={!saving} maxLength={100}
          placeholderTextColor={COLORS.textMuted}
          value={nameInput.first}
          onChangeText={(v) => setNameInput(prev => ({ ...prev, first: v }))}
          autoCapitalize="words"
          autoFocus
        />
        <TextInput
          style={nameStyles.input}
          placeholder="Last name" accessibilityLabel="Last name" editable={!saving} maxLength={100}
          placeholderTextColor={COLORS.textMuted}
          value={nameInput.last}
          onChangeText={(v) => setNameInput(prev => ({ ...prev, last: v }))}
          autoCapitalize="words"
        />
        {!!error && <Text accessibilityRole="alert" style={{ color: COLORS.danger, marginBottom: SPACING.md }}>{error}</Text>}
        <HapticPressable
          style={[nameStyles.button, !nameInput.first.trim() && { opacity: 0.5 }]}
          onPress={onSave}
          disabled={!nameInput.first.trim() || saving}
          haptic="medium"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={nameStyles.buttonText}>Continue</Text>
          )}
        </HapticPressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const nameStyles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
  },
  input: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  buttonText: {
    ...TYPOGRAPHY.headline,
    color: '#fff',
  },
});
