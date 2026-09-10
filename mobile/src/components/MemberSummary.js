import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import { getTier, RankEmblem } from './UserBadges';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function MemberSummary({ user }) {
  const tier = Number.isFinite(user.totalTransactions) ? getTier(user.totalTransactions) : null;
  const endorsement = user.endorsement;
  return <View style={styles.row}>
    <View style={styles.cell}>
      <Ionicons name={user.isVerified ? 'shield-checkmark' : 'shield-outline'} size={22} color={COLORS.primary} />
      <Text style={styles.value}>{user.isVerified === true ? 'Verified' : user.isVerified === false ? 'Not verified' : 'Unavailable'}</Text>
      <Text style={styles.label}>Identity</Text>
    </View>
    <View style={styles.cell}>
      {tier ? <RankEmblem tier={tier} size={22} /> : <Ionicons name="help-circle-outline" size={22} color={COLORS.textMuted} />}
      <Text style={styles.value}>{tier?.label || 'Unavailable'}</Text>
      <Text style={styles.label}>Rank</Text>
    </View>
    <View style={styles.cell}>
      <Ionicons name="thumbs-up-outline" size={22} color={COLORS.primary} />
      <Text style={styles.value}>{endorsement?.count > 0 ? `${endorsement.percent}%` : endorsement ? 'No ratings' : 'Unavailable'}</Text>
      <Text style={styles.label}>Endorsed</Text>
      {endorsement?.count > 0 && <Text style={styles.label}>{endorsement.count} rated</Text>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%', marginVertical: SPACING.sm },
  cell: { flex: 1, minWidth: 76, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.borderBrown, borderRadius: RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: 4, backgroundColor: COLORS.surface },
  value: { ...TYPOGRAPHY.footnote, fontWeight: '700', color: COLORS.primary, textAlign: 'center' },
  label: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center' },
});
