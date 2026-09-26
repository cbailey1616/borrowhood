import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import LayeredCard from '../components/LayeredCard';
import ActionButton from '../components/ActionButton';
import { GroupedListItem, GroupedListSection } from '../components/GroupedList';
import { useError } from '../context/ErrorContext';
import { BASE_URL, COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function PrivacySafetyScreen({ navigation }) {
  const [expandedId, setExpandedId] = useState(null);
  const insets = useSafeAreaInsets();
  const { showError } = useError();

  const openLink = async (url, title, message = 'Please try again in a moment.') => {
    try {
      await Linking.openURL(url);
    } catch {
      showError({ type: 'generic', title, message });
    }
  };

  const sections = [
    {
      id: 'sharing',
      icon: 'people-outline',
      tint: COLORS.primaryMuted,
      title: 'Who sees your posts',
      summary: 'Choose who you share with.',
      detail: 'Choose friends, your neighborhood or your town when you post. Leave all three unchecked to keep an item private. Sharing one item doesn’t share the rest of your inventory. You can change the audience when you edit a post.',
      action: 'Manage my posts',
      onPress: () => navigation.navigate('Main', { screen: 'MyItems' }),
    },
    {
      id: 'identity',
      icon: 'shield-checkmark-outline',
      tint: COLORS.warningMuted,
      title: 'Identity verification',
      summary: 'Know what the badge means.',
      detail: 'Identity checks are handled by Stripe. A verified badge means someone has completed identity verification. You can check your own verification status here.',
      action: 'View verification',
      onPress: () => navigation.navigate('IdentityVerification', { source: 'generic' }),
    },
    {
      id: 'messages',
      icon: 'chatbubble-outline',
      tint: COLORS.infoMuted,
      title: 'Private messages',
      summary: 'Chat at your own pace. No read receipts.',
      detail: 'Direct messages are separate from comments on a post. Comments are visible to people who can view that post. We don’t show other people when you’ve read a message.',
      action: 'Open messages',
      onPress: () => navigation.navigate('Main', { screen: 'Activity', params: { tab: 'messages' } }),
    },
    {
      id: 'safety',
      icon: 'flag-outline',
      tint: COLORS.accentMuted,
      title: 'Report or block',
      summary: 'A little space when you need it.',
      detail: 'Open someone’s profile to report a concern or block them. You can get there by tapping their picture in a conversation. Blocking stops new messages between you. Reports are reviewed privately.',
    },
    {
      id: 'notifications',
      icon: 'notifications-outline',
      tint: COLORS.warningMuted,
      title: 'Your notifications',
      summary: 'Choose what you hear about.',
      detail: 'Choose updates about messages, exchanges, comments and your neighborhood. You can turn push notifications off and still find messages and activity in the app.',
      action: 'Notification settings',
      onPress: () => navigation.navigate('NotificationSettings'),
    },
    {
      id: 'account',
      icon: 'person-outline',
      tint: COLORS.primaryMuted,
      title: 'Your account',
      summary: 'Your profile. Your choice.',
      detail: 'You can edit your profile or delete your account from Profile. Deleting your account removes your profile from view. Some records may be kept to resolve exchanges or disputes. See the Privacy Policy for details.',
      action: 'Open Profile',
      onPress: () => navigation.navigate('Main', { screen: 'Profile' }),
    },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl }]}
    >
      <View style={styles.welcome}>
        <View style={styles.heroIcon}>
          <Ionicons name="shield-checkmark-outline" size={42} illustrated />
        </View>
        <Text accessibilityRole="header" style={styles.welcomeTitle}>You’re in control.</Text>
        <Text style={styles.welcomeCopy}>A little peace of mind for sharing with neighbors.</Text>
      </View>

      <View style={styles.sections}>
        {sections.map(section => {
          const expanded = expandedId === section.id;
          return (
            <LayeredCard key={section.id}>
              <HapticPressable
                onPress={() => setExpandedId(expanded ? null : section.id)}
                accessibilityLabel={`${section.title}. ${section.summary}`}
                accessibilityState={{ expanded }}
                aria-expanded={expanded}
                testID={`PrivacySafety.${section.id}`}
                style={styles.sectionHeader}
              >
                <View style={[styles.iconTile, { backgroundColor: section.tint }]}>
                  <Ionicons name={section.icon} size={27} illustrated />
                </View>
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionSummary}>{section.summary}</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.primary} />
              </HapticPressable>
              {expanded && (
                <View style={styles.details}>
                  <Text style={styles.detailText}>{section.detail}</Text>
                  {section.action && <ActionButton label={section.action} onPress={section.onPress} style={styles.action} />}
                </View>
              )}
            </LayeredCard>
          );
        })}
      </View>

      <GroupedListSection header="Policies & support">
        <GroupedListItem
          icon="lock-closed-outline"
          title="Privacy Policy"
          onPress={() => openLink(`${BASE_URL}/privacy`, 'Couldn’t open the Privacy Policy')}
        />
        <GroupedListItem
          icon="document-text-outline"
          title="Terms of Service"
          onPress={() => openLink(`${BASE_URL}/terms`, 'Couldn’t open the Terms of Service')}
        />
        <GroupedListItem
          icon="help-circle-outline"
          title="Contact support"
          onPress={() => openLink('mailto:chris@borrowhood.net', 'Couldn’t open your email app', 'You can email us at chris@borrowhood.net.')}
        />
      </GroupedListSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.xl },
  welcome: { backgroundColor: COLORS.primaryMuted, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
  heroIcon: { width: 64, height: 64, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xs },
  welcomeTitle: { ...TYPOGRAPHY.h1, color: COLORS.primary, textAlign: 'center' },
  welcomeCopy: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary, textAlign: 'center', maxWidth: 280 },
  sections: { gap: SPACING.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, gap: SPACING.md },
  iconTile: { width: 46, height: 46, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, gap: SPACING.xs },
  sectionTitle: { ...TYPOGRAPHY.headline, color: COLORS.text },
  sectionSummary: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  details: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.lg },
  detailText: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary },
  action: { backgroundColor: COLORS.primaryMuted, borderColor: 'transparent' },
});
