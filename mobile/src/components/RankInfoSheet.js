import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PopupLayer from './PopupLayer';
import SheetDismissArea from './SheetDismissArea';
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
        <SheetDismissArea onDismiss={onClose}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Neighbor rating</Text>
          <HapticPressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close rank explanation">
            <Ionicons name="close" size={22} color={COLORS.primary} />
          </HapticPressable>
        </View>
        </SheetDismissArea>
        <ScrollView style={styles.scroll} bounces={false} contentContainerStyle={styles.content}>
          {currentRank && <View style={styles.currentSummary}>
            <View style={styles.emblem}>
              <Ionicons name={currentRank.icon} size={28} illustrated color={COLORS.primary} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.currentRating}>{currentRank.label}</Text>
              <Text style={styles.note} accessibilityLabel={!isNew ? `Rating level: ${currentRank.tone}` : undefined}>
                {isNew ? `Rating after ${RATING_UNLOCK_EXCHANGES} completed exchanges` : currentRank.tone}
              </Text>
            </View>
          </View>}
          <Text style={styles.explanation}>Build your rank with positive exchanges.</Text>
          <View style={styles.levels}>
            <Text style={styles.levelsTitle} accessibilityRole="header">Rating levels</Text>
            {NEIGHBOR_RANKS.map(rank => {
              const isCurrent = !isNew && currentRank?.label === rank.label;
              return <View key={rank.label} testID={`RankInfo.level.${rank.label}`} style={styles.levelRow}>
                <View style={styles.segmentTrack} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={[styles.segment, { backgroundColor: rank.meterColor }, isCurrent && styles.currentSegment]} />
                </View>
                <View style={[styles.level, isCurrent && styles.currentLevel]}>
                  <Ionicons name={rank.icon} size={24} illustrated color={COLORS.primary} />
                  <View style={styles.levelCopy}>
                    <View style={styles.levelNameGroup}>
                      <Text style={styles.levelName}>{rank.label}</Text>
                      {isCurrent && <View style={styles.currentBadge}>
                        <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                        <Text style={styles.current}>Current</Text>
                      </View>}
                    </View>
                    <Text style={[styles.note, styles.levelTone]}>{rank.tone}</Text>
                  </View>
                </View>
              </View>;
            })}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  </PopupLayer>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.overlay },
  sheet: { width: '100%', maxWidth: 572, flexShrink: 1, alignSelf: 'center', backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, overflow: 'hidden' },
  handle: { width: 36, height: 4, marginTop: SPACING.sm, alignSelf: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  title: { ...TYPOGRAPHY.h3, color: COLORS.primary, flex: 1 },
  close: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xs },
  currentSummary: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.xs },
  emblem: { width: 48, height: 48, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  summaryCopy: { flex: 1, gap: SPACING.xs },
  currentRating: { ...TYPOGRAPHY.h2, letterSpacing: 0, color: COLORS.primary },
  levelRow: { flexDirection: 'row', alignItems: 'stretch', gap: SPACING.xs },
  segmentTrack: { width: 10, alignItems: 'center', paddingVertical: 3 },
  segment: { flex: 1, width: 5, borderRadius: RADIUS.full },
  currentSegment: { width: 9, borderWidth: 1, borderColor: COLORS.primary },
  explanation: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.sm },
  levels: { marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.separator },
  levelsTitle: { ...TYPOGRAPHY.headline, color: COLORS.primary, marginBottom: SPACING.xs },
  level: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 44, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.sm },
  currentLevel: { backgroundColor: COLORS.primaryMuted },
  levelCopy: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: SPACING.sm, rowGap: 2 },
  levelNameGroup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: SPACING.sm, rowGap: 2, maxWidth: '100%' },
  levelName: { ...TYPOGRAPHY.headline, color: COLORS.primary, flexShrink: 1 },
  levelTone: { flexShrink: 1 },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexShrink: 1 },
  current: { ...TYPOGRAPHY.caption1, color: COLORS.primary, fontWeight: '400', flexShrink: 1 },
  note: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
