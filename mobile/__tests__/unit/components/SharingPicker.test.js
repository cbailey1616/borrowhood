import React from 'react';
import { ThemedAlert as Alert } from '../../../src/components/ThemedAlert';
import { render, fireEvent, act } from '@testing-library/react-native';
import SharingPicker from '../../../src/components/SharingPicker';

const onChange = jest.fn();
const onVerify = jest.fn();
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => jest.restoreAllMocks());

it('adds an audience without replacing existing selections', () => {
  const alert = jest.spyOn(Alert, 'alert');
  const { getByLabelText } = render(<SharingPicker value={['close_friends']} onChange={onChange} verified />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  fireEvent.press(getByLabelText('Town'));
  act(() => alert.mock.calls[0][2].find(action => action.text === 'Use this audience').onPress());
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

it('requires confirmation before selecting an accepted-friends audience', () => {
  const alert = jest.spyOn(Alert, 'alert');
  const { getByLabelText } = render(<SharingPicker onChange={onChange} />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  fireEvent.press(getByLabelText('Friends'));
  expect(onChange).not.toHaveBeenCalled();
  act(() => alert.mock.calls[0][2].find(action => action.text === 'Use this audience').onPress());
  expect(onChange).toHaveBeenCalledWith({ visibility: ['close_friends'], circleId: null });
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

it('helps people join before selecting an unavailable neighborhood', () => {
  const alert = jest.spyOn(Alert, 'alert');
  const onJoinNeighborhood = jest.fn();
  const { getByLabelText } = render(<SharingPicker onChange={onChange}
    neighborhoodAvailable={false} onJoinNeighborhood={onJoinNeighborhood} />);
  fireEvent.press(getByLabelText('Change who can see this item'));
  fireEvent.press(getByLabelText('Neighborhood'));
  expect(onChange).not.toHaveBeenCalled();
  act(() => alert.mock.calls[0][2].find(action => action.text === 'Find my neighborhood').onPress());
  expect(onJoinNeighborhood).toHaveBeenCalled();
});
