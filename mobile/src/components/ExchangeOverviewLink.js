import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function ExchangeOverviewLink({ onPress, count, needsYou = 0, testID, style }) {
  const summary = typeof count === 'number' ? needsYou ? `${needsYou} need you` : `${count} active` : null;
  return <HapticPressable testID={testID} onPress={onPress} style={[styles.row, style]}
    accessibilityRole="button" accessibilityLabel={`Your exchanges${summary ? `. ${summary}` : ''}`}>
    <Ionicons name="handshake-outline" illustrated size={28} color={COLORS.primary} />
    <View style={styles.text}>
      <Text style={styles.title}>Your exchanges</Text>
      {!!summary && <Text style={styles.summary}>{summary}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
  </HapticPressable>;
}

const styles = StyleSheet.create({
  row: { minHeight: 56, paddingVertical: SPACING.sm, gap: SPACING.md, flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.separator },
  text: { flex: 1, minWidth: 0 },
  title: { ...TYPOGRAPHY.headline, color: COLORS.primary },
  summary: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
