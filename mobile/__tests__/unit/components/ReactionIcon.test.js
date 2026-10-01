import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { iconSvg } from '../../../src/assets/borrowhood-icons';
import { COLORS } from '../../../src/utils/config';
import BiometricIcon from '../../../src/components/BiometricIcon';
import ReactionIcon, { REACTION_OPTIONS } from '../../../src/components/ReactionIcon';
import EmojiReactionPicker from '../../../src/components/EmojiReactionPicker';

it.each(REACTION_OPTIONS)('draws the themed $label reaction without changing its wire value', option => {
  const screen = render(<ReactionIcon emoji={option.emoji} />);
  const svg = decodeURIComponent(screen.UNSAFE_getByType(Image).props.source.uri.split(',')[1]);
  expect(svg).toBe(iconSvg(option.icon, { color: COLORS.primary, illustrated: true, selected: true }));
  expect(screen.queryByText(option.emoji)).toBeNull();
});

it('keeps custom user reactions readable and maps older heart values', async () => {
  const screen = render(<ReactionIcon emoji="custom reaction" />);
  expect(screen.getByText('custom reaction')).toBeTruthy();
  await act(async () => screen.rerender(<ReactionIcon emoji={'\u2764'} />));
  expect(decodeURIComponent(screen.UNSAFE_getByType(Image).props.source.uri.split(',')[1])).toBe(
    iconSvg('heart', { color: COLORS.primary, illustrated: true, selected: true }));
});

it('uses accessible reaction controls and sends existing emoji API values', () => {
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

it.each([['Face ID', 'faceid'], ['Touch ID', 'finger-print-outline']])('uses a Borrowhood drawing for %s', (type, name) => {
  const screen = render(<BiometricIcon type={type} />);
  expect(decodeURIComponent(screen.UNSAFE_getByType(Image).props.source.uri.split(',')[1])).toBe(
    iconSvg(name, { color: COLORS.primary, illustrated: true, selected: !name.endsWith('-outline') }));
});
