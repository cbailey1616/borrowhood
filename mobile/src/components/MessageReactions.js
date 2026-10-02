import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import ReactionIcon, { reactionOption } from './ReactionIcon';
import Icon from './Icon';
import { COLORS, TYPOGRAPHY } from '../utils/config';

export default function MessageReactions({ reactions = [], userId, onToggle, onAdd, disabled = false, inline = false, compact = false, touchTarget = false, colors = COLORS }) {
  const groups = new Map();
  reactions.forEach(r => groups.set(r.emoji, [...(groups.get(r.emoji) || []), r.userId]));
  return <View style={[styles.row, inline && styles.inlineRow]}>
    {[...groups].map(([emoji, people]) => <HapticPressable key={emoji} haptic="selection" scaleDown={1} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={`${reactionOption(emoji)?.label || emoji} reaction, ${people.length}`}
      accessibilityState={{ selected: people.includes(userId), disabled }} onPress={() => onToggle(emoji)}
      style={touchTarget ? styles.touchTarget : [styles.pill, compact && styles.compactPill, {borderColor:colors.borderLight,backgroundColor:colors.surfaceElevated}, people.includes(userId) && [styles.selected,{borderColor:colors.primaryLight,backgroundColor:colors.primaryMuted}]]}>
      <View style={touchTarget ? [styles.visualChip, { borderColor: people.includes(userId) ? colors.primaryLight : colors.borderLight, backgroundColor: people.includes(userId) ? colors.primaryMuted : colors.surfaceElevated }] : styles.chipContent}>
      <ReactionIcon emoji={emoji} size={18} overrideColor={colors.primary} />
      <Text maxFontSizeMultiplier={1.4} style={[styles.count,{color:colors.primary}]}>{people.length}</Text>
      </View>
    </HapticPressable>)}
    {!!onAdd && <HapticPressable haptic={null} scaleDown={1} disabled={disabled} accessibilityRole="button" accessibilityLabel="Add reaction"
      onPress={onAdd} style={styles.add}>
      <Icon name="happy-outline" size={22} color={colors.primary} illustrated={false} selected={false} />
    </HapticPressable>}
  </View>;
}
const styles = StyleSheet.create({
  chipContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  touchTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  visualChip: { minWidth: 38, minHeight: 28, paddingHorizontal: 8, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 },
  inlineRow: { marginTop: 0 },
  pill: { minHeight: 36, minWidth: 40, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, opacity: 1,
    borderColor: COLORS.borderLight, backgroundColor: COLORS.surfaceElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  selected: { borderColor: COLORS.primaryLight, backgroundColor: COLORS.primaryMuted },
  compactPill: { minHeight: 32, minWidth: 36, paddingHorizontal: 8 },
  count: { ...TYPOGRAPHY.caption1, color: COLORS.primary },
  add: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: 1 },
});
