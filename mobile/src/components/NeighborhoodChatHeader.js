import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from './HapticPressable';
import Icon from './Icon';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

// A single bar owns the group identity and both navigation controls.
export default function NeighborhoodChatHeader({ name, memberCount, muted, thread, onBack, onOptions }) {
  const insets = useSafeAreaInsets();
  const count = Number.isInteger(memberCount) && memberCount >= 0
    ? `${memberCount} ${memberCount === 1 ? 'neighbor' : 'neighbors'}` : 'Your neighbors';
  const subtitle = [count, thread ? 'Replies' : muted ? 'Muted' : null].filter(Boolean).join(' · ');
  return <View style={[styles.header, { paddingTop: insets.top, paddingLeft: Math.max(insets.left, SPACING.lg), paddingRight: Math.max(insets.right, SPACING.lg) }]}>
    <View style={styles.row}>
      <HapticPressable haptic={null} scaleDown={1} onPress={onBack} style={styles.back}
        accessibilityRole="button" accessibilityLabel={thread ? 'Back to neighborhood chat' : 'Back'}>
        <Icon name="chevron-back" size={22} color={COLORS.primary} illustrated={false} />
      </HapticPressable>
      <View style={styles.identity}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} numberOfLines={1} style={styles.title}>{name || 'Your neighborhood'}</Text>
        <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
      </View>
      <HapticPressable haptic={null} scaleDown={1} onPress={onOptions} style={styles.more}
        pressedBackgroundColor={COLORS.cardHover} accessibilityRole="button" accessibilityLabel="Chat options">
        <Icon name="ellipsis-horizontal" size={22} color={COLORS.primary} illustrated={false} />
      </HapticPressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.separator },
  row: { minHeight: 68, paddingVertical: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  more: { width: 44, height: 44, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...TYPOGRAPHY.headline, color: COLORS.text },
  subtitle: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
