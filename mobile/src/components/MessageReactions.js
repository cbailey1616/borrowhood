import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import ReactionIcon, { reactionOption } from './ReactionIcon';
import Icon from './Icon';
import { COLORS, TYPOGRAPHY } from '../utils/config';

export default function MessageReactions({ reactions = [], userId, onToggle, onAdd, disabled = false, inline = false }) {
  const groups = new Map();
  reactions.forEach(r => groups.set(r.emoji, [...(groups.get(r.emoji) || []), r.userId]));
  return <View style={[styles.row, inline && styles.inlineRow]}>
    {[...groups].map(([emoji, people]) => <HapticPressable key={emoji} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={`${reactionOption(emoji)?.label || emoji} reaction, ${people.length}`}
      accessibilityState={{ selected: people.includes(userId), disabled }} onPress={() => onToggle(emoji)}
      style={[styles.pill, people.includes(userId) && styles.selected]}>
      <ReactionIcon emoji={emoji} size={18} />
      {people.length > 1 && <Text style={styles.count}>{people.length}</Text>}
    </HapticPressable>)}
    {!!onAdd && <HapticPressable disabled={disabled} accessibilityRole="button" accessibilityLabel="Add reaction"
      onPress={onAdd} style={styles.add}>
      <View style={styles.addDisc}><Icon name="reaction-add" size={25} color={COLORS.surface} illustrated={false} /></View>
    </HapticPressable>}
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 },
  inlineRow: { marginTop: 0 },
  pill: { minHeight: 36, minWidth: 40, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1,
    borderColor: COLORS.borderLight, backgroundColor: COLORS.surfaceElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  selected: { borderColor: COLORS.primaryLight, backgroundColor: COLORS.primaryMuted },
  count: { ...TYPOGRAPHY.caption1, color: COLORS.primary },
  add: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addDisc: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
});
