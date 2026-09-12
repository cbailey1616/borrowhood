import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import HapticPressable from './HapticPressable';
import { COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

// Explicit actions have a visible boundary; informational text stays plain.
export default function ActionButton({ label, onPress, disabled = false, loading = false,
  destructive = false, style, accessibilityLabel, accessibilityState, ...props }) {
  const color = destructive ? COLORS.danger : COLORS.primary;
  return <HapticPressable {...props} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label}
    accessibilityState={{ ...accessibilityState, disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} onPress={onPress}
    style={[styles.button, { borderColor: color }, style, (disabled || loading) && styles.disabled]}>
    {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.label, { color }]}>{label}</Text>}
  </HapticPressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1,
    borderRadius: RADIUS.md, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  label: { ...TYPOGRAPHY.subheadline, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  disabled: { opacity: 0.5 },
});
