import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import ReactionIcon, { reactionOption } from './ReactionIcon';
import { Ionicons } from './Icon';
import { COLORS, TYPOGRAPHY } from '../utils/config';

export default function MessageReactions({ reactions = [], userId, onToggle, onAdd, disabled = false }) {
  const groups = new Map();
  reactions.forEach(r => groups.set(r.emoji, [...(groups.get(r.emoji) || []), r.userId]));
  return <View style={styles.row}>
    {[...groups].map(([emoji, people]) => <HapticPressable key={emoji} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={`${reactionOption(emoji)?.label || emoji} reaction, ${people.length}`}
      accessibilityState={{ selected: people.includes(userId), disabled }} onPress={() => onToggle(emoji)}
      style={[styles.pill, people.includes(userId) && styles.selected]}>
      <ReactionIcon emoji={emoji} size={18} />
      {people.length > 1 && <Text style={styles.count}>{people.length}</Text>}
    </HapticPressable>)}
    {!!onAdd && <HapticPressable disabled={disabled} accessibilityRole="button" accessibilityLabel="Add reaction"
      onPress={onAdd} style={styles.add}>
      <Ionicons name="sparkles" size={18} color={COLORS.primary} illustrated />
      <Text style={styles.addLabel}>React</Text>
    </HapticPressable>}
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 },
  pill: { minHeight: 36, minWidth: 40, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1,
    borderColor: COLORS.borderLight, backgroundColor: COLORS.surfaceElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  selected: { borderColor: COLORS.primaryLight, backgroundColor: COLORS.primaryMuted },
  count: { ...TYPOGRAPHY.caption1, color: COLORS.primary },
  add: { minHeight: 36, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addLabel: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
});
