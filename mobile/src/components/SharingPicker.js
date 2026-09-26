import React, { useEffect, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import ActionSheet from './ActionSheet';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import { availableSharingAudiences } from '../utils/sharingAudiences';

const audiences = [
  ['close_friends', 'Friends', 'Only people you have accepted as friends.', 'people'],
  ['neighborhood', 'Neighborhood', 'People in your neighborhood can see this item.', 'home'],
  ['town', 'Town', 'People in your town.', 'location'],
];

export default function SharingPicker({ value = ['private'], onChange, request = false, listingType = 'lend',
  neighborhoodAvailable = true, onJoinNeighborhood, onCreateNeighborhood,
  friendsAvailable = true, onInviteFriends, audienceProblem, audienceLoading = false, onRetryAudience }) {
  const [neighborhoodPrompt, setNeighborhoodPrompt] = useState(false);
  const excluded = useRef(new Set());
  // Preserve opt-outs in restored Town posts as well as this editing session.
  useEffect(() => {
    for (const scope of ['close_friends', 'neighborhood']) {
      if (value.includes(scope)) excluded.current.delete(scope);
      else if (value.includes('town')) excluded.current.add(scope);
    }
  }, [value]);
  const townHint = request || ['giveaway', 'sell'].includes(listingType)
    ? 'Town members can see this post, your name, and your profile.'
    : 'People in your town can see this item.';

  const confirm = (scope) => {
    if (value.includes(scope)) {
      const remaining = value.filter(item => item !== scope && item !== 'private');
      if (request && !remaining.length) return;
      excluded.current.add(scope);
      onChange({ visibility: remaining.length ? remaining : ['private'], circleId: null });
      return;
    }
    if (scope === 'neighborhood' && !neighborhoodAvailable) {
      setNeighborhoodPrompt(true);
      return;
    }
    if (scope === 'close_friends' && !friendsAvailable && onInviteFriends) return onInviteFriends();
    excluded.current.delete(scope);
    const additions = scope === 'town'
      ? availableSharingAudiences({ friendsAvailable, neighborhoodAvailable, townAvailable: true })
        .filter(item => !excluded.current.has(item))
      : [scope];
    onChange({ visibility: [...new Set([...value.filter(item => item !== 'private'), ...additions])], circleId: null });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{request ? 'Who can see this post?' : 'Who can see this item?'}</Text>
      <Text style={styles.hint}>{request ? 'Select all that apply.' : 'Select all that apply. Your other items and pickup address stay private.'}</Text>
      {request && audienceProblem && <Text accessibilityRole="alert" style={styles.hint}>
        {audienceLoading ? 'Checking your audience…' : 'Choose who can see your post'}
      </Text>}
      {audiences.map(([scope, title, hint, icon]) => (
        <HapticPressable key={scope} accessibilityRole="checkbox" accessibilityState={{ checked: value.includes(scope) }}
          accessibilityLabel={title} style={[styles.option, value.includes(scope) && styles.selected]}
          onPress={() => confirm(scope)}>
          <Ionicons name={icon} size={24} color={COLORS.primary} />
          <View style={styles.copy}>
            <Text style={styles.label}>{title}</Text>
            <Text style={styles.hint}>{scope === 'close_friends' && !friendsAvailable ? 'Invite a friend to share with them.'
              : scope === 'neighborhood' && !neighborhoodAvailable ? 'Join or create a neighborhood.'
              : scope === 'town' ? townHint : request ? hint.replace('item', 'post') : hint}</Text>
          </View>
          <Ionicons name={value.includes(scope) ? 'checkbox' : 'square-outline'} size={20} color={COLORS.primary} />
        </HapticPressable>
      ))}
      {!request && !audiences.some(([scope]) => value.includes(scope)) && <Text style={styles.hint}>Only you can see this item.</Text>}
      {onRetryAudience && <HapticPressable accessibilityRole="button" onPress={onRetryAudience} style={styles.option}>
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
  label: { ...TYPOGRAPHY.subheadline, fontWeight: '400', color: COLORS.text },
  hint: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
  copy: { flex: 1, gap: 3 },
  option: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md,
    minHeight: 64, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  selected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryMuted },
});
