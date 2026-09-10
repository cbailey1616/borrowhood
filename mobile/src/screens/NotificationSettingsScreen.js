import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const LEGACY_NOTIFICATION_SETTINGS = [
  { category: 'On your phone', settings: [
    { key: 'push_enabled', label: 'Push notifications', description: 'Updates when you’re away from the app' },
    { key: 'push_sound', label: 'Sound', description: 'A sound with each notification' },
  ]},
  { category: 'Your activity', settings: [
    { key: 'new_message', label: 'Messages', description: 'Private messages from your neighbors' },
    { key: 'borrow_updates', label: 'Borrowing & lending', description: 'Requests, cancellations, pickups and returns' },
    { key: 'return_reminder', label: 'Return reminders', description: 'A reminder when an item is due back' },
    { key: 'post_replies', label: 'Replies to your posts', description: 'Questions and responses on items and requests' },
  ]},
  { category: 'Your neighborhood', settings: [
    { key: 'community_updates', label: 'Friends & neighbors', description: 'Friend requests and neighborhood invitations' },
    { key: 'item_match', label: 'Matches for your requests', description: 'When an item you’re looking for becomes available' },
  ]},
];

const NOTIFICATION_SETTINGS = [
  LEGACY_NOTIFICATION_SETTINGS[0],
  { category: 'Messages & replies', settings: [
    { key: 'new_message', label: 'Messages', description: 'Private messages from your neighbors' },
    { key: 'post_comments', label: 'Comments on your posts', description: 'Responses on your items and requests' },
    { key: 'comment_replies', label: 'Replies to your comments', description: 'Someone replies directly to your comment' },
  ]},
  { category: 'Requests & matches', settings: [
    { key: 'new_item_requests', label: 'New item requests', description: 'Someone is looking for an item' },
    { key: 'new_service_requests', label: 'New service requests', description: 'Someone is looking for help' },
    { key: 'item_match', label: 'Matches for your requests', description: 'An item you need becomes available or is offered to you' },
  ]},
  { category: 'Requests & matches from', description: 'Choose whose new requests and matching items can alert you. Each person uses their closest connection: friends first, then neighborhood, then town.', settings: [
    { key: 'source_friends', label: 'Friends', description: 'Your accepted friends, wherever they live' },
    { key: 'source_neighborhood', label: 'Neighborhood', description: 'People in your neighborhoods who aren’t already friends' },
    { key: 'source_town', label: 'Town', description: 'Other people in your town' },
  ]},
  { category: 'Borrowing & lending', settings: [
    { key: 'incoming_requests', label: 'Requests for your items', description: 'Borrow requests and requests to buy or take your items' },
    { key: 'request_approvals', label: 'Request approvals', description: 'Your request is accepted' },
    { key: 'request_declines', label: 'Request declines', description: 'Your request is declined' },
    { key: 'cancellations', label: 'Cancellations', description: 'An exchange is cancelled' },
    { key: 'pickup_updates', label: 'Pickup updates', description: 'Pickup confirmations and expired pickup windows' },
    { key: 'return_updates', label: 'Return confirmations', description: 'An item has been returned' },
    { key: 'return_reminder', label: 'Return reminders', description: 'An item is due back' },
    { key: 'expired_requests', label: 'Expired requests', description: 'A request expires before the owner responds' },
  ]},
  { category: 'Friends & neighborhoods', settings: [
    { key: 'friend_requests', label: 'Friend requests', description: 'Someone wants to connect with you' },
    { key: 'friend_acceptances', label: 'Friend request accepted', description: 'Someone accepts your friend request' },
    { key: 'neighborhood_requests', label: 'Neighborhood join requests', description: 'Someone asks to join a neighborhood you manage' },
    { key: 'neighborhood_responses', label: 'Neighborhood approvals', description: 'Your neighborhood join request is approved' },
  ]},
];

// Four expandable groups preserve the detailed choices without a wall of switches.
const COMPACT_SETTINGS = [
  NOTIFICATION_SETTINGS[0],
  NOTIFICATION_SETTINGS[1],
  { ...NOTIFICATION_SETTINGS[2], settings: [...NOTIFICATION_SETTINGS[2].settings, ...NOTIFICATION_SETTINGS[3].settings] },
  { ...NOTIFICATION_SETTINGS[4], category: 'Exchanges' },
  NOTIFICATION_SETTINGS[5],
];

