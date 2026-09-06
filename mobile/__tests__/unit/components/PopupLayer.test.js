import React from 'react';
import { Text, Modal, Platform, Keyboard } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { render } from '@testing-library/react-native';
import PopupLayer from '../../../src/components/PopupLayer';
it('uses the iOS window layer and removes it before the close callback', () => {
  const screen = render(<PopupLayer visible><Text>Popup</Text></PopupLayer>);
  expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
  expect(screen.getByText('Popup')).toBeTruthy();
  const closed = jest.fn(() => expect(screen.queryByText('Popup')).toBeNull());
  screen.rerender(<PopupLayer visible={false} onDismiss={closed}><Text>Popup</Text></PopupLayer>);
  expect(closed).toHaveBeenCalledTimes(1);
  screen.rerender(<PopupLayer visible={false} onDismiss={closed}><Text>Popup</Text></PopupLayer>);
  expect(closed).toHaveBeenCalledTimes(1);
});
it('does not leave a hit target when initially closed', () => {
  const closed = jest.fn();
  const screen = render(<PopupLayer visible={false} onDismiss={closed}><Text>Popup</Text></PopupLayer>);
  expect(screen.toJSON()).toBeNull();
  expect(closed).not.toHaveBeenCalled();
});
it('keeps Android hardware-back dismissal available', () => {
  const os = Platform.OS; Platform.OS = 'android';
  try {
    const back = jest.fn();
    const screen = render(<PopupLayer visible onRequestClose={back}><Text>Popup</Text></PopupLayer>);
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(back).toHaveBeenCalledTimes(1);
  } finally { Platform.OS = os; }
});
