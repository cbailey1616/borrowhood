import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { ThemedAlert as Alert } from './ThemedAlert';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const audiences = [
  ['private', 'Only me', 'Hidden from browsing. Private offers are shared separately.', 'lock-closed'],
  ['close_friends', 'Friends', 'Only people you have accepted as friends.', 'people'],
  ['neighborhood', 'Neighborhood', 'People in your neighborhood can see this item.', 'home'],
  ['town', 'Town', 'Verified people in your town can see this item.', 'location'],
];

export default function SharingPicker({ value = ['private'], onChange, verified, onVerify,
  neighborhoodAvailable = true, onJoinNeighborhood }) {
  const [expanded, setExpanded] = useState(false);

  const confirm = (scope) => {
    if (scope === 'private') {
      onChange({ visibility: ['private'], circleId: null });
      setExpanded(false); return;
    }
    if (scope === 'neighborhood' && !neighborhoodAvailable) {
      return Alert.alert('Join your neighborhood first',
        'Once you join, you can share this item with nearby neighbors.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Find my neighborhood', onPress: onJoinNeighborhood },
        ]);
    }
    if (value.includes(scope)) {
      const remaining = value.filter(item => item !== scope && item !== 'private');
      onChange({ visibility: remaining.length ? remaining : ['private'], circleId: null });
      return;
    }
    if (scope === 'town' && !verified) return onVerify?.();
    const label = audiences.find(a => a[0] === scope)[1];
    Alert.alert(`Share this item with ${label}?`,
      'This shares only this item, never your full inventory or pickup address. People who can see it may save screenshots.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use this audience', onPress: () => {
          onChange({ visibility: [...value.filter(item => item !== 'private'), scope], circleId: null });
        } },
      ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who can see this item?</Text>
      <HapticPressable accessibilityRole="button" accessibilityLabel="Change who can see this item" accessibilityState={{ expanded }}
        style={styles.option} onPress={() => setExpanded(!expanded)}>
        <Ionicons name={value.includes('private') ? 'lock-closed' : 'people'} size={24} color={COLORS.primary} />
        <View style={styles.copy}><Text style={styles.label}>{value.includes('private') ? 'Only me' : `Visible to ${value.map(scope => audiences.find(a => a[0] === scope)?.[1] || 'Sharing needs review').join(' and ')}`}</Text>
          <Text style={styles.hint}>Sharing this item never shares the rest.</Text></View>
        <Text style={{ color: COLORS.primary }}>{expanded ? 'Done' : 'Change'}</Text>
      </HapticPressable>
      {expanded && audiences.map(([scope, title, hint, icon]) => (
        <HapticPressable key={scope} accessibilityRole="checkbox" accessibilityState={{ checked: value.includes(scope) }}
          accessibilityLabel={title} style={[styles.option, value.includes(scope) && styles.selected]}
          onPress={() => confirm(scope)}>
          <Ionicons name={icon} size={24} color={COLORS.primary} />
          <View style={styles.copy}>
            <Text style={styles.label}>{title}</Text>
            <Text style={styles.hint}>{hint}</Text>
          </View>
          {value.includes(scope) && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
        </HapticPressable>
      ))}
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
