import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import ActionSheet from './ActionSheet';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const audiences = [
  ['private', 'Only me', 'Hidden from browsing. Private offers are shared separately.', 'lock-closed'],
  ['close_friends', 'Friends', 'Only people you have accepted as friends.', 'people'],
  ['neighborhood', 'Neighborhood', 'People in your neighborhood can see this item.', 'home'],
  ['town', 'Town', 'People in your town.', 'location'],
];

export default function SharingPicker({ value = ['private'], onChange, request = false, listingType = 'lend',
  neighborhoodAvailable = true, onJoinNeighborhood, onCreateNeighborhood,
  friendsAvailable = true, onInviteFriends, audienceProblem, audienceLoading = false, onRetryAudience }) {
  const [expanded, setExpanded] = useState(false);
  const [neighborhoodPrompt, setNeighborhoodPrompt] = useState(false);
  const townHint = request || ['giveaway', 'sell'].includes(listingType)
    ? 'Town members can see this post, your name, and your profile.'
    : 'Town members can preview this borrow listing. Your name and profile are hidden from unverified Town viewers.';

  const confirm = (scope) => {
    if (scope === 'private') {
      onChange({ visibility: ['private'], circleId: null });
      setExpanded(false); return;
    }
    if (scope === 'neighborhood' && !neighborhoodAvailable) {
      setNeighborhoodPrompt(true);
      return;
    }
    if (scope === 'close_friends' && !friendsAvailable && onInviteFriends) return onInviteFriends();
    if (value.includes(scope)) {
      const remaining = value.filter(item => item !== scope && item !== 'private');
      if (request && !remaining.length) return;
      onChange({ visibility: remaining.length ? remaining : ['private'], circleId: null });
      return;
    }
    onChange({ visibility: [...value.filter(item => item !== 'private'), scope], circleId: null });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{request ? 'Who can see this request?' : 'Who can see this item?'}</Text>
      {!request && <Text style={styles.hint}>Select all that apply. Only this item is shared—not your inventory or pickup address. People who can see it may save screenshots.</Text>}
      <HapticPressable accessibilityRole="button" accessibilityLabel={request ? 'Change who can see this request' : 'Change who can see this item'} accessibilityState={{ expanded }}
        style={styles.option} onPress={() => setExpanded(!expanded)}>
        <Ionicons name={value.includes('private') ? 'lock-closed' : 'people'} size={24} color={COLORS.primary} />
        <View style={styles.copy}><Text style={styles.label}>{request && audienceProblem
          ? audienceLoading ? 'Checking your audience…' : 'Choose who can see your request'
          : value.includes('private') ? 'Only me' : `Visible to ${value.map(scope => audiences.find(a => a[0] === scope)?.[1] || 'Sharing needs review').join(' and ')}`}</Text>
          {!request && <Text style={styles.hint}>Sharing this item never shares the rest.</Text>}</View>
        <Text style={{ color: COLORS.primary }}>{expanded ? 'Done' : 'Change'}</Text>
      </HapticPressable>
      {value.includes('town') && <Text style={styles.hint}>{townHint}</Text>}
      {expanded && audiences.filter(([scope]) => !request || scope !== 'private').map(([scope, title, hint, icon]) => (
        <HapticPressable key={scope} accessibilityRole="checkbox" accessibilityState={{ checked: value.includes(scope) }}
          accessibilityLabel={title} style={[styles.option, value.includes(scope) && styles.selected]}
          onPress={() => confirm(scope)}>
          <Ionicons name={icon} size={24} color={COLORS.primary} />
          <View style={styles.copy}>
            <Text style={styles.label}>{title}</Text>
            <Text style={styles.hint}>{scope === 'close_friends' && !friendsAvailable ? 'Invite a friend to share with them.'
              : scope === 'neighborhood' && !neighborhoodAvailable ? 'Join or create a neighborhood.'
              : scope === 'town' ? townHint : request ? hint.replace('item', 'request') : hint}</Text>
          </View>
          <Ionicons name={value.includes(scope) ? 'checkbox' : 'square-outline'} size={20} color={COLORS.primary} />
        </HapticPressable>
      ))}
      {expanded && onRetryAudience && <HapticPressable accessibilityRole="button" onPress={onRetryAudience} style={styles.option}>
        <Text style={styles.label}>Couldn’t check friends. Try again</Text>
      </HapticPressable>}
      <ActionSheet isVisible={neighborhoodPrompt} onClose={() => setNeighborhoodPrompt(false)}
        title="Find your neighborhood" message="Join neighbors nearby, or start a neighborhood of your own. Your draft will be here when you return."
        cancelLabel="Not now" actions={[
          { label: 'Join a neighborhood', icon: <Ionicons name="home-outline" size={24} />, onPress: onJoinNeighborhood },
          { label: 'Create a neighborhood', icon: <Ionicons name="people-outline" size={24} />, onPress: onCreateNeighborhood || onJoinNeighborhood },
        ]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.sm },
  title: { ...TYPOGRAPHY.headline, color: COLORS.text },
  label: { ...TYPOGRAPHY.subheadline, fontWeight: '600', color: COLORS.text },
  hint: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
  copy: { flex: 1, gap: 3 },
  option: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md,
    minHeight: 64, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  selected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryMuted },
});
