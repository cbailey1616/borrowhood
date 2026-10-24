import { withReadableLayout } from '../components/ReadableScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import ReturnHelpScreen from '../screens/ReturnHelpScreen';
import TextInput from '../components/AppTextInput';
import RequestQueueScreen from '../screens/RequestQueueScreen';
import { detailRouteIds } from './routeIdentity';
import { requestQueueHeaderOptions } from '../components/RequestQueueHeader';
import { itemDetailsHeaderOptions } from '../components/ItemDetailsHeader';
import OfferItemScreen from '../screens/OfferItemScreen';
import InsightsScreen from '../screens/InsightsScreen';
import SafetyReportsScreen from '../screens/SafetyReportsScreen';
import AdminReportsScreen from '../screens/AdminReportsScreen';
import { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View, Modal, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import HapticPressable from '../components/HapticPressable';
import { ModalHeader } from '../components/ModalControls';
import { renderBackHeader } from '../components/BackHeader';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import useReduceMotion from '../hooks/useReduceMotion';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator';

// Detail screens accessible from anywhere
import ListingDetailScreen from '../screens/ListingDetailScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import ExchangeIssueScreen from '../screens/ExchangeIssueScreen';
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
import MyQRCodeScreen from '../screens/MyQRCodeScreen';
import useProfileLinks from '../hooks/useProfileLinks';
import MyCommunityScreen from '../screens/MyCommunityScreen';
import CommunityChatScreen from '../screens/CommunityChatScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import PrivacySafetyScreen from '../screens/PrivacySafetyScreen';
import DisputesScreen from '../screens/DisputesScreen';
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
import LendingCirclesScreen from '../screens/LendingCirclesScreen';
import CircleDetailScreen from '../screens/CircleDetailScreen';
import DamageClaimScreen from '../screens/DamageClaimScreen';
import ReportIssueScreen from '../screens/ReportIssueScreen';
import RespondToDisputeScreen from '../screens/RespondToDisputeScreen';
import TransactionHistoryScreen from '../screens/TransactionHistoryScreen';
import ExchangesScreen from '../screens/ExchangesScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Resolve wrappers once so folding and resizing preserve navigation and form state.
const readableScreens = {
  OfferItem: withReadableLayout(OfferItemScreen, 760),
  RequestQueue: withReadableLayout(RequestQueueScreen, 960),
  Insights: withReadableLayout(InsightsScreen, 960),
  ReturnHelp: withReadableLayout(ReturnHelpScreen, 960),
  ExchangeIssue: withReadableLayout(ExchangeIssueScreen, 760),
  AdminReports: withReadableLayout(AdminReportsScreen, 960),
  SafetyReports: withReadableLayout(SafetyReportsScreen, 960),
  TransactionDetail: withReadableLayout(TransactionDetailScreen, 960),
  UserProfile: withReadableLayout(UserProfileScreen, 960),
  DisputeDetail: withReadableLayout(DisputeDetailScreen, 960),
  CreateListing: withReadableLayout(CreateListingScreen, 760),
  EditListing: withReadableLayout(EditListingScreen, 760),
  BorrowRequest: withReadableLayout(BorrowRequestScreen, 760),
  EditProfile: withReadableLayout(EditProfileScreen, 760),
  WantedPosts: withReadableLayout(WantedPostsScreen, 960),
  CreateRequest: withReadableLayout(CreateRequestScreen, 760),
  RequestDetail: withReadableLayout(RequestDetailScreen, 960),
  EditRequest: withReadableLayout(EditRequestScreen, 760),
  Conversations: withReadableLayout(ConversationsScreen, 960),
  Friends: withReadableLayout(FriendsScreen, 960),
  MyQRCode: withReadableLayout(MyQRCodeScreen, 960),
  MyCommunity: withReadableLayout(MyCommunityScreen, 960),
  NotificationSettings: withReadableLayout(NotificationSettingsScreen, 960),
  PrivacySafety: withReadableLayout(PrivacySafetyScreen, 960),
  Disputes: withReadableLayout(DisputesScreen, 960),
  ListingDiscussion: withReadableLayout(ListingDiscussionScreen, 960),
  Subscription: withReadableLayout(SubscriptionScreen, 760),
  JoinCommunity: withReadableLayout(JoinCommunityScreen, 760),
  InviteMembers: withReadableLayout(InviteMembersScreen, 760),
  CommunityMembers: withReadableLayout(CommunityMembersScreen, 960),
  CommunitySettings: withReadableLayout(CommunitySettingsScreen, 960),
  Referral: withReadableLayout(ReferralScreen, 760),
  VerifyIdentity: withReadableLayout(VerifyIdentityScreen, 760),
  IdentityVerification: withReadableLayout(IdentityVerificationScreen, 760),
  LendingCircles: withReadableLayout(LendingCirclesScreen, 960),
  CircleDetail: withReadableLayout(CircleDetailScreen, 760),
  DamageClaim: withReadableLayout(DamageClaimScreen, 760),
  ReportIssue: withReadableLayout(ReportIssueScreen, 760),
  RespondToDispute: withReadableLayout(RespondToDisputeScreen, 760),
  Exchanges: withReadableLayout(ExchangesScreen, 960),
  TransactionHistory: withReadableLayout(TransactionHistoryScreen, 960),
  ChangePassword: withReadableLayout(ForgotPasswordScreen, 760),
};

const Stack = createNativeStackNavigator();

// Shared custom header keeps back controls outside the native iOS toolbar.
const sharedScreenOptions = {
  headerShown: true,
  header: renderBackHeader,
  headerStyle: {
    backgroundColor: COLORS.background,
  },
  headerShadowVisible: false,
  gestureEnabled: true,
  headerBackTitleVisible: false,
  headerTintColor: COLORS.primary,
  headerTitleStyle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.primary,
  },
  contentStyle: { backgroundColor: COLORS.background },
};

