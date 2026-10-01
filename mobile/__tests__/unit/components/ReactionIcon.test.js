import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { iconSvg } from '../../../src/assets/borrowhood-icons';
import { COLORS } from '../../../src/utils/config';
import BiometricIcon from '../../../src/components/BiometricIcon';
import ReactionIcon, { REACTION_OPTIONS, reactionOption } from '../../../src/components/ReactionIcon';
import EmojiReactionPicker from '../../../src/components/EmojiReactionPicker';
import MessageReactions from '../../../src/components/MessageReactions';
import { DISCUSSION_EMOJIS } from '../../../src/utils/discussionThread';

it.each(REACTION_OPTIONS)('uses the same native $label emoji in the picker and reaction chips', option => {
  const glyph = render(<ReactionIcon emoji={option.emoji} />);
  expect(glyph.getByText(option.emoji)).toBeTruthy();
  expect(glyph.UNSAFE_queryByType(Image)).toBeNull();
  const picker = render(<EmojiReactionPicker onSelect={jest.fn()} />);
  expect(picker.getByText(option.emoji)).toBeTruthy();
  const chips = render(<MessageReactions userId="me" reactions={[{ userId: 'me', emoji: option.emoji }]} onToggle={jest.fn()} />);
  expect(chips.getByText(option.emoji)).toBeTruthy();
  expect(chips.getByRole('button', { name: `${option.label} reaction, 1` }).props.accessibilityState.selected).toBe(true);
});

it('keeps custom user reactions readable and normalizes older heart values', async () => {
  const screen = render(<ReactionIcon emoji="custom reaction" />);
  expect(screen.getByText('custom reaction')).toBeTruthy();
  await act(async () => screen.rerender(<ReactionIcon emoji={'\u2764'} />));
  expect(screen.getByText('❤️')).toBeTruthy();
  expect(reactionOption('❤')).toMatchObject({ key: 'heart', label: 'Love' });
});

it('uses one accessible emoji catalog for all screens and preserves the original controls', () => {
  expect(DISCUSSION_EMOJIS).toBe(REACTION_OPTIONS);
  expect(REACTION_OPTIONS).toHaveLength(19);
  for (const [key, emoji, label] of [
    ['thumbsup', '👍', 'Like'], ['heart', '❤️', 'Love'], ['laugh', '😂', 'Laugh'],
    ['surprised', '😮', 'Surprised'], ['sad', '😢', 'Sad'], ['thumbsdown', '👎', 'Dislike'],
  ]) expect(REACTION_OPTIONS).toContainEqual({ key, emoji, label });
  const select = jest.fn();
  const more = jest.fn();
  const screen = render(<EmojiReactionPicker onSelect={select} onMore={more} />);
  for (const option of REACTION_OPTIONS) {
    fireEvent.press(screen.getByRole('button', { name: `React: ${option.label}` }));
    expect(select).toHaveBeenLastCalledWith(option.emoji);
  }
  fireEvent.press(screen.getByRole('button', { name: 'More message actions' }));
  expect(more).toHaveBeenCalledTimes(1);
});

it('omits the message actions button in comment composer emoji pickers', () => {
  const screen = render(<EmojiReactionPicker onSelect={jest.fn()} />);
  expect(screen.queryByRole('button', { name: 'More message actions' })).toBeNull();
});

// Ordinary app icons are still Borrowhood drawings.
it.each([['Face ID', 'faceid'], ['Touch ID', 'finger-print-outline']])('uses a Borrowhood drawing for %s', (type, name) => {
  const screen = render(<BiometricIcon type={type} />);
  expect(decodeURIComponent(screen.UNSAFE_getByType(Image).props.source.uri.split(',')[1])).toBe(
    iconSvg(name, { color: COLORS.primary, illustrated: true, selected: !name.endsWith('-outline') }));
});
