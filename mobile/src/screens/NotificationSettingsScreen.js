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

const NOTIFICATION_SETTINGS = [
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

export default function NotificationSettingsScreen() {
  const [preferences, setPreferences] = useState({});
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

  const getDefaultPreferences = () => {
    const defaults = {};
    NOTIFICATION_SETTINGS.forEach(category => {
      category.settings.forEach(setting => {
        defaults[setting.key] = true;
      });
    });
    return defaults;
  };

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
      {!loadError && NOTIFICATION_SETTINGS.map((category, index) => (
        <View key={category.category} style={styles.section}>
          <Text style={styles.sectionTitle}>{category.category}</Text>
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
                  <Text style={styles.settingLabel}>{setting.label}</Text>
                  <Text style={styles.settingDescription}>{setting.description}</Text>
                </View>
                <Switch
                  accessibilityLabel={setting.label}
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
        </View>
      ))}

      <Text style={styles.footerText}>
        These settings control push notifications. Your messages and activity stay in the app.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
