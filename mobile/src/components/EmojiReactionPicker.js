import { useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import BlurCard from './BlurCard';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import ReactionIcon, { REACTION_OPTIONS } from './ReactionIcon';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS } from '../utils/config';

const EMOJI_OPTIONS = REACTION_OPTIONS;

export { EMOJI_OPTIONS };

export default function EmojiReactionPicker({ onSelect, onMore, style }) {
  const { width } = useWindowDimensions();
  const handleSelect = useCallback((emoji) => {
    haptics.light();
    onSelect?.(emoji);
  }, [onSelect]);

  const handleMore = useCallback(() => {
    haptics.light();
    onMore?.();
  }, [onMore]);

  return (
    <Animated.View entering={FadeIn.duration(150)} style={[styles.container, style]}>
      <BlurCard style={styles.card} intensity={80}>
        <View style={[styles.bar, { width: Math.min(340, width - 32) }]}>
          {EMOJI_OPTIONS.map((item, index) => (
            <Animated.View key={item.key} style={styles.slot} entering={FadeIn.delay(index * 30)}>
              <HapticPressable
                onPress={() => handleSelect(item.emoji)}
                accessibilityRole="button"
                accessibilityLabel={`React: ${item.label}`}
                haptic={null}
                style={styles.emojiButton}
              >
                <ReactionIcon emoji={item.emoji} />
              </HapticPressable>
            </Animated.View>
          ))}
          <Animated.View style={styles.slot} entering={FadeIn.delay(EMOJI_OPTIONS.length * 30)}>
            <HapticPressable onPress={handleMore} haptic={null} style={styles.moreButton} accessibilityRole="button" accessibilityLabel="More message actions">
              <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textSecondary} />
            </HapticPressable>
          </Animated.View>
        </View>
      </BlurCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 100,
  },
  card: {
    borderRadius: RADIUS.full,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  slot: { flex: 1 },
  emojiButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  moreButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: COLORS.surfaceElevated,
  },
});
