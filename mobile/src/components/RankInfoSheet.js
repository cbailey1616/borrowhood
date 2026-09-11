import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PopupLayer from './PopupLayer';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { NEIGHBOR_RANKS, NEW_NEIGHBOR_RANK, reputationRank } from '../utils/reputation';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function RankInfoSheet({ isVisible, onClose, score }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const currentRank = score !== undefined ? reputationRank(score) : null;
  return <PopupLayer visible={isVisible} onRequestClose={onClose}>
    <View style={styles.container} onAccessibilityEscape={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
      <Animated.View entering={SlideInDown.duration(200)}
        style={[styles.sheet, { maxHeight: height - insets.top - SPACING.md, paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Neighbor Score & ranks</Text>
          <HapticPressable style={styles.close} onPress={onClose} accessibilityLabel="Close rank explanation">
            <Ionicons name="close" size={22} color={COLORS.primary} />
          </HapticPressable>
        </View>
        <ScrollView bounces={false} contentContainerStyle={styles.content}>
          <Text style={styles.explanation}>Your rank reflects your exchange history. Increase your rank with more positive exchanges.</Text>
          <View style={styles.levels}>
            {[NEW_NEIGHBOR_RANK, ...NEIGHBOR_RANKS].map(rank => <View key={rank.label}
              style={[styles.level, currentRank?.label === rank.label && styles.currentLevel]}>
              <Ionicons name={rank.icon} size={28} illustrated color={COLORS.primary} />
              <View style={styles.levelCopy}>
                <Text style={styles.levelName}>{rank.label}</Text>
                {rank === NEW_NEIGHBOR_RANK && <Text style={styles.note}>Getting started</Text>}
              </View>
              <View style={styles.range}>
                {rank.min !== undefined && <Text style={styles.rangeText}>{rank.min}–{rank.max}</Text>}
                {currentRank?.label === rank.label && <Text style={styles.current}>Current</Text>}
              </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg, paddingBottom: SPACING.sm },
  title: { ...TYPOGRAPHY.h3, color: COLORS.primary, flex: 1 },
  close: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  explanation: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  levels: { marginVertical: SPACING.md },
  level: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 48, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.md },
  currentLevel: { backgroundColor: COLORS.primaryMuted },
  levelCopy: { flex: 1, gap: 2 },
  levelName: { ...TYPOGRAPHY.subheadline, color: COLORS.primary },
  range: { alignItems: 'flex-end', flexShrink: 0, gap: 2 },
  rangeText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  current: { ...TYPOGRAPHY.caption1, color: COLORS.primary, fontWeight: '600' },
  note: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
