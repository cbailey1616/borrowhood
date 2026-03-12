import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { Ionicons } from '../components/Icon';
import UserBadges from '../components/UserBadges';
import HapticPressable from '../components/HapticPressable';
import { GroupedListSection, GroupedListItem } from '../components/GroupedList';
import NativeHeader from '../components/NativeHeader';
import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import useBiometrics from '../hooks/useBiometrics';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, BASE_URL, SPACING, RADIUS, TYPOGRAPHY, ENABLE_PAID_TIERS } from '../utils/config';

export default function ProfileScreen({ navigation }) {
  const { user, logout, refreshUser } = useAuth();
  const { showError, showToast } = useError();
  const {
    isBiometricsAvailable,
    isBiometricsEnabled,
    biometricType,
    disableBiometrics,
    refreshBiometrics,
  } = useBiometrics();

  const [biometricToggle, setBiometricToggle] = useState(isBiometricsEnabled);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [biometricSheet, setBiometricSheet] = useState(null);
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  useEffect(() => {
    setBiometricToggle(isBiometricsEnabled);
  }, [isBiometricsEnabled]);

  const handleChangePhoto = () => {
    haptics.medium();
    setShowPhotoSheet(true);
  };

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      exif: false,
    });

    if (!result.canceled) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showError({
        type: 'generic',
        title: 'Camera Access Needed',
        message: 'BorrowHood needs camera access to take a profile photo. You can enable it in your device Settings.',
      });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      exif: false,
    });

    if (!result.canceled) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri) => {
    setUploadingPhoto(true);
    try {
      const photoUrl = await api.uploadImage(uri, 'profiles');
      await api.updateProfile({ profilePhotoUrl: photoUrl });
      await refreshUser();
      showToast('Photo updated!', 'success');
    } catch (err) {
      showError({
        message: err.message || 'Couldn\'t upload your photo. Please check your connection and try again.',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleBiometricToggle = async (value) => {
    if (value) {
      setBiometricSheet('enable');
    } else {
      setBiometricSheet('disable');
    }
  };

  const handleLogout = () => {
    haptics.warning();
    setShowLogoutSheet(true);
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await api.deleteAccount();
      haptics.success();
      logout();
    } catch (err) {
      showError({
        message: err.message || 'Failed to delete account. Please try again or contact support.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <NativeHeader title="Profile" scrollY={scrollY} />

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.headerInner}>
            <HapticPressable onPress={handleChangePhoto} disabled={uploadingPhoto} haptic={null}>
              <View style={styles.avatarContainer}>
                <Image
                  source={{ uri: user?.profilePhotoUrl || 'https://via.placeholder.com/88' }}
                  style={styles.avatar}
                />
                {uploadingPhoto ? (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : (
                  <View style={styles.avatarBadge}>
                    <Ionicons name="create-outline" size={14} color="#fff" />
                  </View>
                )}
              </View>
            </HapticPressable>
            <View style={styles.headerInfo}>
              <Text style={styles.name} testID="Profile.header.name" accessibilityLabel="User name" accessibilityRole="header">{user?.displayName || `${user?.firstName} ${user?.lastName}`}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              {user?.isVerified && (
                <UserBadges
                  isVerified={user?.isVerified}
                  totalTransactions={user?.totalTransactions || 0}
                  size="medium"
                />
              )}
            </View>
          </View>
        </View>

        {/* Verification Banner */}
        {!user?.isVerified && (
          <HapticPressable
            style={styles.verifyBanner}
            onPress={() => navigation.navigate('IdentityVerification', { source: 'profile' })}
            haptic="medium"
          >
            <View style={styles.verifyBannerIcon}>
              <Ionicons name="shield-outline" size={22} color={COLORS.warning} />
            </View>
            <View style={styles.verifyBannerText}>
              <Text style={styles.verifyBannerTitle}>Verify Your Identity</Text>
              <Text style={styles.verifyBannerSubtitle}>Required to borrow or lend items</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </HapticPressable>
        )}

        {/* Account Section */}
        <GroupedListSection header="Account">
          <GroupedListItem
            icon="person-outline"
            title="Edit Profile"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <GroupedListItem
            icon="home-outline"
            title="My Neighborhood"
            onPress={() => navigation.navigate('MyCommunity')}
          />
          <GroupedListItem
            icon="mail-outline"
            title="Messages"
            onPress={() => navigation.navigate('Conversations')}
          />
          <GroupedListItem
            icon="people-outline"
            title="Friends"
            onPress={() => navigation.navigate('Friends')}
          />
        </GroupedListSection>

        {/* Rentals & Payments Section */}
        <GroupedListSection header="Rentals & Payments">
          <GroupedListItem
            icon="receipt-outline"
            title="Transaction History"
            onPress={() => navigation.navigate('TransactionHistory')}
          />
          <GroupedListItem
            icon="cash-outline"
            title="Earnings"
            onPress={() => navigation.navigate('Earnings')}
          />
          <GroupedListItem
            icon="card-outline"
            title="Payment Methods"
            onPress={() => navigation.navigate('PaymentMethods')}
          />
          <GroupedListItem
            icon="flag-outline"
            title="Disputes"
            onPress={() => navigation.navigate('Disputes')}
          />
          {/* TODO: Restore when re-enabling paid tiers (ENABLE_PAID_TIERS) */}
          {ENABLE_PAID_TIERS && (
            <GroupedListItem
              icon="star-outline"
              title="Subscription"
              onPress={() => navigation.navigate('Subscription')}
              testID="Profile.menu.subscription"
              accessibilityLabel="Subscription settings"
              accessibilityRole="button"
            />
          )}
        </GroupedListSection>

        {/* Community Section */}
        {ENABLE_PAID_TIERS && (
          <GroupedListSection header="Community">
            <GroupedListItem
              icon="gift-outline"
              title="Invite Friends"
              onPress={() => navigation.navigate('Referral')}
            />
          </GroupedListSection>
        )}

        {/* Settings Section */}
        <GroupedListSection header="Settings">
          {isBiometricsAvailable && (
            <GroupedListItem
              icon={biometricType === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
              title={biometricType || 'Biometrics'}
              switchValue={biometricToggle}
              onSwitchChange={handleBiometricToggle}
              chevron={false}
            />
          )}
          <GroupedListItem
            icon="lock-closed-outline"
            title="Change Password"
            onPress={() => navigation.navigate('ChangePassword', { email: user?.email, changeMode: true })}
          />
          <GroupedListItem
            icon="notifications-outline"
            title="Notifications"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <GroupedListItem
            icon="help-circle-outline"
            title="Help & Support"
            onPress={() => Linking.openURL('mailto:support@borrowhood.net')}
          />
          <GroupedListItem
            icon="document-text-outline"
            title="Terms & Privacy"
            onPress={() => Linking.openURL(`${BASE_URL}/terms`)}
          />
        </GroupedListSection>

        {/* Sign Out Section */}
        <GroupedListSection>
          <GroupedListItem
            icon="log-out-outline"
            title="Sign Out"
            onPress={handleLogout}
            destructive
            testID="Profile.menu.signOut"
            accessibilityLabel="Sign out"
            accessibilityRole="button"
          />
          <GroupedListItem
            icon="trash-outline"
            title="Delete Account"
            onPress={() => { haptics.warning(); setShowDeleteSheet(true); }}
            destructive
            accessibilityLabel="Delete account"
            accessibilityRole="button"
          />
        </GroupedListSection>

        <Text style={styles.version}>Borrowhood v1.0.0</Text>
      </Animated.ScrollView>

      {/* Photo Action Sheet */}
      <ActionSheet
        isVisible={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        title="Change Photo"
        message="Choose a photo for your profile"
        actions={[
          { label: 'Take Photo', onPress: handleTakePhoto },
          { label: 'Choose from Library', onPress: handlePickPhoto },
        ]}
      />

      {/* Biometric Enable Sheet */}
      <ActionSheet
        isVisible={biometricSheet === 'enable'}
        onClose={() => setBiometricSheet(null)}
        title={`Enable ${biometricType}`}
        message={`To enable ${biometricType}, please sign out and sign back in with your password. You'll be prompted to enable it after login.`}
        actions={[
          { label: 'OK', onPress: () => {} },
        ]}
      />

      {/* Biometric Disable Sheet */}
      <ActionSheet
        isVisible={biometricSheet === 'disable'}
        onClose={() => setBiometricSheet(null)}
        title={`Disable ${biometricType}?`}
        message="You'll need to enter your password to sign in."
        actions={[
          {
            label: 'Disable',
            destructive: true,
            onPress: async () => {
              await disableBiometrics();
              setBiometricToggle(false);
              refreshBiometrics();
            },
          },
        ]}
      />

      {/* Sign Out Sheet */}
      <ActionSheet
        isVisible={showLogoutSheet}
        onClose={() => setShowLogoutSheet(false)}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        actions={[
          { label: 'Sign Out', destructive: true, onPress: logout },
        ]}
      />

      {/* Delete Account Sheet */}
      <ActionSheet
        isVisible={showDeleteSheet}
        onClose={() => setShowDeleteSheet(false)}
        title="Delete Account"
        message="This will permanently delete your account, listings, transaction history, and all associated data. This action cannot be undone."
        actions={[
          { label: isDeleting ? 'Deleting...' : 'Delete My Account', destructive: true, onPress: handleDeleteAccount },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    marginBottom: SPACING.md,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1.5,
    borderColor: COLORS.greenBorder,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: COLORS.gray[700],
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.greenBg,
    zIndex: 10,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    ...TYPOGRAPHY.h2,
    color: COLORS.greenText,
  },
  email: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.greenTextMuted,
    marginTop: SPACING.xs,
  },
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningMuted,
    borderWidth: 1.5,
    borderColor: 'rgba(184, 134, 11, 0.3)',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  verifyBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(184, 134, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBannerText: {
    flex: 1,
  },
  verifyBannerTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    fontSize: 15,
  },
  verifyBannerSubtitle: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  version: {
    textAlign: 'center',
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginVertical: SPACING.xl,
  },
});
