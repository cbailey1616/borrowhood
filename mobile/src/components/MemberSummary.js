import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from './Icon';
import { useAuth } from '../context/AuthContext';
import { reputationRank } from '../utils/reputation';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function MemberSummary({ user, showEndorsement = true, centered = false }) {
  const { user: viewer } = useAuth();
  const { fontScale } = useWindowDimensions();
  const isOwnProfile = viewer?.id != null && String(viewer.id) === String(user.id);
  const endorsement = user.endorsement;
  const exchanges = user.totalTransactions;
  const exchangeLabel = Number.isFinite(exchanges) ? `${exchanges} completed ${exchanges === 1 ? 'exchange' : 'exchanges'}` : 'Exchange count unavailable';
  const hasScore = Number.isFinite(endorsement?.score);
  // Older servers still supply the original percentage. Keep its label accurate.
  const legacyPercent = !hasScore && endorsement?.count > 0 && Number.isFinite(endorsement?.percent);
  const value = hasScore ? endorsement.score : legacyPercent ? `${endorsement.percent}%` : endorsement ? 'New' : '—';
  const rank = reputationRank(endorsement?.score);
  const label = legacyPercent ? 'Endorsed' : endorsement ? rank.label : 'Score unavailable';
  const ringSize = 72 * Math.max(1, fontScale);
  const progress = hasScore ? Math.max(0, Math.min(100, endorsement.score)) : legacyPercent ? endorsement.percent : 0;
  const radius = (ringSize - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ringSize}" height="${ringSize}" viewBox="0 0 ${ringSize} ${ringSize}">
    <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${radius}" fill="none" stroke="${COLORS.separator}" stroke-width="3" />
    ${progress > 0 ? `<circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${radius}" fill="none" stroke="${COLORS.primary}" stroke-width="3" stroke-dasharray="${circumference} ${circumference}" stroke-dashoffset="${circumference * (1 - progress / 100)}" stroke-linecap="round" transform="rotate(-90 ${ringSize / 2} ${ringSize / 2})" />` : ''}
  </svg>`;
  return <View style={[styles.summary, centered && styles.centered]}>
    <View style={styles.line}>
      <Ionicons name={user.isVerified ? 'shield-checkmark' : 'shield-outline'} size={18} color={COLORS.primary} />
      <Text style={styles.secondary}>{user.isVerified === true ? 'Verified identity' : user.isVerified === false ? 'Not verified' : 'Verification unavailable'}</Text>
    </View>
    {showEndorsement && !isOwnProfile ? <View style={[styles.scoreRow, centered && styles.scoreCentered]}>
      <View style={[styles.ring, { width: ringSize, height: ringSize }]} accessible
        accessibilityLabel={hasScore ? `Neighbor Score ${value} out of 100` : legacyPercent ? `${value} endorsed` : endorsement ? 'Neighbor Score: New' : 'Neighbor Score unavailable'}>
        <Image source={{ uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ringSvg)}` }} style={StyleSheet.absoluteFill}
          contentFit="contain" transition={0} cachePolicy="memory" accessible={false} />
        {hasScore || legacyPercent ? <>
          <Text style={styles.score}>{value}</Text>
          {hasScore && <Text style={styles.scoreScale}>/ 100</Text>}
        </> : <Ionicons name={rank.icon} size={28} illustrated color={COLORS.primary} />}
      </View>
      <View style={styles.scoreCopy}>
        <View style={styles.line}>
          {hasScore && <Ionicons name={rank.icon} size={24} illustrated color={COLORS.primary} />}
          <Text style={styles.rating}>{label}</Text>
        </View>
        <Text style={styles.secondary}>{exchangeLabel}</Text>
      </View>
    </View> : <Text style={styles.secondary}>{exchangeLabel}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  summary: { alignItems: 'flex-start', gap: SPACING.sm, width: '100%', marginVertical: SPACING.sm },
  centered: { alignItems: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, maxWidth: '100%' },
  rating: { ...TYPOGRAPHY.headline, color: COLORS.primary, flexShrink: 1 },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.md, width: '100%' },
  scoreCentered: { justifyContent: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center' },
  score: { ...TYPOGRAPHY.h2, fontSize: 24, lineHeight: 30, color: COLORS.primary },
  scoreScale: { ...TYPOGRAPHY.caption1, fontSize: 10, lineHeight: 14, color: COLORS.textSecondary },
  scoreCopy: { flexShrink: 1, gap: SPACING.xs },
  secondary: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flexShrink: 1 },
});
