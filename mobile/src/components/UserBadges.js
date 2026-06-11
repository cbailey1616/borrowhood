import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Ionicons } from './Icon';
import VerifiedBadge from './VerifiedBadge';
import HapticPressable from './HapticPressable';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// Sweeping diagonal light band — the legendary (Robin) shimmer. Loops forever;
// only mounted at larger sizes (never in tiny FlatList-row icons).
function ShimmerBand({ disc }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      300,
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        -1,
        false
      )
    );
    return () => cancelAnimation(p);
  }, [disc]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (-1.2 + 2.4 * p.value) * disc }, { rotate: '18deg' }],
  }));

  return (
    <AnimatedLinearGradient
      pointerEvents="none"
      colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[
        { position: 'absolute', top: -disc * 0.4, bottom: -disc * 0.4, width: disc * 0.42 },
        style,
      ]}
    />
  );
}

// ===========================================================================
// Borrowhood rank emblems
// ---------------------------------------------------------------------------
// Layered gradient medallions (not flat stock glyphs). Flashiness scales with
// rank via `flash` (1–5): higher ranks gain a glow, sunburst rays and a gem.
// Drawn with View + expo-linear-gradient only (no native SVG dependency), so
// it renders cheaply inside FlatList rows.
// ===========================================================================

// --- Custom motif: bow & arrow (Archer) ---
function BowArrowIcon({ size, color }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: s * 0.5, height: s * 0.84, borderWidth: s * 0.11, borderColor: color, borderRadius: s * 0.4, borderRightWidth: 0, left: s * 0.14 }} />
      <View style={{ position: 'absolute', width: s * 0.07, height: s * 0.84, backgroundColor: color, left: s * 0.55, borderRadius: s * 0.04 }} />
      <View style={{ position: 'absolute', width: s * 0.72, height: s * 0.08, backgroundColor: color, borderRadius: s * 0.04, left: s * 0.16 }} />
      <View style={{ position: 'absolute', right: s * 0.0, width: 0, height: 0, borderLeftWidth: s * 0.18, borderTopWidth: s * 0.12, borderBottomWidth: s * 0.12, borderLeftColor: color, borderTopColor: 'transparent', borderBottomColor: 'transparent' }} />
    </View>
  );
}

// --- Custom motif: feathered cap (Robin) ---
function RobinHatIcon({ size, color }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', bottom: s * 0.18, width: 0, height: 0, borderLeftWidth: s * 0.46, borderRightWidth: s * 0.46, borderBottomWidth: s * 0.56, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color, transform: [{ rotate: '14deg' }] }} />
      <View style={{ position: 'absolute', bottom: s * 0.12, width: s * 0.86, height: s * 0.14, backgroundColor: color, borderRadius: s * 0.08, transform: [{ rotate: '5deg' }] }} />
      <View style={{ position: 'absolute', top: s * 0.02, right: s * 0.16, width: s * 0.1, height: s * 0.4, backgroundColor: color, borderRadius: s * 0.05, transform: [{ rotate: '-20deg' }], opacity: 0.85 }} />
      <View style={{ position: 'absolute', top: 0, right: s * 0.2, width: s * 0.06, height: s * 0.16, backgroundColor: color, borderRadius: s * 0.03, transform: [{ rotate: '-35deg' }], opacity: 0.6 }} />
    </View>
  );
}

const ion = (name) => ({ size, color }) => <Ionicons name={name} size={size} color={color} />;

