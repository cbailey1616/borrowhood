import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS } from '../utils/config';

/**
 * UserBadges component displays user verification and activity tier badges
 *
 * Activity Tiers:
 * - New: 0-9 transactions (no badge shown)
 * - Trusted: 10-24 transactions (checkmark badge)
 * - Power User: 25+ transactions (star badge)
 */
export default function UserBadges({
  isVerified = false,
  totalTransactions = 0,
  size = 'medium',
  compact = false
}) {
  const iconSize = size === 'small' ? 12 : 16;
  const fontSize = size === 'small' ? 11 : 13;

  // Determine activity tier
  const getActivityTier = () => {
    if (totalTransactions >= 25) return 'power';
    if (totalTransactions >= 10) return 'trusted';
    return null;
  };

  const activityTier = getActivityTier();

  // Don't render anything if no badges to show
  if (!isVerified && !activityTier) {
    return null;
  }

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {isVerified && (
        <View style={[styles.badge, styles.verifiedBadge, compact && styles.badgeCompact]}>
          <Ionicons name="shield-checkmark" size={iconSize} color={COLORS.primary} />
          {!compact && <Text style={[styles.badgeText, styles.verifiedText, { fontSize }]}>Verified</Text>}
        </View>
      )}

      {activityTier === 'trusted' && (
        <View style={[styles.badge, styles.trustedBadge, compact && styles.badgeCompact]}>
          <Ionicons name="checkmark-circle" size={iconSize} color={COLORS.secondary} />
          {!compact && <Text style={[styles.badgeText, styles.trustedText, { fontSize }]}>Trusted</Text>}
        </View>
      )}

      {activityTier === 'power' && (
        <View style={[styles.badge, styles.powerBadge, compact && styles.badgeCompact]}>
          <Ionicons name="star" size={iconSize} color={COLORS.warning} />
          {!compact && <Text style={[styles.badgeText, styles.powerText, { fontSize }]}>Power User</Text>}
        </View>
      )}
    </View>
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
  trustedBadge: {
    backgroundColor: COLORS.secondary + '20',
  },
  powerBadge: {
    backgroundColor: COLORS.warning + '20',
  },
  badgeText: {
    fontWeight: '600',
  },
  verifiedText: {
    color: COLORS.primary,
  },
  trustedText: {
    color: COLORS.secondary,
  },
  powerText: {
    color: COLORS.warning,
  },
});
