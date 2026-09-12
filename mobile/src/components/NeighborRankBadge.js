import { Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import HapticPressable from './HapticPressable';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function NeighborRankBadge({ rank, showName = false, onPress, accessibilityLabel }) {
  if (!rank) return null;

  return <HapticPressable
    style={[styles.button, showName && styles.namedButton]}
    accessibilityLabel={accessibilityLabel || `Neighbor rank: ${rank.label}`}
    accessibilityHint="Opens rating details and rank levels"
    onPress={event => { event?.stopPropagation?.(); onPress?.(); }}
  >
    <Ionicons name={rank.icon} size={24} illustrated color={COLORS.primary} />
    {showName && <Text style={styles.name}>{rank.label}</Text>}
  </HapticPressable>;
}

const styles = StyleSheet.create({
  // Keep the icon next to the identity marks; retain the full tap area to its right.
  button: { width: 44, minHeight: 44, flexShrink: 0, alignItems: 'flex-start', justifyContent: 'center' },
  namedButton: { alignItems: 'center', width: 'auto', maxWidth: '45%', minHeight: 48, flexDirection: 'row', gap: SPACING.xs, paddingHorizontal: SPACING.xs, paddingVertical: SPACING.xs, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  name: { ...TYPOGRAPHY.footnote, fontWeight: '600', color: COLORS.primary, flexShrink: 1 },
});
