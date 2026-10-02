import { View, Text, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

// A grouped-list row: the surrounding section owns the card surface.
export default function ActionRow({ label, description, icon, onPress, variant = 'secondary',
  disabled = false, isLast = false, style, accessibilityLabel, accessibilityState, ...props }) {
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const color = primary ? COLORS.surface : danger ? COLORS.danger : COLORS.primary;
  return <HapticPressable scaleDown={1} pressedBackgroundColor={primary ? COLORS.primaryDark : COLORS.cardHover} {...props} onPress={onPress} disabled={disabled}
    accessibilityLabel={accessibilityLabel || label}
    accessibilityState={{ ...accessibilityState, disabled }}
    style={[styles.row, primary && styles.primary, style]}>
    {icon && <Ionicons name={icon} size={22} color={color} />}
    <View style={styles.copy}>
      <Text maxFontSizeMultiplier={1.4} style={[styles.label, { color }]}>{label}</Text>
      {!!description && <Text style={[styles.description, primary && { color: COLORS.greenText }]}>{description}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={18} color={color} illustrated={false} />
    {!isLast && <View pointerEvents="none" style={[styles.separator, !icon && styles.separatorWithoutIcon]} />}
  </HapticPressable>;
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.lg, backgroundColor: COLORS.surface },
  primary: { backgroundColor: COLORS.primary },
  copy: { flex: 1, minWidth: 0, gap: SPACING.xs },
  label: { ...TYPOGRAPHY.headline },
  description: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  separator: { position: 'absolute', bottom: 0, left: SPACING.lg + 22 + SPACING.md,
    right: 0, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  separatorWithoutIcon: { left: SPACING.lg },
});
