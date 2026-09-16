import React from 'react';
import { PanResponder, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import SheetDismissArea from '../../../src/components/SheetDismissArea';

afterEach(() => jest.restoreAllMocks());
it('accepts downward heading drags without stealing taps or horizontal/back swipes', () => {
  const spy = jest.spyOn(PanResponder, 'create');
  const dismiss = jest.fn();
  render(<SheetDismissArea onDismiss={dismiss}><Text>Options</Text></SheetDismissArea>);
  const gesture = spy.mock.calls[0][0];
  expect(gesture.onMoveShouldSetPanResponder(null, { dx: 2, dy: 30 })).toBe(true);
  for (const movement of [{ dx: 0, dy: 0 }, { dx: 30, dy: 10 }, { dx: 0, dy: -40 }]) {
    expect(gesture.onMoveShouldSetPanResponder(null, movement)).toBe(false);
  }
  gesture.onPanResponderRelease(null, { dy: 20, vy: 0.1 });
  expect(dismiss).not.toHaveBeenCalled();
  gesture.onPanResponderRelease(null, { dy: 60, vy: 0.1 });
  expect(dismiss).toHaveBeenCalledTimes(1);
  gesture.onPanResponderRelease(null, { dy: 20, vy: 0.9 });
  expect(dismiss).toHaveBeenCalledTimes(2);
});
