import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, CARD_SURFACE } from '../utils/config';
export const TOWN_PREVIEW_COPY = 'Browse Town borrow listings. Get verified to see who’s lending.';
export default function TownIdentityPrompt({ compact = false, onVerify }) {
  return <HapticPressable accessibilityRole="button" accessibilityLabel="Identity hidden. Get verified to see who’s sharing"
    onPress={event => { event?.stopPropagation?.(); onVerify(); }} style={compact ? styles.compact : styles.card}>
    <Ionicons name="shield-checkmark" size={22} color={COLORS.primary} />
    <View style={styles.copy}>
      <Text style={compact ? styles.caption : styles.title}>{compact ? 'Identity hidden · Get verified' : 'See who’s sharing'}</Text>
      {!compact && <><Text style={styles.body}>{TOWN_PREVIEW_COPY}</Text><Text maxFontSizeMultiplier={1.4} style={styles.link}>Get verified</Text></>}
    </View>
  </HapticPressable>;
}
const styles = StyleSheet.create({
  compact: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  card: { ...CARD_SURFACE, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryMuted },
  copy: { flex: 1, gap: SPACING.sm },
  title: { ...TYPOGRAPHY.headline, color: COLORS.text },
  caption: { ...TYPOGRAPHY.caption1, color: COLORS.primary },
  body: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  link: { ...TYPOGRAPHY.buttonSmall, color: COLORS.primary },
});
