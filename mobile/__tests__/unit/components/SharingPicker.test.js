import React from 'react';
import { ThemedAlert as Alert } from '../../../src/components/ThemedAlert';
import { render, fireEvent, act } from '@testing-library/react-native';
import SharingPicker from '../../../src/components/SharingPicker';

const onChange = jest.fn();
const onVerify = jest.fn();
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => jest.restoreAllMocks());

it('adds an audience without replacing existing selections', () => {
  const { getByLabelText } = render(<SharingPicker value={['close_friends']} onChange={onChange} verified />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  fireEvent.press(getByLabelText('Town'));
  expect(onChange).toHaveBeenCalledWith({ visibility: ['close_friends', 'town'], circleId: null });
});

it('returns to private when the final audience is unchecked', () => {
  const { getByLabelText } = render(<SharingPicker value={['close_friends']} onChange={onChange} />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  fireEvent.press(getByLabelText('Friends'));
  expect(onChange).toHaveBeenCalledWith({ visibility: ['private'], circleId: null });
});

it('defaults to private and does not publish on mount', () => {
  const { getByLabelText } = render(<SharingPicker onChange={onChange} />);
  expect(getByLabelText('Change who can see this item').props.accessibilityState.expanded).toBe(false);
  fireEvent.press(getByLabelText('Change who can see this item'));
  expect(getByLabelText('Only me').props.accessibilityState.checked).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});

it('selects friends directly without a blocking popup', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const { getByLabelText } = render(<SharingPicker onChange={onChange} />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  fireEvent.press(getByLabelText('Friends'));
  expect(alert).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledWith({ visibility: ['close_friends'], circleId: null });
});

it('keeps all three checked when selected sequentially', () => {
  function Form() {
    const [value, setValue] = React.useState(['private']);
    return <SharingPicker value={value} verified onChange={next => setValue(next.visibility)} />;
  }
  const { getByLabelText } = render(<Form />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  ['Friends', 'Neighborhood', 'Town'].forEach(label => fireEvent.press(getByLabelText(label)));
  ['Friends', 'Neighborhood', 'Town'].forEach(label =>
    expect(getByLabelText(label).props.accessibilityState.checked).toBe(true));
  expect(getByLabelText('Only me').props.accessibilityState.checked).toBe(false);
});

it('routes unverified users to verification instead of selecting town sharing', () => {
  const { getByLabelText } = render(<SharingPicker onChange={onChange} onVerify={onVerify} verified={false} />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  fireEvent.press(getByLabelText('Town'));
  expect(onVerify).toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

it('offers the same friends, neighborhood, and town choices used elsewhere', () => {
  const { getByLabelText, queryByLabelText } = render(<SharingPicker onChange={onChange} />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  expect(getByLabelText('Friends')).toBeTruthy();
  expect(getByLabelText('Neighborhood')).toBeTruthy();
  expect(getByLabelText('Town')).toBeTruthy();
  expect(queryByLabelText('A group')).toBeNull();
});

it.each(['Join a neighborhood', 'Create a neighborhood'])('opens %s after removing the local prompt', label => {
  const join = jest.fn(); const create = jest.fn();
  const screen = render(<SharingPicker onChange={onChange} neighborhoodAvailable={false}
    onJoinNeighborhood={join} onCreateNeighborhood={create} />);
  fireEvent.press(screen.getByLabelText('Change who can see this item'));
  fireEvent.press(screen.getByLabelText('Neighborhood'));
  expect(screen.getByText('Find your neighborhood')).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText(label));
  expect(label.startsWith('Join') ? join : create).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Find your neighborhood')).toBeNull();
});

it('dismissing the neighborhood prompt leaves the selection alone and can reopen', () => {
  const screen = render(<SharingPicker onChange={onChange} neighborhoodAvailable={false} />);
  fireEvent.press(screen.getByLabelText('Change who can see this item'));
  for (let i = 0; i < 3; i++) {
    fireEvent.press(screen.getByLabelText('Neighborhood'));
    fireEvent.press(screen.getByText('Not now'));
    expect(screen.queryByText('Find your neighborhood')).toBeNull();
  }
  expect(onChange).not.toHaveBeenCalled();
});
