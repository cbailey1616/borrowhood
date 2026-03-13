import { useState } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Ionicons } from './Icon';
import HapticPressable from './HapticPressable';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

// Custom bow & arrow icon drawn with Views
function BowArrowIcon({ size, color }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Bow arc */}
      <View style={{
        position: 'absolute',
        width: s * 0.55,
        height: s * 0.85,
        borderWidth: s * 0.12,
        borderColor: color,
        borderRadius: s * 0.4,
        borderRightWidth: 0,
        left: s * 0.12,
      }} />
      {/* Bow string */}
      <View style={{
        position: 'absolute',
        width: s * 0.08,
        height: s * 0.85,
        backgroundColor: color,
        left: s * 0.55,
        borderRadius: s * 0.04,
      }} />
      {/* Arrow shaft */}
      <View style={{
        position: 'absolute',
        width: s * 0.7,
        height: s * 0.08,
        backgroundColor: color,
        borderRadius: s * 0.04,
        left: s * 0.2,
      }} />
      {/* Arrow head */}
      <View style={{
        position: 'absolute',
        right: s * 0.02,
        width: 0,
        height: 0,
        borderLeftWidth: s * 0.18,
        borderTopWidth: s * 0.12,
        borderBottomWidth: s * 0.12,
        borderLeftColor: color,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
      }} />
    </View>
  );
}

// Custom Robin Hood hat icon drawn with Views
function RobinHatIcon({ size, color }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Hat body - angled triangle */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.15,
        width: 0,
        height: 0,
        borderLeftWidth: s * 0.5,
        borderRightWidth: s * 0.5,
        borderBottomWidth: s * 0.6,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
        transform: [{ rotate: '15deg' }],
      }} />
      {/* Hat brim */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.1,
        width: s * 0.9,
        height: s * 0.15,
        backgroundColor: color,
        borderRadius: s * 0.08,
        transform: [{ rotate: '5deg' }],
      }} />
      {/* Feather */}
      <View style={{
        position: 'absolute',
        top: s * 0.02,
        right: s * 0.18,
        width: s * 0.1,
        height: s * 0.4,
        backgroundColor: color,
        borderRadius: s * 0.05,
        transform: [{ rotate: '-20deg' }],
        opacity: 0.8,
      }} />
      {/* Feather tip */}
      <View style={{
        position: 'absolute',
        top: 0,
        right: s * 0.22,
        width: s * 0.06,
        height: s * 0.15,
        backgroundColor: color,
        borderRadius: s * 0.03,
        transform: [{ rotate: '-35deg' }],
        opacity: 0.6,
      }} />
    </View>
  );
}

const TIERS = [
  { key: 'squire', label: 'Squire', icon: 'shield-half', min: 0, max: 2, color: '#6B8DB5', description: 'New to the Borrowhood' },
  { key: 'archer', label: 'Archer', customIcon: BowArrowIcon, min: 3, max: 10, color: '#8B5E3C', description: 'Learning the ropes' },
  { key: 'outlaw', label: 'Outlaw', icon: 'bonfire', min: 11, max: 30, color: COLORS.warning, description: 'Active member of the crew' },
  { key: 'ranger', label: 'Sherwood Ranger', icon: 'trail-sign', min: 31, max: 75, color: '#C0392B', description: 'Trusted community veteran' },
  { key: 'robin', label: 'Robin', customIcon: RobinHatIcon, min: 76, max: Infinity, color: '#D4AF37', description: 'Legendary Borrowhood member' },
];

export function getTier(totalTransactions) {
  return TIERS.find(t => totalTransactions >= t.min && totalTransactions <= t.max) || TIERS[0];
}

export function TierIcon({ tier, size }) {
  if (tier.customIcon) {
    const CustomIcon = tier.customIcon;
    return <CustomIcon size={size} color={tier.color} />;
  }
  return <Ionicons name={tier.icon} size={size} color={tier.color} />;
}

export default function UserBadges({
  isVerified = false,
  totalTransactions = 0,
  size = 'medium',
  compact = false,
}) {
  const [showLegend, setShowLegend] = useState(false);
  const tier = getTier(totalTransactions);
  const iconSize = size === 'small' ? 12 : 16;
  const fontSize = size === 'small' ? 11 : 13;

  return (
    <>
      <View style={[styles.container, compact && styles.containerCompact]}>
        {isVerified && (
          <View style={[styles.badge, styles.verifiedBadge, compact && styles.badgeCompact]}>
            <Ionicons name="shield-checkmark" size={iconSize} color={COLORS.primary} />
            {!compact && <Text style={[styles.badgeText, { fontSize, color: COLORS.primary }]}>Verified</Text>}
          </View>
        )}

        <View style={[styles.badge, { backgroundColor: tier.color + '20' }, compact && styles.badgeCompact]}>
          <TierIcon tier={tier} size={iconSize} />
          {!compact && <Text style={[styles.badgeText, { fontSize, color: tier.color }]}>{tier.label}</Text>}
          {!compact && (
            <HapticPressable
              onPress={() => setShowLegend(true)}
              haptic="light"
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            >
              <Ionicons name="information-circle-outline" size={iconSize} color={tier.color} style={{ opacity: 0.7 }} />
            </HapticPressable>
          )}
        </View>
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
          <View style={styles.legendCard}>
            <Text style={styles.legendTitle}>Borrowhood Ranks</Text>
            <Text style={styles.legendSubtitle}>Level up by borrowing and lending</Text>

            {TIERS.map((t) => {
              const isCurrent = t.key === tier.key;
              return (
                <View key={t.key} style={[styles.legendRow, isCurrent && styles.legendRowCurrent]}>
                  <View style={[styles.legendIcon, { backgroundColor: t.color + '20' }]}>
                    <TierIcon tier={t} size={18} />
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
                    {t.max === Infinity ? `${t.min}+` : `${t.min}\u2013${t.max}`}
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
          </View>
        </HapticPressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  containerCompact: {
    marginTop: 0,
    gap: 4,
  },
  badge: {
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
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    width: 36,
    height: 36,
    borderRadius: 10,
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
