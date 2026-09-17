import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import HapticPressable from './HapticPressable';
import ShimmerImage from './ShimmerImage';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function ConversationContextCard({ title, label, photoUrl, icon = 'basket', quote, onPress, accessibilityLabel }) {
  return <HapticPressable style={styles.card} onPress={onPress} accessibilityLabel={accessibilityLabel || `View ${title}`}>
    {photoUrl ? <ShimmerImage source={{ uri: photoUrl }} style={styles.thumbnail} />
      : <View style={styles.thumbnail}><Ionicons name={icon} size={26} color={COLORS.primary} illustrated /></View>}
    <View style={styles.copy}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      {!!quote && <Text style={styles.quote} numberOfLines={2}>Replying to: “{quote}”</Text>}
    </View>
    <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
  </HapticPressable>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, marginHorizontal: SPACING.lg, marginTop: SPACING.xs, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg },
  thumbnail: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  label: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
  title: { ...TYPOGRAPHY.subheadline, color: COLORS.text },
  quote: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, marginTop: SPACING.xs },
});
