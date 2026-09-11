import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PopupLayer from './PopupLayer';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { NEIGHBOR_RANKS, RATING_UNLOCK_EXCHANGES } from '../utils/reputation';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function RankInfoSheet({ isVisible, onClose, currentRank, isNew = false }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return <PopupLayer visible={isVisible} onRequestClose={onClose}>
    <View style={styles.container} onAccessibilityEscape={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
      <Animated.View entering={SlideInDown.duration(200)} accessibilityViewIsModal
        style={[styles.sheet, { maxHeight: height - insets.top - SPACING.md, paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Neighbor rating</Text>
          <HapticPressable style={styles.close} onPress={onClose} accessibilityLabel="Close rank explanation">
            <Ionicons name="close" size={22} color={COLORS.primary} />
          </HapticPressable>
        </View>
        <ScrollView bounces={false} contentContainerStyle={styles.content}>
          {currentRank && <View style={styles.currentSummary}>
            <View style={styles.emblem}>
              <Ionicons name={currentRank.icon} size={32} illustrated color={COLORS.primary} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.currentRating}>{isNew ? currentRank.label : currentRank.tone}</Text>
              <Text style={styles.note}>{isNew ? `Rating after ${RATING_UNLOCK_EXCHANGES} completed exchanges` : currentRank.label}</Text>
            </View>
          </View>}
          {currentRank && !isNew && <View style={styles.meter} accessible accessibilityLabel={`Rating level: ${currentRank.tone}`}>
            {NEIGHBOR_RANKS.map(rank => <View key={rank.label} style={styles.meterColumn}>
              <View style={styles.marker}>
                {rank.label === currentRank.label && <Ionicons name="chevron-down" size={16} color={COLORS.primary} />}
              </View>
              <View style={[styles.segment, rank.label === currentRank.label && styles.currentSegment]} />
            </View>)}
          </View>}
          <Text style={styles.explanation}>Build your rank with positive exchanges.</Text>
          <View style={styles.levels}>
            <Text style={styles.levelsTitle} accessibilityRole="header">Rating levels</Text>
            {NEIGHBOR_RANKS.map(rank => <View key={rank.label} testID={`RankInfo.level.${rank.label}`}
              style={[styles.level, currentRank?.label === rank.label && styles.currentLevel]}>
              <Ionicons name={rank.icon} size={28} illustrated color={COLORS.primary} />
              <View style={styles.levelCopy}>
                <Text style={styles.levelName}>{rank.tone}</Text>
                <Text style={styles.note}>{rank.label}</Text>
              </View>
              {currentRank?.label === rank.label && <View style={styles.currentBadge}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                <Text style={styles.current}>Current</Text>
              </View>}
            </View>)}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  </PopupLayer>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.overlay },
  sheet: { width: '100%', maxWidth: 572, alignSelf: 'center', backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, overflow: 'hidden' },
  handle: { width: 36, height: 4, marginTop: SPACING.sm, alignSelf: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg, paddingTop: SPACING.sm },
  title: { ...TYPOGRAPHY.h3, color: COLORS.primary, flex: 1 },
  close: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  currentSummary: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm },
  emblem: { width: 64, height: 64, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  summaryCopy: { flex: 1, gap: SPACING.xs },
  currentRating: { ...TYPOGRAPHY.h2, letterSpacing: 0, color: COLORS.primary },
  meter: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.md },
  meterColumn: { flex: 1 },
  marker: { height: 16, alignItems: 'center' },
  segment: { height: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryMuted },
  currentSegment: { backgroundColor: COLORS.primary },
  explanation: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.sm },
  levels: { marginTop: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.separator },
  levelsTitle: { ...TYPOGRAPHY.headline, color: COLORS.primary, marginBottom: SPACING.sm },
  level: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 56, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.sm },
  currentLevel: { backgroundColor: COLORS.primaryMuted },
  levelCopy: { flex: 1, gap: 2 },
  levelName: { ...TYPOGRAPHY.headline, color: COLORS.primary },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, maxWidth: '35%' },
  current: { ...TYPOGRAPHY.caption1, color: COLORS.primary, fontWeight: '600', flexShrink: 1 },
  note: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
