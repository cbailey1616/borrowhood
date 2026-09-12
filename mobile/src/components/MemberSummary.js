import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NeighborRankBadge from './NeighborRankBadge';
import RankInfoSheet from './RankInfoSheet';
import { memberReputation } from '../utils/reputation';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

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
      <NeighborRankBadge rank={rank} showName={profileHeader}
        accessibilityLabel={profileHeader ? undefined : ratingLabel} onPress={() => setShowRanks(true)} />
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
  secondary: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  textCentered: { textAlign: 'center' },
});
