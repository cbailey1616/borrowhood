import { useState, useEffect, useRef } from 'react';
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

const CORE_SETTINGS = [
  { key: 'new_item_requests', label: 'Item requests', icon: 'cube' },
  { key: 'new_service_requests', label: 'Service requests', icon: 'handshake' },
];
const ACTIVITY_SETTINGS = [
  { key: 'new_message', label: 'Messages' },
  { key: 'post_replies', label: 'Comments & replies' },
  { key: 'borrow_updates', label: 'Borrowing & lending' },
  { key: 'return_reminder', label: 'Return reminders' },
  { key: 'community_updates', label: 'Friends & neighborhood activity' },
];
const SOURCES = [
  { key: 'source_friends', label: 'Friends' },
  { key: 'source_neighborhood', label: 'Neighbors' },
  { key: 'source_town', label: 'Town' },
];
const PHONE_SETTINGS = [
  { key: 'push_enabled', label: 'Push notifications' },
  { key: 'push_sound', label: 'Sound' },
];

export default function NotificationSettingsScreen() {
  const [preferences, setPreferences] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const savingRef = useRef(false);
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

  const handleChange = async (patch, section = 'phone') => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveError(null);
    const newPreferences = { ...preferences, ...patch };
    setPreferences(newPreferences);

    try {
      setIsSaving(true);
      await api.updateNotificationPreferences(patch);
      haptics.selection();
    } catch (error) {
      // Revert on error
      setPreferences(preferences);
      setSaveError(section);
      haptics.error();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const sourceEnabled = (core, source) => {
    const saved = preferences[`${core}_${source}`];
    if (typeof saved === 'boolean') return saved;
    return preferences[core] !== false && preferences[source] !== false;
  };
  const toggleSource = (core, source, value) => {
    // Save all audiences for this category so one change cannot enable the others.
    const patch = Object.fromEntries(SOURCES.map(item => [
      `${core}_${item.key}`, item.key === source ? value : sourceEnabled(core, item.key),
    ]));
    handleChange({ ...patch, [core]: true }, core);
  };
  const childDisabled = isSaving || preferences.push_enabled === false;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loadError ? <HapticPressable accessibilityRole="button" onPress={fetchPreferences} style={styles.section}><Text style={styles.settingLabel}>Couldn’t load settings. Tap to try again.</Text></HapticPressable> : null}
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
      {!loadError && <>
        <View style={styles.section}>
          <View style={[styles.cardBox, styles.settingsGroup]}>
            {PHONE_SETTINGS.map((setting, index) => <View key={setting.key} style={[styles.settingRow, index < PHONE_SETTINGS.length - 1 && styles.settingRowBorder]}>
              <Text style={[styles.settingLabel, styles.settingInfo]}>{setting.label}</Text>
              <Switch accessibilityLabel={setting.label}
                accessibilityState={{ disabled: setting.key === 'push_enabled' ? isSaving : childDisabled }}
                disabled={setting.key === 'push_enabled' ? isSaving : childDisabled}
                value={preferences[setting.key] ?? true}
                onValueChange={value => handleChange({ [setting.key]: value })}
                trackColor={{ false: COLORS.primaryMuted, true: COLORS.primary }}
                thumbColor="#fff" ios_backgroundColor={COLORS.primaryMuted} />
            </View>)}
          </View>
          {saveError === 'phone' && <Text accessibilityRole="alert" style={styles.settingDescription}>Couldn’t save that change. Please try again.</Text>}
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>New requests</Text>
          <Text style={styles.sectionDescription}>Choose who you hear from.</Text>
          <View style={styles.requestGroups}>
            {CORE_SETTINGS.map(setting => <View key={setting.key}>
              <View style={[styles.cardBox, styles.settingsGroup]} testID={`Notifications.${setting.key}`}>
                <View style={styles.requestHeading}>
                  <Ionicons name={setting.icon} size={28} illustrated />
                  <Text accessibilityRole="header" style={styles.requestTitle}>{setting.label}</Text>
                </View>
                {SOURCES.map((source, index) => <View key={source.key} style={[styles.settingRow, index < SOURCES.length - 1 && styles.settingRowBorder]}>
                  <Text style={[styles.settingLabel, styles.settingInfo]}>{source.label}</Text>
                  <Switch accessibilityLabel={`${setting.label}: ${source.label}`}
                    accessibilityState={{ disabled: childDisabled }} disabled={childDisabled}
                    value={sourceEnabled(setting.key, source.key)}
                    onValueChange={value => toggleSource(setting.key, source.key, value)}
                    trackColor={{ false: COLORS.primaryMuted, true: COLORS.primary }}
                    thumbColor="#fff" ios_backgroundColor={COLORS.primaryMuted} />
                </View>)}
              </View>
              {saveError === setting.key && <Text accessibilityRole="alert" style={styles.settingDescription}>Couldn’t save that change. Please try again.</Text>}
            </View>)}
          </View>
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>Your activity</Text>
          <View style={[styles.cardBox, styles.settingsGroup]}>
            {ACTIVITY_SETTINGS.map((setting, index) => <View key={setting.key} style={[styles.settingRow, index < ACTIVITY_SETTINGS.length - 1 && styles.settingRowBorder]}>
              <Text style={[styles.settingLabel, styles.settingInfo]}>{setting.label}</Text>
              <Switch accessibilityLabel={setting.label} accessibilityState={{ disabled: childDisabled }} disabled={childDisabled}
                value={preferences[setting.key] ?? true} onValueChange={value => handleChange({ [setting.key]: value }, 'activity')}
                trackColor={{ false: COLORS.primaryMuted, true: COLORS.primary }} thumbColor="#fff" ios_backgroundColor={COLORS.primaryMuted} />
            </View>)}
          </View>
          {saveError === 'activity' && <Text accessibilityRole="alert" style={styles.settingDescription}>Couldn’t save that change. Please try again.</Text>}
        </View>
      </>}

      <Text style={styles.footerText}>
        Messages and activity stay in the app, even with push off.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { ...TYPOGRAPHY.headline, color: COLORS.primary, marginBottom: SPACING.sm },
  requestGroups: { gap: SPACING.md },
  requestHeading: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm,
  },
  requestTitle: { ...TYPOGRAPHY.headline, color: COLORS.primary, flex: 1 },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    width: '100%', maxWidth: 600, alignSelf: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm,
    paddingBottom: SPACING.xxl, gap: SPACING.xl,
  },
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderBrown,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  section: { gap: 0 },
  sectionDescription: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: -SPACING.xs, marginBottom: SPACING.md },
  settingsGroup: {
    overflow: 'hidden',
    padding: 0,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    minHeight: 48,
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
    ...TYPOGRAPHY.subheadline,
    color: COLORS.text,
  },
  settingDescription: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
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
    paddingHorizontal: SPACING.xs,
  },
});
