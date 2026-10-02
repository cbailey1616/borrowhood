import React from 'react';
import { Text } from 'react-native';
import { reactionOption } from '../utils/reactions';

// Compatibility exports keep existing consumers on the shared emoji catalog.
export { REACTION_OPTIONS, reactionOption } from '../utils/reactions';

export default function ReactionIcon({ emoji, size = 24, style }) {
  // Use the platform emoji glyph everywhere. App icons keep their own drawings;
  // reactions in a picker and a chip now have identical shapes and colors.
  return <Text maxFontSizeMultiplier={1.4} style={[{ fontSize: size, lineHeight: size + 8, textAlign: 'center' }, style]}>
    {reactionOption(emoji)?.emoji || emoji}
  </Text>;
}
