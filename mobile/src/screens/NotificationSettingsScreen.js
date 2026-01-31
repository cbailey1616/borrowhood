import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import api from '../services/api';
import { COLORS } from '../utils/config';

const NOTIFICATION_SETTINGS = [
  {
    category: 'Borrowing',
    settings: [
      { key: 'borrow_request', label: 'Borrow Requests', description: 'When someone wants to borrow your item' },
      { key: 'request_response', label: 'Request Responses', description: 'When your borrow request is approved or declined' },
      { key: 'return_reminder', label: 'Return Reminders', description: 'Reminders before items are due back' },
    ],
  },
  {
    category: 'Transactions',
    settings: [
      { key: 'payment_updates', label: 'Payment Updates', description: 'Payment confirmations and receipts' },
      { key: 'pickup_return', label: 'Pickup & Return', description: 'When items are picked up or returned' },
      { key: 'rating_received', label: 'Ratings', description: 'When you receive a new rating' },
    ],
  },
  {
    category: 'Community',
    settings: [
      { key: 'new_message', label: 'Messages', description: 'New messages from other users' },
      { key: 'item_match', label: 'Item Matches', description: 'When someone lists an item you requested' },
      { key: 'community_updates', label: 'Community Updates', description: 'News and updates from your community' },
    ],
  },
  {
    category: 'Push Notifications',
    settings: [
      { key: 'push_enabled', label: 'Enable Push Notifications', description: 'Receive notifications on your device' },
      { key: 'push_sound', label: 'Notification Sound', description: 'Play sound for notifications' },
    ],
  },
];

export default function NotificationSettingsScreen() {
  const [preferences, setPreferences] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const data = await api.getNotificationPreferences?.() || getDefaultPreferences();
      setPreferences(data);
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
      setPreferences(getDefaultPreferences());
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
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);

    try {
      setIsSaving(true);
      await api.updateNotificationPreferences({ [key]: value });
    } catch (error) {
      // Revert on error
      setPreferences(preferences);
      Alert.alert('Error', 'Failed to update notification settings');
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
      {NOTIFICATION_SETTINGS.map((category, index) => (
        <View key={category.category} style={styles.section}>
          <Text style={styles.sectionTitle}>{category.category}</Text>
          <View style={styles.settingsGroup}>
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
                  value={preferences[setting.key] ?? true}
                  onValueChange={(value) => handleToggle(setting.key, value)}
                  trackColor={{ false: COLORS.gray[700], true: COLORS.primary + '60' }}
                  thumbColor={preferences[setting.key] ? COLORS.primary : COLORS.gray[400]}
                  ios_backgroundColor={COLORS.gray[700]}
                />
              </View>
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.footerText}>
        You can also manage notification permissions in your device settings.
      </Text>
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
    padding: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  settingsGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  settingDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  footerText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    padding: 24,
    paddingTop: 8,
  },
});
