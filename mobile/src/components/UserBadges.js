import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import VerifiedBadge from './VerifiedBadge';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function UserBadges({
  isVerified = false,
  totalTransactions = 0,
  size = 'medium',
  compact = false,
  centered = false,
  layout = 'default',
}) {
  const exchangeLabel = `${totalTransactions} completed ${totalTransactions === 1 ? 'exchange' : 'exchanges'}`;
  const fontSize = size === 'small' ? 11 : 13;

  if (layout === 'summary') return (
    <View style={styles.summary} accessible accessibilityLabel={exchangeLabel}>
      <Ionicons name="swap-horizontal" size={20} illustrated color={COLORS.primary} />
      <Text style={styles.summaryText}>{exchangeLabel}</Text>
    </View>
  );

  return (
    <View style={[styles.container, centered && styles.centered, compact && styles.compact]}>
      {isVerified && <View style={styles.verified}>
        <VerifiedBadge size={size === 'small' ? 14 : 18} interactive />
        {!compact && <Text style={[styles.verifiedText, { fontSize }]}>Verified identity</Text>}
      </View>}
      <Text style={[styles.exchangeText, { fontSize }, centered && styles.centeredText]}>{exchangeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.separator },
  summaryText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flexShrink: 1 },
  container: { alignItems: 'flex-start', maxWidth: '100%', gap: 6, marginTop: 8 },
  centered: { alignItems: 'center' },
  centeredText: { textAlign: 'center' },
  compact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 0, gap: 4 },
  verified: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { flexShrink: 1, fontWeight: '600', color: COLORS.primary },
  exchangeText: { color: COLORS.textSecondary },
});
