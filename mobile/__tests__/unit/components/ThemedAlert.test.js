import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import Host, { ThemedAlert } from '../../../src/components/ThemedAlert';

it('requires explicit confirmation and treats closing as cancellation', () => {
  const confirm = jest.fn();
  const cancel = jest.fn();
  const { getByText, getByLabelText, queryByText } = render(<Host />);
  act(() => ThemedAlert.alert('Share this item?', 'Only this item is shared.', [
    { text: 'Keep private', style: 'cancel', onPress: cancel },
    { text: 'Share', onPress: confirm },
  ]));
  expect(getByText('Only this item is shared.')).toBeTruthy();
  fireEvent.press(getByLabelText('Close menu'));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  expect(queryByText('Share this item?')).toBeNull();
  act(() => ThemedAlert.alert('Ready?', '', [{ text: 'Confirm', onPress: confirm }]));
  fireEvent.press(getByText('Confirm'));
  expect(confirm).toHaveBeenCalledTimes(1);
});
