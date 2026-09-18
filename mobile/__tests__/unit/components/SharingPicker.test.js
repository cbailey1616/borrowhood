import React from 'react';
import { ThemedAlert as Alert } from '../../../src/components/ThemedAlert';
import { render, fireEvent, act } from '@testing-library/react-native';
import SharingPicker from '../../../src/components/SharingPicker';

const onChange = jest.fn();
const onVerify = jest.fn();
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => jest.restoreAllMocks());

it('explains Town borrowing verification separately from other post types', () => {
  const screen = render(<SharingPicker value={['town']} onChange={onChange} />);
  expect(screen.getByText('For added safety, verify your identity to borrow across town. No verification needed to borrow from friends or your neighborhood.')).toBeTruthy();
  for (const props of [{ request: true }, { listingType: 'giveaway' }, { listingType: 'sell' }]) {
    screen.rerender(<SharingPicker value={['town']} onChange={onChange} {...props} />);
    expect(screen.getByText('Town members can see this post, your name, and your profile.')).toBeTruthy();
    expect(screen.queryByText(/Your name and profile are hidden/)).toBeNull();
  }
});

it('selecting Town includes the available Friends and Neighborhood audiences', () => {
  const { getByLabelText } = render(<SharingPicker value={['close_friends']} onChange={onChange} verified />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  fireEvent.press(getByLabelText('Town'));
  expect(onChange).toHaveBeenCalledWith({ visibility: ['close_friends', 'neighborhood', 'town'], circleId: null });
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

it('lets unverified users select Town without opening verification', () => {
  const { getByLabelText } = render(<SharingPicker onChange={onChange} onVerify={onVerify} verified={false} />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  fireEvent.press(getByLabelText('Town'));
  expect(onVerify).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledWith({ visibility: ['close_friends', 'neighborhood', 'town'], circleId: null });
});

it('does not add unavailable groups when Town is selected', () => {
  const screen = render(<SharingPicker onChange={onChange} friendsAvailable={false} neighborhoodAvailable={false} />);
  fireEvent.press(screen.getByLabelText('Change who can see this item'));
  fireEvent.press(screen.getByLabelText('Town'));
  expect(onChange).toHaveBeenCalledWith({ visibility: ['town'], circleId: null });
});

it.each([false, true])('keeps explicit opt-outs when Town is toggled and the picker is reopened (request=%s)', request => {
  function Form() {
    const [value, setValue] = React.useState(['close_friends', 'neighborhood', 'town']);
    return <SharingPicker value={value} request={request} onChange={next => setValue(next.visibility)} />;
  }
  const screen = render(<Form />);
  const trigger = request ? 'Change who can see this post' : 'Change who can see this item';
  fireEvent.press(screen.getByLabelText(trigger));
  fireEvent.press(screen.getByLabelText('Friends'));
  fireEvent.press(screen.getByLabelText('Town'));
  fireEvent.press(screen.getByLabelText('Town'));
  fireEvent.press(screen.getByLabelText(trigger));
  fireEvent.press(screen.getByLabelText(trigger));
  expect(screen.getByLabelText('Friends').props.accessibilityState.checked).toBe(false);
  expect(screen.getByLabelText('Neighborhood').props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('Town').props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByLabelText('Friends'));
  expect(screen.getByLabelText('Friends').props.accessibilityState.checked).toBe(true);
});

it('leaves a restored Town-only choice unchanged, including when Town is toggled', () => {
  function Form() {
    const [value, setValue] = React.useState(['town']);
    return <SharingPicker value={value} onChange={next => { onChange(next); setValue(next.visibility); }} />;
  }
  const screen = render(<Form />);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Change who can see this item'));
  fireEvent.press(screen.getByLabelText('Town'));
  fireEvent.press(screen.getByLabelText('Town'));
  expect(onChange).toHaveBeenLastCalledWith({ visibility: ['town'], circleId: null });
});

it('allows unchecking an unavailable group without opening its join flow', () => {
  const screen = render(<SharingPicker value={['neighborhood', 'town']} neighborhoodAvailable={false} onChange={onChange} />);
  fireEvent.press(screen.getByLabelText('Change who can see this item'));
  fireEvent.press(screen.getByLabelText('Neighborhood'));
  expect(onChange).toHaveBeenCalledWith({ visibility: ['town'], circleId: null });
  expect(screen.queryByText('Find your neighborhood')).toBeNull();
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
