import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import DiscussionComposer from '../../../src/components/DiscussionComposer';

// Exercise controlled draft updates just as the comments screen does.
function ComposerHarness({ initialValue = '', onSend = jest.fn(), ...props }) {
  const [value, setValue] = useState(initialValue);
  return <>
    <DiscussionComposer value={value} onChangeText={setValue} disabled={!value.trim()}
      onSend={() => onSend(value)} {...props} />
    <Text testID="draftValue">{value}</Text>
  </>;
}

const flatStyle = element => StyleSheet.flatten(element.props.style);
const luminance = hex => {
  const channels = hex.replace('#', '').match(/.{2}/g).map(channel => parseInt(channel, 16) / 255);
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

describe('DiscussionComposer', () => {
  it('keeps a separately sized input above the toolbar while its text grows and clears', () => {
    const screen = render(<ComposerHarness />);
    const card = screen.getByTestId('DiscussionComposer.card');
    const input = screen.getByTestId('DiscussionComposer.input');
    const toolbar = screen.getByTestId('DiscussionComposer.toolbar');
    // The toolbar must be a sibling, so native text-field sizing cannot obscure it.
    expect(input.parent).not.toBe(toolbar);
    expect(flatStyle(card).flexShrink).toBe(0);
    expect(flatStyle(input).flexShrink).toBe(0);
    expect(flatStyle(toolbar).flexShrink).toBe(0);
    expect(flatStyle(input).height).toBeGreaterThanOrEqual(72);
    expect(flatStyle(input).position).not.toBe('absolute');

    fireEvent.changeText(input, 'A longer comment with plenty of detail.');
    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 260 } } });
    expect(flatStyle(screen.getByTestId('DiscussionComposer.input')).height).toBe(140);
    expect(screen.getByLabelText('Insert emoji')).toBeTruthy();
    expect(screen.getByLabelText('Post comment')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('DiscussionComposer.input'), '');
    expect(flatStyle(screen.getByTestId('DiscussionComposer.input')).height).toBe(72);
  });

  it.each([
    { replyTo: undefined, label: 'Post', buttonLabel: 'Post comment' },
    { replyTo: 'Kate K.', label: 'Reply', buttonLabel: 'Post reply' },
  ])('keeps the disabled $label readable without allowing a blank draft to send', ({ replyTo, label, buttonLabel }) => {
    const onSend = jest.fn();
    const screen = render(<ComposerHarness onSend={onSend} replyTo={replyTo} sendAccessibilityLabel={buttonLabel} />);
    const button = screen.getByLabelText(buttonLabel);
    const buttonStyle = flatStyle(button);
    const labelStyle = flatStyle(screen.getByText(label));
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(buttonStyle.opacity).toBe(1);
    // Check the rendered disabled state, including the opacity inherited from HapticPressable.
    expect(contrast(labelStyle.color, buttonStyle.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    fireEvent.press(button);
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Comment'), '👍');
    fireEvent.press(screen.getByLabelText(buttonLabel));
    expect(onSend).toHaveBeenCalledWith('👍');
  });

  it('inserts a picked emoji at the current selection without discarding the rest of the draft', () => {
    const screen = render(<ComposerHarness initialValue="Friday or Sunday" />);
    const input = screen.getByLabelText('Comment');
    fireEvent(input, 'selectionChange', { nativeEvent: { selection: { start: 0, end: 6 } } });
    fireEvent.press(screen.getByLabelText('Insert emoji'));
    expect(screen.getAllByLabelText(/^React: /)).toHaveLength(19);
    fireEvent.press(screen.getByLabelText('React: Celebrate'));
    expect(screen.getByTestId('draftValue').props.children).toBe('🎉 or Sunday');
    expect(screen.getByLabelText('Comment').props.selection).toEqual({ start: 2, end: 2 });
    expect(screen.queryByLabelText('React: Celebrate')).toBeNull();
  });

  it('keeps typed @ text plain, omits mention controls, and passes focus through for keyboard scrolling', () => {
    const onFocus = jest.fn();
    const screen = render(<ComposerHarness initialValue="Can @Ka" onFocus={onFocus} />);
    fireEvent(screen.getByLabelText('Comment'), 'focus');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Comment').props.keyboardAppearance).toBe('light');
    expect(screen.queryByLabelText('Mention a neighbor')).toBeNull();
    expect(screen.queryByLabelText('Mention suggestions')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Can @KateK help?');
    expect(screen.getByTestId('draftValue').props.children).toBe('Can @KateK help?');
    expect(screen.queryByLabelText('Mention suggestions')).toBeNull();
  });

  it('inserts an emoji at a collapsed caret while preserving literal @ text and keyboard geometry', () => {
    const screen = render(<ComposerHarness initialValue="Ask @KateK" />);
    fireEvent(screen.getByLabelText('Comment'), 'selectionChange', { nativeEvent: { selection: { start: 4, end: 4 } } });
    fireEvent.press(screen.getByLabelText('Insert emoji'));
    fireEvent.press(screen.getByLabelText('React: Like'));
    expect(screen.getByTestId('draftValue').props.children).toBe('Ask 👍@KateK');
    expect(screen.getByLabelText('Comment').props.selection).toEqual({ start: 6, end: 6 });
    expect(screen.getByLabelText('Comment').props.keyboardAppearance).toBe('light');
    expect(flatStyle(screen.getByTestId('DiscussionComposer.input')).height).toBe(72);
    expect(flatStyle(screen.getByTestId('DiscussionComposer.toolbar')).flexShrink).toBe(0);
  });

  it('preserves directly typed emojis and enables the post action for the exact draft', () => {
    const onSend = jest.fn();
    const screen = render(<ComposerHarness onSend={onSend} />);
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Looks great 😊🔥 @KateK');
    expect(screen.getByLabelText('Post comment').props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByLabelText('Post comment'));
    expect(onSend).toHaveBeenCalledWith('Looks great 😊🔥 @KateK');
  });
});
