import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS } from '../utils/config';

export default function CommunitySettingsScreen({ route, navigation }) {
  const { id } = route.params;
  const [community, setCommunity] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [showInDirectory, setShowInDirectory] = useState(true);

  useEffect(() => {
    fetchCommunity();
  }, [id]);

  const fetchCommunity = async () => {
    try {
      const data = await api.getCommunity(id);
      setCommunity(data);
    } catch (error) {
      console.error('Failed to fetch community:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveCommunity = () => {
    Alert.alert(
      'Leave Neighborhood',
      `Are you sure you want to leave ${community?.name}? You'll lose access to neighborhood items and members.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.leaveCommunity(id);
              navigation.navigate('Main');
            } catch (error) {
              Alert.alert('Error', 'Failed to leave neighborhood');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Neighborhood Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Neighborhood</Text>
        <View style={styles.infoCard}>
          <Text style={styles.communityName}>{community?.name || 'My Neighborhood'}</Text>
          {community?.description && (
            <Text style={styles.communityDescription}>{community.description}</Text>
          )}
        </View>
      </View>

      {/* Notification Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>New Items</Text>
            <Text style={styles.settingDescription}>
              Get notified when neighbors list new items
            </Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: COLORS.gray[700], true: COLORS.primaryLight }}
            thumbColor={notifications ? COLORS.primary : COLORS.gray[400]}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Messages</Text>
            <Text style={styles.settingDescription}>
              Receive notifications for new messages
            </Text>
          </View>
          <Switch
            value={true}
            trackColor={{ false: COLORS.gray[700], true: COLORS.primaryLight }}
            thumbColor={COLORS.primary}
          />
        </View>
      </View>

      {/* Privacy */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show in Member Directory</Text>
            <Text style={styles.settingDescription}>
              Let other neighbors see your profile
            </Text>
          </View>
          <Switch
            value={showInDirectory}
            onValueChange={setShowInDirectory}
            trackColor={{ false: COLORS.gray[700], true: COLORS.primaryLight }}
            thumbColor={showInDirectory ? COLORS.primary : COLORS.gray[400]}
          />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('InviteMembers', { communityId: id })}
        >
          <Ionicons name="person-add-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Invite Neighbors</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('CommunityMembers', { id })}
        >
          <Ionicons name="people-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>View All Members</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </TouchableOpacity>
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: COLORS.danger }]}>Danger Zone</Text>

        <TouchableOpacity
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleLeaveCommunity}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={[styles.actionButtonText, styles.dangerText]}>Leave Neighborhood</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  section: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  communityName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  communityDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  settingInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  settingDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  dangerButton: {
    backgroundColor: COLORS.dangerMuted,
  },
  dangerText: {
    color: COLORS.danger,
  },
  bottomPadding: {
    height: 40,
  },
});
