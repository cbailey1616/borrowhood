import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const CORE_SETTINGS = [
  { key: 'new_item_requests', label: 'Item requests', columnLabel: 'Items' },
  { key: 'new_service_requests', label: 'Service requests', columnLabel: 'Services' },
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
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.4;
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
          <View style={[styles.cardBox, styles.settingsGroup]}>
            {!largeText && <View style={[styles.audienceHeader, styles.settingRowBorder]}>
              <Text style={[styles.columnLabel, styles.settingInfo]}>From</Text>
              {CORE_SETTINGS.map(setting => <View key={setting.key} style={styles.switchColumn}>
                <Text style={styles.columnLabel}>{setting.columnLabel}</Text>
              </View>)}
            </View>}
            {SOURCES.map((source, index) => <View key={source.key} style={[styles.audienceRow, largeText && styles.audienceRowLarge, index < SOURCES.length - 1 && styles.settingRowBorder]}>
              <Text style={[styles.settingLabel, styles.settingInfo, largeText && styles.audienceLabelLarge]}>{source.label}</Text>
              {CORE_SETTINGS.map(setting => <View key={setting.key} style={[styles.switchColumn, largeText && styles.switchColumnLarge]}>
                {largeText && <Text style={styles.columnLabel}>{setting.columnLabel}</Text>}
                <Switch accessibilityLabel={`${setting.label}: ${source.label}`}
                  accessibilityState={{ disabled: childDisabled }} disabled={childDisabled}
                  value={sourceEnabled(setting.key, source.key)}
                  onValueChange={value => toggleSource(setting.key, source.key, value)}
                  trackColor={{ false: COLORS.primaryMuted, true: COLORS.primary }}
                  thumbColor="#fff" ios_backgroundColor={COLORS.primaryMuted} />
              </View>)}
            </View>)}
          </View>
          {CORE_SETTINGS.some(setting => saveError === setting.key) && <Text accessibilityRole="alert" style={styles.settingDescription}>Couldn’t save that change. Please try again.</Text>}
          <Text style={styles.audienceHint}>Friends use your Friends setting. Town covers people outside your friends and neighborhoods.</Text>
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
  audienceHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm, backgroundColor: COLORS.cardHover,
  },
  audienceRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm, minHeight: 56,
  },
  switchColumn: { width: '27%', minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  audienceRowLarge: { flexWrap: 'wrap', paddingVertical: SPACING.md, rowGap: SPACING.md },
  audienceLabelLarge: { flex: 0, width: '100%' },
  switchColumnLarge: { width: '50%', gap: SPACING.sm },
  columnLabel: { ...TYPOGRAPHY.footnote, fontFamily: 'DMSans_500Medium', fontWeight: '500', color: COLORS.textSecondary },
  audienceHint: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, marginTop: SPACING.sm },
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
    paddingVertical: 10,
    minHeight: 52,
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