const modalScreenOptions = (title) => ({
  ...sharedScreenOptions,
  title,
  presentation: 'modal',
  gestureEnabled: true,
  header: ({ options }) => <ModalHeader title={options.title || title} />,
});

export default function RootNavigator({ navigationRef }) {
  const reduceMotion = useReduceMotion();
  const { isLoading, isAuthenticated, user, refreshUser } = useAuth();
  useProfileLinks(navigationRef, { isLoading, isAuthenticated, user });
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
        <ActivityIndicator size="large" color={COLORS.spinner} />
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
    <Stack.Navigator screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'default', statusBarStyle: 'dark' }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainNavigator} />
          <Stack.Screen name="OfferItem" component={readableScreens.OfferItem} options={modalScreenOptions("Private offer")} />
          <Stack.Screen
            name="ListingDetail"
            getId={detailRouteIds.ListingDetail}
            component={ListingDetailScreen}
            options={{ ...sharedScreenOptions, ...itemDetailsHeaderOptions }}
          />
          <Stack.Screen name="RequestQueue" getId={detailRouteIds.RequestQueue} component={readableScreens.RequestQueue} options={{ ...sharedScreenOptions, ...requestQueueHeaderOptions }} />
          <Stack.Screen name="Insights" component={readableScreens.Insights} options={{ ...sharedScreenOptions, title: 'App insights' }} />
          <Stack.Screen name="ReturnHelp" component={readableScreens.ReturnHelp} options={({ route }) => ({ ...sharedScreenOptions,
            title: route.params?.admin ? 'Return reviews' : route.params?.reports ? 'Return reports' : route.params?.transaction ? 'Return options' : 'Return reports' })} />
          <Stack.Screen name="ExchangeIssue" component={readableScreens.ExchangeIssue} options={modalScreenOptions('Report an issue')} />
          <Stack.Screen name="AdminReports" component={readableScreens.AdminReports} options={{ ...sharedScreenOptions, title: 'Reports' }} />
          <Stack.Screen name="SafetyReports" component={readableScreens.SafetyReports} options={{ ...sharedScreenOptions, title: 'Safety reports' }} />
          <Stack.Screen
            name="TransactionDetail"
            getId={detailRouteIds.TransactionDetail}
            component={readableScreens.TransactionDetail}
            options={{ ...sharedScreenOptions, title: 'Borrow details' }}
          />
          <Stack.Screen
            name="UserProfile"
            getId={detailRouteIds.UserProfile}
            component={readableScreens.UserProfile}
            options={{ ...sharedScreenOptions, title: 'Profile' }}
          />
          <Stack.Screen
            name="DisputeDetail"
            component={readableScreens.DisputeDetail}
            options={{ ...sharedScreenOptions, title: 'Dispute' }}
          />
          <Stack.Screen
            name="CreateListing"
            component={readableScreens.CreateListing}
            options={modalScreenOptions('Add an item')}
          />
          <Stack.Screen
            name="EditListing"
            component={readableScreens.EditListing}
            options={modalScreenOptions('Edit item')}
          />
          <Stack.Screen
            name="BorrowRequest"
            component={readableScreens.BorrowRequest}
            options={({ route }) => modalScreenOptions(
              route.params?.listing?.listingType === 'sell' ? 'Request to Buy' : route.params?.listing?.listingType === 'giveaway' ? 'Request Free Item' : 'Request to Borrow'
            )}
          />
          <Stack.Screen
            name="EditProfile"
            component={readableScreens.EditProfile}
            options={modalScreenOptions('Edit Profile')}
          />
          <Stack.Screen
            name="WantedPosts"
            component={readableScreens.WantedPosts}
            options={{ ...sharedScreenOptions, title: 'Wanted' }}
          />
          <Stack.Screen
            name="CreateRequest"
            component={readableScreens.CreateRequest}
            options={modalScreenOptions('Post in Wanted')}
          />
          <Stack.Screen
            name="RequestDetail"
            getId={detailRouteIds.RequestDetail}
            component={readableScreens.RequestDetail}
            options={{ ...sharedScreenOptions, title: 'Wanted post' }}
          />
          <Stack.Screen
            name="EditRequest"
            component={readableScreens.EditRequest}
            options={modalScreenOptions('Edit wanted post')}
          />
          <Stack.Screen
            name="Conversations"
            component={readableScreens.Conversations}
            options={{ ...sharedScreenOptions, title: 'Messages' }}
          />
          <Stack.Screen
            name="Chat"
            getId={detailRouteIds.Chat}
            component={ChatScreen}
            options={{ ...sharedScreenOptions, title: 'Chat' }}
          />
          <Stack.Screen
            name="Friends"
            component={readableScreens.Friends}
            options={({ route }) => route.params?.fromPosting
              ? modalScreenOptions('Friends')
              : { ...sharedScreenOptions, title: 'Friends' }}
          />
          <Stack.Screen name="MyQRCode" component={readableScreens.MyQRCode} options={{ ...sharedScreenOptions, title: 'My QR code' }} />
          <Stack.Screen
            name="MyCommunity"
            component={readableScreens.MyCommunity}
            options={{ ...sharedScreenOptions, title: 'My Neighborhood' }}
          />
          <Stack.Screen
            name="CommunityChat"
            component={CommunityChatScreen}
            getId={({ params }) => params?.communityId}
            options={{ ...sharedScreenOptions, headerShown: false }}
          />
          <Stack.Screen
            name="NotificationSettings"
            component={readableScreens.NotificationSettings}
            options={{ ...sharedScreenOptions, title: 'Notification Settings' }}
          />
          <Stack.Screen
            name="PrivacySafety"
            component={readableScreens.PrivacySafety}
            options={{ ...sharedScreenOptions, title: 'Privacy & safety' }}
          />
          <Stack.Screen
            name="Disputes"
            component={readableScreens.Disputes}
            options={{ ...sharedScreenOptions, title: 'Disputes' }}
          />
          <Stack.Screen
            name="ListingDiscussion"
            component={readableScreens.ListingDiscussion}
            options={({ route }) => ({
              ...sharedScreenOptions,
              title: 'Comments',
            })}
          />
          <Stack.Screen
            name="Subscription"
            component={readableScreens.Subscription}
            options={modalScreenOptions('Verification')}
          />
          <Stack.Screen
            name="JoinCommunity"
            component={readableScreens.JoinCommunity}
            options={({ route }) => route.params?.fromPosting
              ? modalScreenOptions('Find your neighborhood')
              : { ...sharedScreenOptions, title: 'Find Your Neighborhood' }}
          />
          <Stack.Screen
            name="InviteMembers"
            component={readableScreens.InviteMembers}
            options={{ ...sharedScreenOptions, title: 'Invite Neighbors' }}
          />
          <Stack.Screen
            name="CommunityMembers"
            component={readableScreens.CommunityMembers}
            options={{ ...sharedScreenOptions, title: 'Members' }}
          />
          <Stack.Screen
            name="CommunitySettings"
            component={readableScreens.CommunitySettings}
            options={{ ...sharedScreenOptions, title: 'Neighborhood Settings' }}
          />
          <Stack.Screen
            name="Referral"
            component={readableScreens.Referral}
            options={{ ...sharedScreenOptions, title: 'Invite Friends' }}
          />
          <Stack.Screen
            name="VerifyIdentity"
            component={readableScreens.VerifyIdentity}
            options={{ ...sharedScreenOptions, title: 'Verification' }}
          />
          <Stack.Screen
            name="IdentityVerification"
            component={readableScreens.IdentityVerification}
            options={modalScreenOptions('Verification')}
          />
          <Stack.Screen name="LendingCircles" component={readableScreens.LendingCircles} options={modalScreenOptions('Lending circles')} />
          <Stack.Screen name="CircleDetail" component={readableScreens.CircleDetail} options={modalScreenOptions('Circle')} />
          <Stack.Screen
            name="DamageClaim"
            component={readableScreens.DamageClaim}
            options={modalScreenOptions('Damage Claim')}
          />
          <Stack.Screen
            name="ReportIssue"
            component={readableScreens.ReportIssue}
            options={modalScreenOptions('Report an Issue')}
          />
          <Stack.Screen
            name="RespondToDispute"
            component={readableScreens.RespondToDispute}
            options={({ route }) => modalScreenOptions(
              route.params?.mode === 'counter' ? 'Counter Proposal' : 'Decline Claim'
            )}
          />
          <Stack.Screen name="Projects" component={ProjectsScreen} options={{ ...sharedScreenOptions, title: 'Make a little happen', headerShown: false }} />
          <Stack.Screen
            name="Exchanges"
            component={readableScreens.Exchanges}
            options={{ ...sharedScreenOptions, title: 'Your exchanges' }}
          />
          <Stack.Screen
            name="TransactionHistory"
            component={readableScreens.TransactionHistory}
            options={{ ...sharedScreenOptions, title: 'Past exchanges' }}
          />
          <Stack.Screen
            name="ChangePassword"
            component={readableScreens.ChangePassword}
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
  const reduceMotion = useReduceMotion();
  return (
    <Modal visible animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={nameStyles.container} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <Text maxFontSizeMultiplier={1.4} style={nameStyles.title}>What's your name?</Text>
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
        {!!error && <Text accessibilityRole="alert" style={{ ...TYPOGRAPHY.body, color: COLORS.danger, marginBottom: SPACING.md }}>{error}</Text>}
        <HapticPressable
          style={[nameStyles.button, !nameInput.first.trim() && { opacity: 0.5 }]}
          onPress={onSave}
          disabled={!nameInput.first.trim() || saving}
          haptic={null}
          scaleDown={0.97}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text maxFontSizeMultiplier={1.4} style={nameStyles.buttonText}>Continue</Text>
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
    ...TYPOGRAPHY.body,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
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
    ...TYPOGRAPHY.button,
    color: COLORS.white,
  },
});
