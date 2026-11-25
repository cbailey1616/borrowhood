import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function ExchangeOverviewLink({ onPress, count, needsYou = 0, testID }) {
  const summary = typeof count === 'number' ? needsYou ? `${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you` : `${count} active` : null;
  return <HapticPressable testID={testID} onPress={onPress} style={styles.shortcut}
    pressedBackgroundColor={COLORS.cardHover}
    accessibilityRole="button" accessibilityLabel={`Your exchanges${summary ? `. ${summary}` : ''}`}>
    <Ionicons name="handshake-outline" size={18} color={COLORS.primary} />
    <View style={styles.inlineText}>
      <Text style={styles.title}>Your exchanges</Text>
      {!!summary && <Text style={styles.summary}>{summary}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={15} color={COLORS.primary} />
  </HapticPressable>;
}

const styles = StyleSheet.create({
  shortcut: {
    minHeight: 48, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md,
    backgroundColor: COLORS.primaryMuted, borderRadius: RADIUS.md,
  },
  inlineText: {
    flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'space-between', columnGap: SPACING.sm, rowGap: SPACING.xs,
  },
  title: { ...TYPOGRAPHY.subheadline, flexShrink: 1, color: COLORS.primary, fontWeight: '600', fontFamily: 'DMSans_600SemiBold' },
  summary: { ...TYPOGRAPHY.footnote, flexShrink: 1, color: COLORS.textSecondary },
});
