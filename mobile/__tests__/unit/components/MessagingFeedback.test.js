import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import MessageComposer from '../../../src/components/MessageComposer';
import MessageReactions from '../../../src/components/MessageReactions';
import MessageReactionMenu from '../../../src/components/MessageReactionMenu';
import { haptics } from '../../../src/utils/haptics';
import useReduceMotion from '../../../src/hooks/useReduceMotion';
import DiscussionComposer from '../../../src/components/DiscussionComposer';
import { Image } from 'expo-image';
import { iconSvg } from '../../../src/assets/borrowhood-icons';
import { COLORS } from '../../../src/utils/config';

jest.mock('../../../src/hooks/useReduceMotion', () => jest.fn(() => true));

beforeEach(() => {
  jest.clearAllMocks();
  useReduceMotion.mockReturnValue(true);
});

it('keeps disabled send silent and gives an enabled send exactly one light impact', () => {
  const send = jest.fn();
  const view = render(<MessageComposer value="Hello" onChangeText={jest.fn()} onSend={send} disabled />);
  fireEvent.press(view.getByLabelText('Send message'));
  expect(send).not.toHaveBeenCalled();
  expect(haptics.light).not.toHaveBeenCalled();

  view.rerender(<MessageComposer value="Hello" onChangeText={jest.fn()} onSend={send} />);
  fireEvent.press(view.getByLabelText('Send message'));
  expect(send).toHaveBeenCalledTimes(1);
  expect(haptics.light).toHaveBeenCalledTimes(1);
  expect(haptics.medium).not.toHaveBeenCalled();
});

it('gives a reaction toggle one selection effect and keeps opening its picker silent', () => {
  const toggle = jest.fn();
  const add = jest.fn();
  const view = render(<MessageReactions reactions={[{ userId: 'neighbor', emoji: '👍' }]}
    userId="me" onToggle={toggle} onAdd={add} />);
  fireEvent.press(view.getByLabelText('Like reaction, 1'));
  expect(toggle).toHaveBeenCalledWith('👍');
  expect(haptics.selection).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByLabelText('Add reaction'));
  expect(add).toHaveBeenCalledTimes(1);
  expect(haptics.selection).toHaveBeenCalledTimes(1);
  expect(haptics.light).not.toHaveBeenCalled();
  expect(haptics.medium).not.toHaveBeenCalled();
});

it('uses the same line smiley for composer and reaction picker controls with each supplied color', () => {
  const colors = { ...COLORS, primary: COLORS.text };
  const view = render(<>
    <DiscussionComposer value="" onChangeText={jest.fn()} disabled colors={colors} />
    <MessageReactions userId="me" onToggle={jest.fn()} onAdd={jest.fn()} colors={colors} />
  </>);
  const smileys = view.UNSAFE_getAllByType(Image);
  expect(smileys).toHaveLength(2);
  const expectedDrawing = iconSvg('happy-outline', { color: colors.primary, illustrated: false, selected: false });
  smileys.forEach(image => {
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: 22, height: 22 });
    expect(decodeURIComponent(image.props.source.uri.split(',')[1])).toBe(expectedDrawing);
  });
});

it.each([true, false])('respects the motion preference in both reaction modal and picker (%s)', reduceMotion => {
  useReduceMotion.mockReturnValue(reduceMotion);
  const view = render(<MessageReactionMenu visible onClose={jest.fn()} onSelect={jest.fn()} />);
  expect(view.UNSAFE_getByType(Modal).props.animationType).toBe(reduceMotion ? 'none' : 'fade');
  const animatedEntries = view.UNSAFE_root.findAll(node => node.props.entering != null);
  expect(animatedEntries.length > 0).toBe(!reduceMotion);
});
