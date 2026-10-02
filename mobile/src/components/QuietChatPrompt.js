import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import HapticPressable from './HapticPressable';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

export const CHAT_STARTERS = ['Hi, neighbors! 👋', 'Anyone up for a walk?'];
export default function QuietChatPrompt({ onChoose }) {
  return <View style={styles.prompt}>
    <Text style={styles.title}>Say hi to your neighbors 👋</Text>
    <View style={styles.chips}>{CHAT_STARTERS.map(message => <HapticPressable key={message}
      haptic="selection" scaleDown={1} onPress={() => onChoose(message)} style={styles.chip}
      pressedBackgroundColor={COLORS.primaryMuted} accessibilityRole="button" accessibilityLabel={`Use starter: ${message}`}>
      <Text maxFontSizeMultiplier={1.4} style={styles.label}>{message}</Text>
    </HapticPressable>)}</View>
  </View>;
}
const styles = StyleSheet.create({
  prompt: { minHeight: 164, paddingVertical: SPACING.lg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.sm },
  chip: { minHeight: 44, minWidth: 44, paddingVertical: 12, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: RADIUS.full, justifyContent: 'center' },
  label: { ...TYPOGRAPHY.buttonCaption, color: COLORS.primary },
});
