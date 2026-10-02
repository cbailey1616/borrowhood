import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Icon from './Icon';
import { COLORS, RADIUS, TYPOGRAPHY, CARD_SURFACE } from '../utils/config';

const capabilities = [
  { label: 'Borrow from friends and neighbors', before: 'Yes' },
  { label: 'Buy items or claim giveaways', before: 'Yes' },
  { label: 'Post Wanted requests', before: 'Yes' },
  { label: 'Browse Town borrowing', before: 'Preview' },
  { label: 'Borrow across Town', before: 'No' },
  { label: 'Have a verified badge', before: 'No' },
];

export default function VerificationComparison() {
  const { fontScale = 1, width } = useWindowDimensions();
  const largeText = fontScale >= 1.4 || width < 350;
  return <>
    <View style={styles.card}>
      {!largeText && <View style={styles.header} accessible accessibilityLabel="Compare not verified and verified">
        <Text maxFontSizeMultiplier={1.4} style={[styles.heading, styles.activity]}>You can…</Text>
        <Text maxFontSizeMultiplier={1.4} style={[styles.heading, styles.column]}>Not verified</Text>
        <Text maxFontSizeMultiplier={1.4} style={[styles.heading, styles.column, styles.verifiedHeading]}>Verified</Text>
      </View>}
      {capabilities.map(({ label, before }) => <View key={label} accessible
        accessibilityLabel={`${label}. Not verified: ${before}. Verified: Yes.`}
        style={[styles.row, before !== 'Yes' && styles.townRow, largeText && styles.stacked]}>
        <Text maxFontSizeMultiplier={1.4} style={[styles.label, !largeText && styles.activity]}>{label}</Text>
        {largeText ? <Text style={styles.detail}>Not verified: {before}{'\n'}Verified: Yes</Text> : <>
          <View style={styles.column}>{before === 'Preview' ? <Text maxFontSizeMultiplier={1.4} style={styles.preview}>Preview</Text>
            : <Icon name={before === 'Yes' ? 'checkmark' : 'remove'} size={22} color={before === 'Yes' ? COLORS.primary : COLORS.textMuted} />}</View>
          <View style={styles.column}><Icon name="checkmark" size={22} color={COLORS.primary} /></View>
        </>}
      </View>)}
    </View>
    <Text style={styles.note}>Town borrow previews hide lenders’ identities unless they’ve already shared with your circles. Private posts stay private.</Text>
  </>;
}
const styles = StyleSheet.create({
  card: { ...CARD_SURFACE, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  heading: { ...TYPOGRAPHY.label, color: COLORS.textSecondary },
  verifiedHeading: { color: COLORS.primary },
  activity: { flex: 1, paddingRight: 8 },
  column: { width: '24%', textAlign: 'center', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight },
  label: { ...TYPOGRAPHY.bodySmall, fontFamily: 'DMSans_500Medium', fontWeight: '500', color: COLORS.text },
  townRow: { backgroundColor: COLORS.primaryMuted },
  stacked: { alignItems: 'flex-start', flexDirection: 'column', gap: 8, paddingVertical: 16 },
  detail: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  preview: { ...TYPOGRAPHY.label, color: COLORS.primary },
  note: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: 16 },
});
