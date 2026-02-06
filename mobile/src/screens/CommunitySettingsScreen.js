import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';

export default function CommunitySettingsScreen({ route, navigation }) {
  const { id } = route.params;
  const [community, setCommunity] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [showInDirectory, setShowInDirectory] = useState(true);
  const [showLeaveSheet, setShowLeaveSheet] = useState(false);

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
    setShowLeaveSheet(true);
  };

  const performLeaveCommunity = async () => {
    try {
      await api.leaveCommunity(id);
      haptics.success();
      navigation.navigate('Main');
    } catch (error) {
      haptics.error();
    }
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
        <BlurCard>
          <View style={styles.infoCardContent}>
            <Text style={styles.communityName}>{community?.name || 'My Neighborhood'}</Text>
            {community?.description && (
              <Text style={styles.communityDescription}>{community.description}</Text>
            )}
          </View>
        </BlurCard>
      </View>

      {/* Notification Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>

        <BlurCard style={styles.settingCard}>
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
        </BlurCard>

        <BlurCard style={styles.settingCard}>
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
        </BlurCard>
      </View>

      {/* Privacy */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>

        <BlurCard style={styles.settingCard}>
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
        </BlurCard>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>

        <HapticPressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('InviteMembers', { communityId: id })}
          haptic="light"
        >
          <Ionicons name="person-add-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Invite Neighbors</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </HapticPressable>

        <HapticPressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('CommunityMembers', { id })}
          haptic="light"
        >
          <Ionicons name="people-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>View All Members</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </HapticPressable>
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: COLORS.danger }]}>Danger Zone</Text>

        <HapticPressable
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleLeaveCommunity}
          haptic="medium"
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={[styles.actionButtonText, styles.dangerText]}>Leave Neighborhood</Text>
        </HapticPressable>
      </View>

      <View style={styles.bottomPadding} />

      <ActionSheet
        isVisible={showLeaveSheet}
        onClose={() => setShowLeaveSheet(false)}
        title="Leave Neighborhood"
        message={`Are you sure you want to leave ${community?.name}? You'll lose access to neighborhood items and members.`}
        actions={[
          {
            label: 'Leave',
            destructive: true,
            onPress: performLeaveCommunity,
          },
        ]}
      />
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  sectionTitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  infoCardContent: {
    padding: SPACING.lg,
  },
  communityName: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
  },
  communityDescription: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  settingCard: {
    marginBottom: SPACING.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  settingInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  settingLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  settingDescription: {
    ...TYPOGRAPHY.footnote,
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
    ...TYPOGRAPHY.body,
    flex: 1,
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