export default function NotificationSettingsScreen() {
  const [preferences, setPreferences] = useState({});
  const [expanded, setExpanded] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [notifsDenied, setNotifsDenied] = useState(false);

  useEffect(() => {
    fetchPreferences();
    checkNotifPermission();
  }, []);

  const checkNotifPermission = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotifsDenied(status !== 'granted');
  };

  const fetchPreferences = async () => {
    try {
      const data = await api.getNotificationPreferences();
      setPreferences(data);
      setLoadError(false);
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Keep existing controls functional until the server supports the new keys.
  const settings = typeof preferences.new_service_requests === 'boolean'
    ? COMPACT_SETTINGS : LEGACY_NOTIFICATION_SETTINGS;

  const handleToggle = async (key, value) => {
    if (isSaving) return;
    setSaveError(false);
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);

    try {
      setIsSaving(true);
      await api.updateNotificationPreferences({ [key]: value });
      haptics.selection();
    } catch (error) {
      // Revert on error
      setPreferences(preferences);
      setSaveError(true);
      haptics.error();
    } finally {
      setIsSaving(false);
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
      {loadError ? <HapticPressable accessibilityRole="button" onPress={fetchPreferences} style={styles.section}><Text style={styles.settingLabel}>Couldn’t load settings. Tap to try again.</Text></HapticPressable> : null}
      {saveError && <Text accessibilityRole="alert" style={styles.footerText}>Couldn’t save that change. Please try again.</Text>}
      {notifsDenied && (
        <View style={styles.section}>
          <HapticPressable
            style={styles.notifBanner}
            onPress={() => Linking.openSettings()}
            haptic="light"
          >
            <Ionicons name="notifications-off-outline" size={18} color={COLORS.warning} />
            <Text style={styles.notifBannerText}>
              Notifications are off — tap to enable in Settings
            </Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </HapticPressable>
        </View>
      )}
      {!loadError && settings.map((category, index) => (
        <View key={category.category} style={styles.section}>
          {settings === COMPACT_SETTINGS && index > 0 ? <HapticPressable
            accessibilityRole="button" accessibilityLabel={category.category}
            accessibilityState={{ expanded: !!expanded[category.category] }}
            style={styles.groupHeader} onPress={() => setExpanded(previous => ({ ...previous, [category.category]: !previous[category.category] }))}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{category.category}</Text>
              <Text style={styles.settingDescription}>{category.settings.filter(setting => preferences[setting.key] !== false).length} of {category.settings.length} on</Text>
            </View>
            <Ionicons name={expanded[category.category] ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.primary} />
          </HapticPressable> : <Text style={styles.sectionTitle}>{category.category}</Text>}
          {(settings !== COMPACT_SETTINGS || index === 0 || expanded[category.category]) && <>
          {!!category.description && <Text style={styles.sectionDescription}>{category.description}</Text>}
          <View style={[styles.cardBox, styles.settingsGroup]}>
            {category.settings.map((setting, settingIndex) => (
              <View
                key={setting.key}
                style={[
                  styles.settingRow,
                  settingIndex < category.settings.length - 1 && styles.settingRowBorder,
                ]}
              >
                <View style={styles.settingInfo}>
                  {setting.key === 'source_friends' && <Text style={styles.settingDescription}>From friends, your neighborhood or town. Friends count first, then neighborhood, then town.</Text>}
                  <Text style={styles.settingLabel}>{setting.label}</Text>
                  <Text style={styles.settingDescription}>{setting.description}</Text>
                </View>
                <Switch
                  accessibilityLabel={setting.label}
                  accessibilityState={{ disabled: isSaving || (setting.key !== 'push_enabled' && preferences.push_enabled === false) }}
                  disabled={isSaving || (setting.key !== 'push_enabled' && preferences.push_enabled === false)}
                  value={preferences[setting.key] ?? true}
                  onValueChange={(value) => handleToggle(setting.key, value)}
                  trackColor={{ false: COLORS.primaryMuted, true: COLORS.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor={COLORS.primaryMuted}
                />
              </View>
            ))}
          </View>
          </>}
        </View>
      ))}

      <Text style={styles.footerText}>
        These settings control push notifications. Your messages and activity stay in the app.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  groupHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  section: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  sectionTitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
    textTransform: 'uppercase',
  },
  sectionDescription: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginBottom: SPACING.md },
  settingsGroup: {
    overflow: 'hidden',
    padding: 0,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.separator,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.text,
  },
  settingDescription: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  notifBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningMuted,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  notifBannerText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.text,
    flex: 1,
  },
  footerText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    textAlign: 'center',
    padding: SPACING.xl,
    paddingTop: SPACING.sm,
  },
});
