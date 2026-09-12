import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WholeDollarInput from '../../../src/components/WholeDollarInput';

it('accepts whole dollars and clearing with a number keypad', () => {
  const onChangeText = jest.fn();
  const screen = render(<WholeDollarInput accessibilityLabel="Price" value="" onChangeText={onChangeText} />);
  const input = screen.getByLabelText('Price');
  expect(input.props.keyboardType).toBe('number-pad');
  expect(input.props.placeholder).toBe('0');
  fireEvent.changeText(input, '25');
  expect(onChangeText).toHaveBeenLastCalledWith('25');
  fireEvent.changeText(input, '');
  expect(onChangeText).toHaveBeenLastCalledWith('');
});

it.each(['25.50', '2,50', '-25', '25abc'])('does not reinterpret a pasted %s as a different price', text => {
  const onChangeText = jest.fn();
  const screen = render(<WholeDollarInput accessibilityLabel="Price" value="25" onChangeText={onChangeText} />);
  fireEvent.changeText(screen.getByLabelText('Price'), text);
  expect(onChangeText).not.toHaveBeenCalled();
});

it('shows whole saved prices without cents while preserving existing fractional prices', () => {
  const onChangeText = jest.fn();
  const screen = render(<WholeDollarInput accessibilityLabel="Price" value="25.00" onChangeText={onChangeText} />);
  expect(screen.getByLabelText('Price').props.value).toBe('25');
  screen.rerender(<WholeDollarInput accessibilityLabel="Price" value="25.50" onChangeText={onChangeText} />);
  expect(screen.getByLabelText('Price').props.value).toBe('25.50');
  expect(onChangeText).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Price'), '30.00');
  expect(onChangeText).toHaveBeenCalledWith('30');
});
