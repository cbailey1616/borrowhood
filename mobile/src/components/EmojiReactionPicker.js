import { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import BlurCard from './BlurCard';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS } from '../utils/config';

const EMOJI_OPTIONS = [
  { key: 'thumbsup', emoji: '\u{1F44D}' },
  { key: 'heart', emoji: '\u{2764}\u{FE0F}' },
  { key: 'laugh', emoji: '\u{1F602}' },
  { key: 'surprised', emoji: '\u{1F62E}' },
  { key: 'sad', emoji: '\u{1F622}' },
  { key: 'thumbsdown', emoji: '\u{1F44E}' },
];

export { EMOJI_OPTIONS };

export default function EmojiReactionPicker({ onSelect, onMore, style }) {
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
        <View style={styles.bar}>
          {EMOJI_OPTIONS.map((item, index) => (
            <Animated.View key={item.key} entering={FadeIn.delay(index * 30)}>
              <HapticPressable
                onPress={() => handleSelect(item.emoji)}
                haptic={null}
                style={styles.emojiButton}
              >
                <Text style={styles.emoji}>{item.emoji}</Text>
              </HapticPressable>
            </Animated.View>
          ))}
          <Animated.View entering={FadeIn.delay(EMOJI_OPTIONS.length * 30)}>
            <HapticPressable onPress={handleMore} haptic={null} style={styles.moreButton}>
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
    gap: 2,
  },
  emojiButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  emoji: {
    fontSize: 24,
  },
  moreButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: COLORS.surfaceElevated,
  },
});
