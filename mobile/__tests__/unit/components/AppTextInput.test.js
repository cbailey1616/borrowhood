import React from 'react';
import { InputAccessoryView, Keyboard, Platform, TextInput, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import AppTextInput from '../../../src/components/AppTextInput';

it.each([
  { keyboardType: 'number-pad' }, { keyboardType: 'decimal-pad' }, { keyboardType: 'phone-pad' },
  { keyboardType: 'numeric' }, { keyboardType: 'ascii-capable-number-pad' },
  { inputMode: 'numeric' }, { inputMode: 'decimal' }, { inputMode: 'tel' },
  { keyboardType: 'default', inputMode: 'numeric' },
])('keeps a dark Done control on a keypad without submitting or clearing: %j', props => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  const submit = jest.fn(), change = jest.fn();
  const screen = render(<AppTextInput {...props} testID="input" value="Draft" onSubmitEditing={submit} onChangeText={change} />);
  const field = screen.getByTestId('input');
  expect(field.props.keyboardAppearance).toBe('dark');
  expect(field.props.keyboardType).toBe(props.keyboardType);
  expect(field.props.secureTextEntry).toBe(props.secureTextEntry);
  const accessory = screen.UNSAFE_getByType(InputAccessoryView);
  expect(accessory.props.backgroundColor).toBe('#2C2C2E');
  expect(field.props.inputAccessoryViewID).toBe(accessory.props.nativeID);
  expect(screen.queryByLabelText('Done, close keyboard')).toBeNull();
  fireEvent(field, 'focus', {});
  fireEvent.press(screen.getByLabelText('Done, close keyboard'));
  expect(dismiss).toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByTestId('input').props.value).toBe('Draft');
  fireEvent(field, 'blur', {});
  expect(screen.queryByLabelText('Done, close keyboard')).toBeNull();
  dismiss.mockRestore();
});

it.each([
  {}, { multiline: true }, { secureTextEntry: true, textContentType: 'password', autoComplete: 'current-password' },
  { keyboardType: 'email-address', autoCorrect: false, autoCapitalize: 'none' },
  { keyboardType: 'number-pad', inputMode: 'text' },
  { keyboardType: 'number-pad', inputMode: 'none' },
])('uses the plain message-style keyboard for ordinary typing without losing input options: %j', props => {
  const screen = render(<AppTextInput {...props} autoFocus testID="input" />);
  const field = screen.getByTestId('input');
  expect(field.props.keyboardAppearance).toBe('dark');
  expect(field.props.autoFocus).toBe(true);
  expect(field.props.inputAccessoryViewID).toBeUndefined();
  expect(field.props).toEqual(expect.objectContaining(props));
  expect(screen.UNSAFE_queryByType(InputAccessoryView)).toBeNull();
});

it('preserves refs, focus callbacks and the search key', () => {
  const ref = React.createRef(), focus = jest.fn(), blur = jest.fn();
  const screen = render(<AppTextInput ref={ref} testID="input" returnKeyType="search" onFocus={focus} onBlur={blur} />);
  expect(typeof ref.current.focus).toBe('function');
  expect(screen.UNSAFE_getByType(TextInput).props.returnKeyType).toBe('search');
  fireEvent(screen.getByTestId('input'), 'focus', {});
  fireEvent(screen.getByTestId('input'), 'blur', {});
  expect(focus).toHaveBeenCalledTimes(1);
  expect(blur).toHaveBeenCalledTimes(1);
});

it('waits for the native toolbar before auto-focusing and does not refocus after dismissal', () => {
  const ref = React.createRef();
  const screen = render(<AppTextInput ref={ref} autoFocus keyboardType="number-pad" testID="input" />);
  const focus = jest.spyOn(ref.current, 'focus');
  expect(screen.getByTestId('input').props.autoFocus).toBe(false);
  expect(focus).not.toHaveBeenCalled();
  const toolbar = screen.UNSAFE_getAllByType(View).find(view => view.props.onLayout);
  fireEvent(toolbar, 'layout', { nativeEvent: { layout: { width: 375, height: 44 } } });
  expect(focus).toHaveBeenCalledTimes(1);
  fireEvent(screen.getByTestId('input'), 'focus', {});
  fireEvent(screen.getByTestId('input'), 'blur', {});
  fireEvent(toolbar, 'layout', { nativeEvent: { layout: { width: 812, height: 44 } } });
  expect(focus).toHaveBeenCalledTimes(1);
});

it('preserves a caller-owned accessory and its native autofocus', () => {
  const screen = render(<AppTextInput autoFocus keyboardType="number-pad" inputAccessoryViewID="custom-toolbar" testID="input" />);
  expect(screen.getByTestId('input').props.inputAccessoryViewID).toBe('custom-toolbar');
  expect(screen.getByTestId('input').props.autoFocus).toBe(true);
  expect(screen.UNSAFE_queryByType(InputAccessoryView)).toBeNull();
});

it('allows explicit accessory overrides and leaves Android dismissal to the native keyboard', () => {
  const screen = render(<AppTextInput showDoneAccessory multiline testID="input" />);
  expect(screen.UNSAFE_getByType(InputAccessoryView)).toBeTruthy();
  screen.rerender(<AppTextInput showDoneAccessory={false} keyboardType="number-pad" testID="input" />);
  expect(screen.UNSAFE_queryByType(InputAccessoryView)).toBeNull();
  const originalOS = Platform.OS;
  try {
    Platform.OS = 'android';
    screen.rerender(<AppTextInput showDoneAccessory keyboardType="number-pad" testID="input" />);
    expect(screen.UNSAFE_queryByType(InputAccessoryView)).toBeNull();
  } finally {
    Platform.OS = originalOS;
  }
});

it('supports a composer without the Done toolbar while preserving native focus and text', () => {
  const change = jest.fn();
  const screen = render(<AppTextInput showDoneAccessory={false} autoFocus multiline testID="input" value="Draft" onChangeText={change} />);
  const field = screen.getByTestId('input');
  expect(field.props.inputAccessoryViewID).toBeUndefined();
  expect(field.props.autoFocus).toBe(true);
  expect(field.props.showDoneAccessory).toBeUndefined();
  expect(screen.UNSAFE_queryByType(InputAccessoryView)).toBeNull();
  fireEvent.changeText(field, 'My reply');
  expect(change).toHaveBeenCalledWith('My reply');
});
