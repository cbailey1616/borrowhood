import React from 'react';
import { Text } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS } from '../utils/config';

// Keep the wire values so existing messages and reaction toggles are unchanged.
export const REACTION_OPTIONS = [
  { key: 'thumbsup', emoji: '\u{1F44D}', icon: 'thumbs-up', label: 'Like' },
  { key: 'heart', emoji: '\u{2764}\u{FE0F}', icon: 'heart', label: 'Love' },
  { key: 'laugh', emoji: '\u{1F602}', icon: 'laugh', label: 'Laugh' },
  { key: 'surprised', emoji: '\u{1F62E}', icon: 'surprised', label: 'Surprised' },
  { key: 'sad', emoji: '\u{1F622}', icon: 'sad', label: 'Sad' },
  { key: 'thumbsdown', emoji: '\u{1F44E}', icon: 'thumbs-down', label: 'Dislike' },
];

export const reactionOption = emoji => REACTION_OPTIONS.find(option => option.emoji.replace(/\uFE0F/g, '') === emoji.replace(/\uFE0F/g, ''));

export default function ReactionIcon({ emoji, size = 24, style, overrideColor = COLORS.primary }) {
  const option = reactionOption(emoji);
  // An unrecognized custom reaction is user content, not an app icon.
  return option ? <Ionicons name={option.icon} size={size} illustrated color={overrideColor} style={style} />
    : <Text style={[{ fontSize: size }, style]}>{emoji}</Text>;
}
