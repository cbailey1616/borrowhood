import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import HapticPressable from './HapticPressable';
import RankInfoSheet from './RankInfoSheet';
import { memberReputation } from '../utils/reputation';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function MemberSummary({ user, children, centered = false, openRating = false, onRatingClose, profileHeader = false }) {
  const [showRanks, setShowRanks] = useState(false);
  const { completedCount, isNew, rank } = memberReputation(user);
  const exchangeLabel = Number.isFinite(completedCount)
    ? `${completedCount} completed ${completedCount === 1 ? 'exchange' : 'exchanges'}`
    : 'Exchange count unavailable';
  const ratingLabel = rank ? `Neighbor rating: ${isNew ? rank.label : `${rank.tone}, ${rank.label}`}` : null;

  return <View style={[styles.summary, centered && styles.centered]}>
    <View testID="MemberSummary.identity" style={[styles.identityRow, centered && styles.identityCentered, profileHeader && styles.profileIdentity]}>
      <View style={styles.nameRow}>{children}</View>
      {rank && <HapticPressable style={[styles.rankButton, profileHeader && styles.rankNameButton]} accessibilityLabel={profileHeader ? `Neighbor rank: ${rank.label}` : ratingLabel}
        accessibilityHint="Opens rating details and rank levels"
        onPress={event => { event?.stopPropagation?.(); setShowRanks(true); }}>
        <Ionicons name={rank.icon} size={24} illustrated color={COLORS.primary} />
        {profileHeader && <Text style={styles.rankName}>{rank.label}</Text>}
      </HapticPressable>}
    </View>
    {!profileHeader && <Text style={[styles.secondary, centered && styles.textCentered]}>{exchangeLabel}</Text>}
    {(showRanks || openRating) && <RankInfoSheet isVisible onClose={() => { setShowRanks(false); onRatingClose?.(); }} currentRank={rank} isNew={isNew} />}
  </View>;
}

const styles = StyleSheet.create({
  summary: { alignItems: 'flex-start', width: '100%', gap: SPACING.xs },
  centered: { alignItems: 'center' },
  identityRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm, maxWidth: '100%' },
  identityCentered: { justifyContent: 'center' },
  profileIdentity: { width: '100%', flexWrap: 'nowrap', gap: SPACING.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  rankButton: { width: 44, minHeight: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  rankNameButton: { width: 'auto', maxWidth: '45%', minHeight: 48, flexDirection: 'row', gap: SPACING.xs, paddingHorizontal: SPACING.xs, paddingVertical: SPACING.xs, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  rankName: { ...TYPOGRAPHY.footnote, fontWeight: '600', color: COLORS.primary, flexShrink: 1 },
  secondary: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  textCentered: { textAlign: 'center' },
});
