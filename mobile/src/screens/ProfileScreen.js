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
import BlurCard from '../components/BlurCard';
import { GroupedListSection, GroupedListItem } from '../components/GroupedList';
import NativeHeader from '../components/NativeHeader';
import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import useBiometrics from '../hooks/useBiometrics';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, BASE_URL, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
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
        title: 'Camera Access',
        message: 'Camera permission is needed to take photos.',
      });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
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
        message: err.message || 'Unable to upload photo. Please try again.',
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
        <BlurCard style={styles.header}>
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
              <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              {user?.isVerified ? (
                <UserBadges
                  isVerified={user?.isVerified}
                  totalTransactions={user?.totalTransactions || 0}
                  size="medium"
                />
              ) : (
                <HapticPressable
                  style={styles.verifyButton}
                  onPress={() => navigation.navigate('Auth', { screen: 'VerifyIdentity' })}
                  haptic="light"
                >
                  <Text style={styles.verifyButtonText}>Verify Identity</Text>
                </HapticPressable>
              )}
            </View>
          </View>
        </BlurCard>

        {/* Stats */}
        <BlurCard style={styles.stats}>
          <View style={styles.statsInner}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{user?.totalTransactions || 0}</Text>
              <Text style={styles.statLabel}>Transactions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <View style={styles.ratingRow}>
                <Text style={styles.starIcon}>★</Text>
                <Text style={styles.statValue}>
                  {user?.rating?.toFixed(1) || '0.0'}
                </Text>
              </View>
              <Text style={styles.statLabel}>Rating ({user?.ratingCount || 0})</Text>
            </View>
          </View>
        </BlurCard>

        {/* Account Section */}
        <GroupedListSection header="Account">
          <GroupedListItem
            icon="person-outline"
            title="Edit Profile"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <GroupedListItem
            icon="star-outline"
            title="Subscription"
            onPress={() => navigation.navigate('Subscription')}
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
          <GroupedListItem
            icon="card-outline"
            title="Payment Methods"
            onPress={() => navigation.navigate('PaymentMethods')}
          />
          <GroupedListItem
            icon="gift-outline"
            title="Invite Friends"
            onPress={() => navigation.navigate('Referral')}
          />
        </GroupedListSection>

        {/* Community Section */}
        <GroupedListSection header="Community">
          <GroupedListItem
            icon="home-outline"
            title="My Neighborhood"
            onPress={() => navigation.navigate('MyCommunity')}
          />
          <GroupedListItem
            icon="flag-outline"
            title="Disputes"
            onPress={() => navigation.navigate('Disputes')}
          />
        </GroupedListSection>

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
            icon="notifications-outline"
            title="Notifications"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <GroupedListItem
            icon="help-circle-outline"
            title="Help & Support"
            onPress={() => Linking.openURL('mailto:support@borrowhood.com')}
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
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    marginBottom: SPACING.md,
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
    borderRadius: 44,
    backgroundColor: COLORS.gray[700],
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
  },
  email: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  verifyButton: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  verifyButtonText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.background,
  },
  stats: {
    marginBottom: SPACING.xl,
  },
  statsInner: {
    flexDirection: 'row',
    paddingVertical: SPACING.lg,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.separator,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  starIcon: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.warning,
  },
  statValue: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
  },
  statLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  version: {
    textAlign: 'center',
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginVertical: SPACING.xl,
  },
});
