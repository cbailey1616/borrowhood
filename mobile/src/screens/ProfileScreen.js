import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Linking,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../utils/config';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();

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
        <Text style={[styles.menuIconText, danger && { color: COLORS.danger }]}>
          {icon}
        </Text>
      </View>
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.header}>
        <Image
          source={{ uri: user?.profilePhotoUrl || 'https://via.placeholder.com/80' }}
          style={styles.avatar}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.isVerified ? (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedIcon}>✓</Text>
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
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
            icon="○"
            label="Edit Profile"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <MenuItem
            icon="★"
            label="Subscription"
            onPress={() => navigation.navigate('Subscription')}
          />
          <MenuItem
            icon="◖"
            label="Messages"
            onPress={() => navigation.navigate('Conversations')}
          />
          <MenuItem
            icon="•"
            label="Friends"
            onPress={() => navigation.navigate('Friends')}
          />
          <MenuItem
            icon="•"
            label="Payment Methods"
            onPress={() => navigation.navigate('PaymentMethods')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Community</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="⌂"
            label="My Neighborhood"
            onPress={() => navigation.navigate('MyCommunity')}
          />
          <MenuItem
            icon="•"
            label="Disputes"
            onPress={() => navigation.navigate('Disputes')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="○"
            label="Notifications"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <MenuItem
            icon="?"
            label="Help & Support"
            onPress={() => Linking.openURL('mailto:support@borrowhood.com')}
          />
          <MenuItem
            icon="•"
            label="Terms & Privacy"
            onPress={() => Linking.openURL('https://borrowhood.com/terms')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.menuGroup}>
          <MenuItem icon="→" label="Sign Out" onPress={handleLogout} danger />
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
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.gray[700],
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
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  verifiedIcon: {
    fontSize: 12,
    color: COLORS.primary,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
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
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.gray[800],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuIconText: {
    fontSize: 16,
    color: COLORS.textSecondary,
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
  chevron: {
    fontSize: 20,
    color: COLORS.textMuted,
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textMuted,
    marginVertical: 24,
  },
});
