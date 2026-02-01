import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Linking,
  Switch,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '../components/Icon';
import UserBadges from '../components/UserBadges';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import useBiometrics from '../hooks/useBiometrics';
import api from '../services/api';
import { COLORS, BASE_URL } from '../utils/config';

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

  useEffect(() => {
    setBiometricToggle(isBiometricsEnabled);
  }, [isBiometricsEnabled]);

  const handleChangePhoto = () => {
    Alert.alert(
      'Change Photo',
      'Choose a photo for your profile',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: handleTakePhoto },
        { text: 'Choose from Library', onPress: handlePickPhoto },
      ]
    );
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
      // User wants to enable - they need to log out and log back in
      Alert.alert(
        `Enable ${biometricType}`,
        `To enable ${biometricType}, please sign out and sign back in with your password. You'll be prompted to enable it after login.`,
        [{ text: 'OK' }]
      );
    } else {
      // User wants to disable
      Alert.alert(
        `Disable ${biometricType}?`,
        `You'll need to enter your password to sign in.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              await disableBiometrics();
              setBiometricToggle(false);
              refreshBiometrics();
            },
          },
        ]
      );
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  const MenuItem = ({ icon, label, onPress, danger }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
        <Ionicons name={icon} size={20} color={danger ? COLORS.danger : COLORS.textSecondary} />
      </View>
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
    </TouchableOpacity>
  );

  const MenuItemToggle = ({ icon, label, value, onValueChange }) => (
    <View style={styles.menuItem}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={20} color={COLORS.textSecondary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.gray[700], true: COLORS.primary }}
        thumbColor="#fff"
      />
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleChangePhoto} disabled={uploadingPhoto}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: user?.profilePhotoUrl || 'https://via.placeholder.com/80' }}
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
        </TouchableOpacity>
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
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={() => navigation.navigate('Auth', { screen: 'VerifyIdentity' })}
            >
              <Text style={styles.verifyButtonText}>Verify Identity</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{user?.totalTransactions || 0}</Text>
          <Text style={styles.statLabel}>Transactions</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <View style={styles.ratingRow}>
            <Text style={styles.starIcon}>★</Text>
            <Text style={styles.statValue}>
              {user?.lenderRating?.toFixed(1) || '0.0'}
            </Text>
          </View>
          <Text style={styles.statLabel}>As Lender ({user?.lenderRatingCount || 0})</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <View style={styles.ratingRow}>
            <Text style={styles.starIcon}>★</Text>
            <Text style={styles.statValue}>
              {user?.borrowerRating?.toFixed(1) || '0.0'}
            </Text>
          </View>
          <Text style={styles.statLabel}>As Borrower ({user?.borrowerRatingCount || 0})</Text>
        </View>
      </View>

      {/* Menu Sections */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="person-outline"
            label="Edit Profile"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <MenuItem
            icon="star-outline"
            label="Subscription"
            onPress={() => navigation.navigate('Subscription')}
          />
          <MenuItem
            icon="mail-outline"
            label="Messages"
            onPress={() => navigation.navigate('Conversations')}
          />
          <MenuItem
            icon="people-outline"
            label="Friends"
            onPress={() => navigation.navigate('Friends')}
          />
          <MenuItem
            icon="card-outline"
            label="Payment Methods"
            onPress={() => navigation.navigate('PaymentMethods')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Community</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="home-outline"
            label="My Neighborhood"
            onPress={() => navigation.navigate('MyCommunity')}
          />
          <MenuItem
            icon="flag-outline"
            label="Disputes"
            onPress={() => navigation.navigate('Disputes')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.menuGroup}>
          {isBiometricsAvailable && (
            <MenuItemToggle
              icon={biometricType === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
              label={biometricType || 'Biometrics'}
              value={biometricToggle}
              onValueChange={handleBiometricToggle}
            />
          )}
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <MenuItem
            icon="help-circle-outline"
            label="Help & Support"
            onPress={() => Linking.openURL('mailto:support@borrowhood.com')}
          />
          <MenuItem
            icon="document-text-outline"
            label="Terms & Privacy"
            onPress={() => Linking.openURL(`${BASE_URL}/terms`)}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.menuGroup}>
          <MenuItem icon="log-out-outline" label="Sign Out" onPress={handleLogout} danger />
        </View>
      </View>

      <Text style={styles.version}>Borrowhood v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.surface,
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.gray[700],
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
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
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  email: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  verifyButton: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  verifyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.background,
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingVertical: 16,
    marginTop: 1,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.gray[700],
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starIcon: {
    fontSize: 14,
    color: COLORS.warning,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  menuGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.gray[800],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuIconDanger: {
    backgroundColor: COLORS.danger + '20',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  menuLabelDanger: {
    color: COLORS.danger,
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textMuted,
    marginVertical: 24,
  },
});
