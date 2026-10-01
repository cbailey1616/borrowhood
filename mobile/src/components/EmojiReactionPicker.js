import { useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import ReactionIcon from './ReactionIcon';
import { REACTION_OPTIONS, REACTION_PICKER_COLUMNS, REACTION_PICKER_CELL_HEIGHT, REACTION_PICKER_PADDING } from '../utils/reactions';
import { haptics } from '../utils/haptics';
import { COLORS } from '../utils/config';

export { REACTION_OPTIONS as EMOJI_OPTIONS } from '../utils/reactions';

export default function EmojiReactionPicker({ onSelect, onMore, style, options = REACTION_OPTIONS, colors = COLORS }) {
  const { width } = useWindowDimensions();
  const handleSelect = useCallback(emoji => {
    haptics.light();
    onSelect?.(emoji);
  }, [onSelect]);
  const handleMore = useCallback(() => {
    haptics.light();
    onMore?.();
  }, [onMore]);

  return <Animated.View entering={FadeIn.duration(150)} style={[styles.container, style]}>
    <View style={[styles.card, { width: Math.min(340, width - 32), backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
      <View style={styles.grid}>
        {options.map(item => <HapticPressable key={item.key} accessibilityRole="button"
          accessibilityLabel={`React: ${item.label}`} haptic={null} style={styles.emojiButton}
          onPress={() => handleSelect(item.emoji)}>
          <ReactionIcon emoji={item.emoji} size={25} />
        </HapticPressable>)}
      </View>
      {!!onMore && <HapticPressable accessibilityRole="button" accessibilityLabel="More message actions"
        haptic={null} onPress={handleMore} style={styles.moreButton}>
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
      </HapticPressable>}
    </View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  container: { position: 'absolute', zIndex: 100 },
  card: { borderRadius: 18, padding: REACTION_PICKER_PADDING, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  emojiButton: { width: `${100 / REACTION_PICKER_COLUMNS}%`, height: REACTION_PICKER_CELL_HEIGHT,
    alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  moreButton: { height: REACTION_PICKER_CELL_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
});
