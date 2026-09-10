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
  { key: 'new_item_requests', label: 'Item requests' },
  { key: 'new_service_requests', label: 'Service requests' },
];
const ACTIVITY_SETTINGS = [
  { key: 'new_message', label: 'Messages' },
  { key: 'post_replies', label: 'Comments & replies' },
  { key: 'borrow_updates', label: 'Borrowing & lending' },
  { key: 'return_reminder', label: 'Return reminders' },
  { key: 'item_match', label: 'Matches for your requests' },
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
    const discovery = ['new_item_requests', 'new_service_requests', 'item_match'].includes(core);
    return preferences[core] !== false && (!discovery || preferences[source] !== false);
  };
  const toggleSource = (core, source, value) => {
    // Save the entire visible row so turning one source on cannot enable the others.
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
    <ScrollView style={styles.container}>
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
          <Text style={styles.sectionDescription}>Choose whose item and service requests you hear about.</Text>
          <View style={[styles.cardBox, styles.settingsGroup]}>
            {CORE_SETTINGS.map((setting, index) => <View key={setting.key} style={[styles.coreRow, index < CORE_SETTINGS.length - 1 && styles.settingRowBorder]}>
              <Text style={styles.settingLabel}>{setting.label}</Text>
              <View style={styles.sourceRow}>
                {SOURCES.map(source => {
                  const enabled = sourceEnabled(setting.key, source.key);
                  return <View key={source.key} style={styles.sourceControl}>
                    <Text style={styles.sourceLabel}>{source.label}</Text>
                    <Switch accessibilityLabel={`${setting.label}: ${source.label}`}
                      accessibilityState={{ disabled: childDisabled }} disabled={childDisabled}
                      value={enabled} onValueChange={value => toggleSource(setting.key, source.key, value)}
                      trackColor={{ false: COLORS.primaryMuted, true: COLORS.primary }}
                      thumbColor="#fff" ios_backgroundColor={COLORS.primaryMuted} />
                  </View>;
                })}
              </View>
              {saveError === setting.key && <Text accessibilityRole="alert" style={styles.settingDescription}>Couldn’t save that change. Please try again.</Text>}
            </View>)}
          </View>
          <Text style={styles.audienceHint}>Friends use your Friends choice, even if they also live nearby. Neighbors are people in your neighborhoods; Town covers everyone else in your town.</Text>
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
        These settings control push notifications. Your messages and activity stay in the app.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { ...TYPOGRAPHY.title3, color: COLORS.primary, fontWeight: '700', marginBottom: SPACING.sm },
  coreRow: { padding: SPACING.md, gap: SPACING.sm },
  sourceRow: { flexDirection: 'row', gap: SPACING.sm },
  sourceControl: { flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  sourceLabel: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center' },
  audienceHint: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: SPACING.md },
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
    paddingTop: SPACING.md,
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
