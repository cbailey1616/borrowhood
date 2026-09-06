import { useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from './Icon';
import VerifiedBadge from './VerifiedBadge';
import HapticPressable from './HapticPressable';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

// Original woodland emblems, with activity thresholds kept separate from identity.
const TIERS = [
  { key: 'squire', label: 'Squire', min: 0, max: 2, icon: 'rank-squire', color: '#756044', description: 'New to the Borrowhood' },
  { key: 'archer', label: 'Archer', min: 3, max: 10, icon: 'rank-archer', color: '#756044', description: 'Learning the ropes' },
  { key: 'outlaw', label: 'Outlaw', min: 11, max: 30, icon: 'rank-outlaw', color: '#42594C', description: 'Active member of the crew' },
  { key: 'ranger', label: 'Sherwood Ranger', min: 31, max: 75, icon: 'rank-ranger', color: '#42594C', description: 'Experienced community member' },
  { key: 'robin', label: 'Robin', min: 76, max: Infinity, icon: 'rank-robin', color: '#946B28', description: 'Legendary Borrowhood member' },
];

export function getTier(totalTransactions) {
  return TIERS.find(t => totalTransactions >= t.min && totalTransactions <= t.max) || TIERS[0];
}

export function RankEmblem({ tier, size = 16 }) {
  return (
    <Ionicons name={tier.icon} size={size} illustrated accessibilityLabel={`${tier.label} rank`} />
  );
}

// Back-compat: TierIcon is consumed across Feed/Profile/ListingDetail/UserProfile.
export function TierIcon({ tier, size }) {
  return <RankEmblem tier={tier} size={size} />;
}

export default function UserBadges({
  isVerified = false,
  totalTransactions = 0,
  size = 'medium',
  compact = false,
  centered = false,
}) {
  const [showLegend, setShowLegend] = useState(false);
  const tier = getTier(totalTransactions);
  const iconSize = size === 'small' ? 14 : 18;
  const fontSize = size === 'small' ? 11 : 13;

  return (
    <>
      <View style={[styles.container, centered && styles.containerCentered, compact && styles.containerCompact]}>
        {isVerified && (
          <View style={[styles.badge, styles.verifiedBadge, compact && styles.badgeCompact]}>
            <VerifiedBadge size={iconSize} interactive />
            {!compact && <Text style={[styles.badgeText, { fontSize, color: COLORS.primary }]}>Verified identity</Text>}
          </View>
        )}

        <Text style={[styles.exchangeText, { fontSize }, centered && styles.centeredText]}>{totalTransactions} completed {totalTransactions === 1 ? 'exchange' : 'exchanges'}</Text>
        {!compact && <HapticPressable onPress={() => setShowLegend(true)} accessibilityRole="button" accessibilityLabel="View community ranks" style={styles.rankButton}>
          <RankEmblem tier={tier} size={22} />
          <Text style={styles.rankText}>{tier.label} · About ranks</Text>
        </HapticPressable>}
      </View>

      <Modal
        visible={showLegend}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLegend(false)}
      >
        <HapticPressable
          style={styles.overlay}
          onPress={() => setShowLegend(false)}
          haptic="light"
        >
          <ScrollView style={[styles.legendCard, { maxHeight: '85%' }]} contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={styles.legendTitle}>Borrowhood Ranks</Text>
            <Text style={styles.legendSubtitle}>Ranks reflect activity, not identity or safety checks. Reviews and completed exchanges offer more context.</Text>

            {TIERS.map((t) => {
              const isCurrent = t.key === tier.key;
              return (
                <View key={t.key} style={[styles.legendRow, isCurrent && styles.legendRowCurrent]}>
                  <View style={styles.legendIcon}>
                    <RankEmblem tier={t} size={40} />
                  </View>
                  <View style={styles.legendInfo}>
                    <View style={styles.legendNameRow}>
                      <Text style={[styles.legendName, isCurrent && { color: t.color }]}>{t.label}</Text>
                      {isCurrent && (
                        <View style={[styles.currentTag, { backgroundColor: t.color + '20' }]}>
                          <Text style={[styles.currentTagText, { color: t.color }]}>You</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.legendDesc}>{t.description}</Text>
                  </View>
                  <Text style={styles.legendRange}>
                    {t.max === Infinity ? `${t.min}+` : `${t.min}–${t.max}`}
                  </Text>
                </View>
              );
            })}

            <HapticPressable
              style={styles.legendClose}
              onPress={() => setShowLegend(false)}
              haptic="light"
            >
              <Text style={styles.legendCloseText}>Got it</Text>
            </HapticPressable>
          </ScrollView>
        </HapticPressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    maxWidth: '100%',
    gap: 6,
    marginTop: 8,
  },
  containerCentered: {
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  exchangeText: {
    color: COLORS.textSecondary,
  },
  rankButton: {
    minHeight: 44,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankText: {
    flexShrink: 1,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  containerCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 0,
    gap: 4,
  },
  badge: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeCompact: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
  },
  verifiedBadge: {
    backgroundColor: COLORS.primary + '20',
  },
  badgeText: {
    flexShrink: 1,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  legendCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 340,
  },
  legendTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  legendSubtitle: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  legendRowCurrent: {
    backgroundColor: COLORS.primaryMuted,
    marginHorizontal: -SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderBottomWidth: 0,
  },
  legendIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendInfo: {
    flex: 1,
  },
  legendNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  legendName: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.text,
  },
  currentTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  currentTagText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
  },
  legendDesc: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  legendRange: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  legendClose: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  legendCloseText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
});
