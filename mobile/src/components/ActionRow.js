import { View, Text, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY, CARD_SURFACE } from '../utils/config';

// Navigation and expanded choices have a visible surface, icon and chevron.
export default function ActionRow({ label, description, icon, onPress, variant = 'secondary',
  disabled = false, style, accessibilityLabel, accessibilityState, ...props }) {
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const color = primary ? COLORS.surface : danger ? COLORS.danger : COLORS.primary;
  return <HapticPressable {...props} onPress={onPress} disabled={disabled}
    accessibilityLabel={accessibilityLabel || label}
    accessibilityState={{ ...accessibilityState, disabled }}
    style={[styles.row, primary && styles.primary, danger && styles.danger, style]}>
    {icon && <View style={[styles.icon, primary && styles.primaryIcon, danger && styles.dangerIcon]}>
      <Ionicons name={icon} size={24} color={color} illustrated={false} />
    </View>}
    <View style={styles.copy}>
      <Text maxFontSizeMultiplier={1.4} style={[styles.label, { color }]}>{label}</Text>
      {!!description && <Text style={[styles.description, primary && { color: COLORS.greenText }]}>{description}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={20} color={color} illustrated={false} />
  </HapticPressable>;
}

const styles = StyleSheet.create({
  row: { ...CARD_SURFACE, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface,
  },
  primary: { backgroundColor: COLORS.primary },
  danger: { borderWidth: 1, borderColor: COLORS.dangerMuted },
  icon: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryIcon: { backgroundColor: COLORS.parchmentTint },
  dangerIcon: { backgroundColor: COLORS.dangerMuted },
  copy: { flex: 1, minWidth: 0, gap: SPACING.xs },
  label: { ...TYPOGRAPHY.headline },
  description: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
