import React from 'react';
import { InputAccessoryView, TextInput } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import AppTextInput from '../../../src/components/AppTextInput';

it.each([
  { keyboardType: 'number-pad' }, { keyboardType: 'decimal-pad' }, { keyboardType: 'phone-pad' },
  { keyboardType: 'numeric' }, { keyboardType: 'ascii-capable-number-pad' },
  { inputMode: 'numeric' }, { inputMode: 'decimal' }, { inputMode: 'tel' },
  { keyboardType: 'default', inputMode: 'numeric' },
])('uses a keypad without an extra toolbar or delayed autofocus: %j', props => {
  const screen = render(<AppTextInput {...props} autoFocus testID="input" value="123456" textContentType="oneTimeCode" />);
  const field = screen.getByTestId('input');
  expect(field.props).toEqual(expect.objectContaining({ ...props, autoFocus: true, value: '123456', textContentType: 'oneTimeCode' }));
  expect(field.props.inputAccessoryViewID).toBeUndefined();
  expect(screen.UNSAFE_queryByType(InputAccessoryView)).toBeNull();
  expect(screen.queryByLabelText('Done, close keyboard')).toBeNull();
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

it('preserves a caller-owned accessory and its native autofocus', () => {
  const screen = render(<AppTextInput autoFocus keyboardType="number-pad" inputAccessoryViewID="custom-toolbar" testID="input" />);
  expect(screen.getByTestId('input').props.inputAccessoryViewID).toBe('custom-toolbar');
  expect(screen.getByTestId('input').props.autoFocus).toBe(true);
  expect(screen.UNSAFE_queryByType(InputAccessoryView)).toBeNull();
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
