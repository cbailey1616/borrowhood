import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ActionButton from '../../../src/components/ActionButton';
import { COLORS } from '../../../src/utils/config';

it('makes a secondary action visibly outlined and comfortably sized', () => {
  const onPress = jest.fn();
  const screen = render(<ActionButton label="Manage members" onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Manage members' });
  expect(button).toHaveStyle({ minHeight: 48, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.surface });
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

it.each([{ disabled: true }, { loading: true }])('blocks repeated actions when unavailable: %j', state => {
  const onPress = jest.fn();
  const screen = render(<ActionButton label="Save" onPress={onPress} {...state} />);
  const button = screen.getByRole('button', { name: 'Save' });
  expect(button).toBeDisabled();
  fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

it('distinguishes destructive actions without removing their label', () => {
  const screen = render(<ActionButton destructive label="Discard draft" onPress={() => {}} />);
  expect(screen.getByRole('button', { name: 'Discard draft' })).toHaveStyle({ borderColor: COLORS.danger });
  expect(screen.getByText('Discard draft')).toHaveStyle({ color: COLORS.danger });
});

it('allows long labels to wrap and preserves expanded state', () => {
  const label = 'See all of the exchanges with this neighbor';
  const screen = render(<ActionButton label={label} accessibilityState={{ expanded: true }} onPress={() => {}} />);
  expect(screen.getByText(label).props.numberOfLines).toBeUndefined();
  expect(screen.getByRole('button', { name: label }).props.accessibilityState.expanded).toBe(true);
});
