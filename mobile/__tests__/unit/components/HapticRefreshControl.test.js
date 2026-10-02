import React from 'react';
import { RefreshControl } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import HapticRefreshControl from '../../../src/components/HapticRefreshControl';
import { haptics } from '../../../src/utils/haptics';

jest.mock('../../../src/utils/haptics', () => ({ haptics: { light: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());

it('gives feedback for the pull and forwards callback arguments and return value', () => {
  const result = Promise.resolve();
  const onRefresh = jest.fn(() => result);
  const screen = render(<HapticRefreshControl refreshing={false} onRefresh={onRefresh} />);
  const event = { nativeEvent: {} };
  expect(screen.UNSAFE_getByType(RefreshControl).props.onRefresh(event)).toBe(result);
  expect(haptics.light).toHaveBeenCalledTimes(1);
  expect(onRefresh).toHaveBeenCalledWith(event);
});

it('keeps loading-state changes quiet', () => {
  const screen = render(<HapticRefreshControl refreshing={false} onRefresh={jest.fn()} />);
  screen.rerender(<HapticRefreshControl refreshing onRefresh={jest.fn()} />);
  screen.rerender(<HapticRefreshControl refreshing={false} onRefresh={jest.fn()} />);
  expect(haptics.light).not.toHaveBeenCalled();
});

it.each([{ refreshing: true }, { refreshing: false, enabled: false }])('keeps unavailable controls quiet: %o', props => {
  const onRefresh = jest.fn();
  const screen = render(<HapticRefreshControl {...props} onRefresh={onRefresh} />);
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  expect(haptics.light).not.toHaveBeenCalled();
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
