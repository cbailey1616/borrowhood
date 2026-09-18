import React from 'react';
import { RefreshControl, Platform } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import AppRefreshControl from '../../../src/components/AppRefreshControl';
import { COLORS } from '../../../src/utils/config';

const originalOS = Platform.OS;
beforeEach(() => { jest.useFakeTimers(); Platform.OS = 'ios'; });
afterEach(() => { jest.useRealTimers(); Platform.OS = originalOS; });

it('applies the iOS color and offset after mounting, before starting a requested refresh', () => {
  const screen = render(<AppRefreshControl refreshing progressViewOffset={180} />);
  const control = () => screen.UNSAFE_getByType(RefreshControl);
  expect(control().props.refreshing).toBe(false);
  expect(control().props.tintColor).toBeUndefined();
  act(() => jest.advanceTimersByTime(500));
  expect(control().props.tintColor).toBe(COLORS.spinner);
  expect(control().props.progressViewOffset).toBe(180);
  expect(control().props.refreshing).toBe(true);
  screen.rerender(<AppRefreshControl refreshing={false} progressViewOffset={180} />);
  expect(control().props.refreshing).toBe(false);
});

it('forwards a pull immediately and does not restart a refresh that finished before mounting', () => {
  const refresh = jest.fn();
  const screen = render(<AppRefreshControl refreshing={false} onRefresh={refresh} />);
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  expect(refresh).toHaveBeenCalledTimes(1);
  screen.rerender(<AppRefreshControl refreshing onRefresh={refresh} />);
  screen.rerender(<AppRefreshControl refreshing={false} onRefresh={refresh} />);
  act(() => jest.advanceTimersByTime(500));
  expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
});

it('cleans up pending mount work when a screen closes', () => {
  const screen = render(<AppRefreshControl refreshing />);
  screen.unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it('keeps Android refresh and colors immediate', () => {
  Platform.OS = 'android';
  const screen = render(<AppRefreshControl refreshing progressViewOffset={180} />);
  const control = screen.UNSAFE_getByType(RefreshControl);
  expect(control.props.refreshing).toBe(true);
  expect(control.props.colors).toEqual([COLORS.spinner]);
  expect(control.props.progressViewOffset).toBe(180);
});
