import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Icon from './Icon';
import { COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

const capabilities = [
  { label: 'Borrow from friends', withoutId: true },
  { label: 'Borrow in your neighborhood', withoutId: true },
  { label: 'Borrow across town', withoutId: false },
  { label: 'Buy items or claim giveaways', withoutId: true },
  { label: 'Post requests', withoutId: true },
];

export default function VerificationComparison() {
  const { fontScale = 1 } = useWindowDimensions();
  const largeText = fontScale >= 1.4;

  return (
    <View style={styles.card}>
      {!largeText && (
        <View style={styles.header} accessible accessibilityLabel="Compare without ID verification and verified">
          <Text style={[styles.heading, styles.activity]}>You can…</Text>
          <Text style={[styles.heading, styles.column]}>Without ID</Text>
          <Text style={[styles.heading, styles.column, styles.verifiedHeading]}>Verified</Text>
        </View>
      )}
      {capabilities.map(({ label, withoutId }) => (
        <View
          key={label}
          accessible
          accessibilityLabel={`${label}. Without ID verification: ${withoutId ? 'available' : 'not available'}. Verified: available.`}
          style={[styles.row, !withoutId && styles.townRow, largeText && styles.stacked]}
        >
          <Text style={[styles.label, !largeText && styles.activity, !withoutId && styles.emphasis]}>{label}</Text>
          {largeText ? (
            <Text style={styles.detail}>Without ID: {withoutId ? 'Yes' : 'No'}{'\n'}Verified: Yes</Text>
          ) : (
            <>
              <View style={styles.column}>
                <Icon name={withoutId ? 'checkmark' : 'remove'} size={22} color={withoutId ? COLORS.primary : COLORS.textMuted} />
              </View>
              <View style={styles.column}>
                <View style={[styles.check, !withoutId && styles.townCheck]}>
                  <Icon name="checkmark" size={22} color={!withoutId ? COLORS.surface : COLORS.primary} />
                </View>
              </View>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  heading: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
  verifiedHeading: { color: COLORS.primary, fontFamily: TYPOGRAPHY.headline.fontFamily, fontWeight: '600' },
  activity: { flex: 1, paddingRight: 8 },
  column: { width: '24%', textAlign: 'center', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight },
  label: { ...TYPOGRAPHY.bodySmall, color: COLORS.text },
  townRow: { backgroundColor: COLORS.primaryMuted },
  emphasis: { color: COLORS.primary, fontFamily: TYPOGRAPHY.headline.fontFamily, fontWeight: '600' },
  check: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  townCheck: { backgroundColor: COLORS.primary },
  stacked: { alignItems: 'flex-start', flexDirection: 'column', gap: 8, paddingVertical: 16 },
  detail: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
