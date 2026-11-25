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
describe('DiscussionComposer', () => {
  it('keeps the send button beside the growing field and resets its height after clearing', () => {
    const screen = render(<ComposerHarness />);
    const input = screen.getByLabelText('Comment');
    expect(flatStyle(input).height).toBe(44);
    expect(flatStyle(screen.getByTestId('DiscussionComposer.card')).flexDirection).toBe('row');
    fireEvent.changeText(input, 'A longer comment');
    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 260 } } });
    expect(flatStyle(input).height).toBe(140);
    expect(screen.getByLabelText('Post comment')).toBeTruthy();
    fireEvent.changeText(input, '');
    expect(flatStyle(input).height).toBe(44);
  });

  it.each(['Post comment', 'Post reply'])('keeps %s disabled for whitespace and allows emoji-only drafts', label => {
    const onSend = jest.fn();
    const screen = render(<ComposerHarness initialValue="  " onSend={onSend} sendAccessibilityLabel={label} />);
    const button = screen.getByLabelText(label);
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Comment'), '👍🏽');
    fireEvent.press(button);
    expect(onSend).toHaveBeenCalledWith('👍🏽');
  });

  it('shows a quoted reply target and lets the user clear it', () => {
    const onCancel = jest.fn();
    const screen = render(<ComposerHarness replyTo="Kate K." quote="Friday or Sunday?" onCancel={onCancel} />);
    expect(screen.getByText('Replying to Kate K.')).toBeTruthy();
    expect(screen.getByText('“Friday or Sunday?”').props.numberOfLines).toBe(1);
    fireEvent.press(screen.getByLabelText('Cancel reply'));
    expect(onCancel).toHaveBeenCalledTimes(1);
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

  it('preserves directly typed emojis and enables the post action for the exact draft', () => {
    const onSend = jest.fn();
    const screen = render(<ComposerHarness onSend={onSend} />);
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Looks great 😊🔥 @KateK');
    expect(screen.getByLabelText('Post comment').props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByLabelText('Post comment'));
    expect(onSend).toHaveBeenCalledWith('Looks great 😊🔥 @KateK');
  });
});