// flash: 1 flat · 2 gloss · 3 glow · 4 +rays · 5 +rays +gem (legendary)
const TIERS = [
  { key: 'squire',  label: 'Squire',          min: 0,  max: 2,        flash: 1, motif: ion('shield-half'), grad: ['#A9BACE', '#6E869F'], ring: '#C6D3E1', glow: '#8095AC', gem: null,      color: '#6E869F', description: 'New to the Borrowhood' },
  { key: 'archer',  label: 'Archer',          min: 3,  max: 10,       flash: 2, motif: BowArrowIcon,        grad: ['#CE9A6A', '#8A5A36'], ring: '#E6B987', glow: '#B07C4E', gem: null,      color: '#8A5A36', description: 'Learning the ropes' },
  { key: 'outlaw',  label: 'Outlaw',          min: 11, max: 30,       flash: 3, motif: ion('flame'),        grad: ['#F0A93E', '#C0392B'], ring: '#F8CE7A', glow: '#EE7B3A', gem: null,      color: '#C0392B', description: 'Active member of the crew' },
  { key: 'ranger',  label: 'Sherwood Ranger', min: 31, max: 75,       flash: 4, motif: ion('leaf'),         grad: ['#46A06A', '#1C5230'], ring: '#86D6A2', glow: '#3E9A63', gem: null,      color: '#1C5230', description: 'Trusted community veteran' },
  { key: 'robin',   label: 'Robin',           min: 76, max: Infinity, flash: 5, motif: RobinHatIcon,        grad: ['#FBE38A', '#C8971A'], ring: '#FFF0BE', glow: '#FFD24D', gem: '#E8533F', color: '#C8971A', description: 'Legendary Borrowhood member' },
];

export function getTier(totalTransactions) {
  return TIERS.find(t => totalTransactions >= t.min && totalTransactions <= t.max) || TIERS[0];
}

// Sunburst rays behind the medallion (higher ranks only)
function Sunburst({ size, color, count }) {
  return (
    <View style={{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: size * 0.05,
            height: size * 1.02,
            backgroundColor: color,
            opacity: 0.45,
            borderRadius: size * 0.025,
            transform: [{ rotate: `${(180 / count) * i}deg` }],
          }}
        />
      ))}
    </View>
  );
}

// The rank medallion. Looks premium from ~14px up; rays/gem appear once the
// emblem is big enough to show them off (legend / profile), not in tiny rows.
export function RankEmblem({ tier, size = 16 }) {
  const showFx = size >= 26;
  const shimmer = tier.flash >= 5 && size >= 18; // legendary sweep, not in tiny row icons
  const disc = size * (showFx && tier.flash >= 4 ? 0.72 : 0.94);
  const Motif = tier.motif;
  const glow = tier.flash >= 3
    ? { shadowColor: tier.glow, shadowOpacity: 0.85, shadowRadius: size * (0.06 + tier.flash * 0.025), shadowOffset: { width: 0, height: 0 }, elevation: tier.flash }
    : null;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {showFx && tier.flash >= 4 && (
        <Sunburst size={size} color={tier.ring} count={tier.flash >= 5 ? 12 : 8} />
      )}

      {/* shadow carrier (unclipped) wrapping the clipped disc, so the glow
          isn't squared off by the disc's overflow:hidden (masksToBounds) */}
      <View style={[{ width: disc, height: disc, borderRadius: disc / 2 }, glow]}>
        <View style={{
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          overflow: 'hidden',
          borderWidth: Math.max(1, disc * 0.07),
          borderColor: tier.ring,
        }}>
          <LinearGradient
            colors={tier.grad}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            {/* top gloss highlight (clipped to the circle) */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: disc * 0.42, backgroundColor: 'rgba(255,255,255,0.22)' }} />
            <Motif size={disc * 0.54} color="#fff" />
            {shimmer && <ShimmerBand disc={disc} />}
          </LinearGradient>
        </View>
      </View>

      {/* legendary gem accent */}
      {showFx && tier.gem && (
        <View style={{
          position: 'absolute',
          top: size * 0.02,
          width: size * 0.16,
          height: size * 0.16,
          backgroundColor: tier.gem,
          transform: [{ rotate: '45deg' }],
          borderWidth: Math.max(1, size * 0.012),
          borderColor: '#fff',
          shadowColor: tier.gem,
          shadowOpacity: 0.9,
          shadowRadius: size * 0.1,
          shadowOffset: { width: 0, height: 0 },
        }} />
      )}
    </View>
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
}) {
  const [showLegend, setShowLegend] = useState(false);
  const tier = getTier(totalTransactions);
  const iconSize = size === 'small' ? 14 : 18;
  const fontSize = size === 'small' ? 11 : 13;

  return (
    <>
      <View style={[styles.container, compact && styles.containerCompact]}>
        {isVerified && (
          <View style={[styles.badge, styles.verifiedBadge, compact && styles.badgeCompact]}>
            <VerifiedBadge size={iconSize} />
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
              testID="UserBadges.info"
              accessibilityLabel="View rank legend"
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
