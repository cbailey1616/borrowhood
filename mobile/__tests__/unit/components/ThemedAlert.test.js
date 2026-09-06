import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import Host, { ThemedAlert } from '../../../src/components/ThemedAlert';
import { Modal } from 'react-native';

it('requires explicit confirmation and treats closing as cancellation', () => {
  const confirm = jest.fn();
  const cancel = jest.fn();
  const { getByText, getByLabelText, queryByText, UNSAFE_getByType } = render(<Host />);
  act(() => ThemedAlert.alert('Share this item?', 'Only this item is shared.', [
    { text: 'Keep private', style: 'cancel', onPress: cancel },
    { text: 'Share', onPress: confirm },
  ]));
  expect(getByText('Only this item is shared.')).toBeTruthy();
  fireEvent.press(getByLabelText('Close menu'));
  fireEvent(UNSAFE_getByType(Modal), 'dismiss');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  expect(queryByText('Share this item?')).toBeNull();
  act(() => ThemedAlert.alert('Ready?', '', [{ text: 'Confirm', onPress: confirm }]));
  fireEvent.press(getByText('Confirm'));
  fireEvent(UNSAFE_getByType(Modal), 'dismiss');
  expect(confirm).toHaveBeenCalledTimes(1);
});
