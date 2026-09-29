import React from 'react';
import { AccessibilityInfo, Animated, FlatList, Platform, RefreshControl, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import BorrowhoodRefreshList from '../../../src/components/BorrowhoodRefreshList';
import { COLORS } from '../../../src/utils/config';

let removeListener;
let motionChanged;
let startAnimation;
let stopAnimation;

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  removeListener = jest.fn();
  startAnimation = jest.fn();
  stopAnimation = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, callback) => {
    motionChanged = callback;
    return { remove: removeListener };
  });
  jest.spyOn(Animated, 'sequence').mockReturnValue({ start: startAnimation, stop: stopAnimation });
  const event = Animated.event;
  jest.spyOn(Animated, 'event').mockImplementation((mapping, config) => event(mapping, { ...config, useNativeDriver: false }));
});

afterEach(() => jest.restoreAllMocks());

const listProps = {
  testID: 'Refresh.list',
  data: [{ id: 'one' }],
  keyExtractor: item => item.id,
  renderItem: () => <Text>Existing post</Text>,
};
const value = node => typeof node === 'number' ? node : node.__getValue();
const style = (screen, id) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);
const transform = (screen, name) => value(style(screen, 'BorrowhoodRefresh.logo').transform.find(entry => name in entry)[name]);
const scroll = (screen, y) => fireEvent.scroll(screen.getByTestId('Refresh.list'), { nativeEvent: {
  contentOffset: { x: 0, y }, contentSize: { width: 390, height: 1000 }, layoutMeasurement: { width: 390, height: 700 },
} });
const ready = async () => { await act(async () => {}); };

it('stretches the existing hat with the pull, caps it, and hides when released or browsing', async () => {
  const onRefresh = jest.fn();
  const screen = render(<BorrowhoodRefreshList {...listProps} refreshing={false} onRefresh={onRefresh} progressViewOffset={210} />);
  await ready(screen);
  expect(style(screen, 'BorrowhoodRefresh.indicator').top).toBe(188);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  scroll(screen, -120);
  expect(transform(screen, 'scaleY')).toBeGreaterThan(1);
  expect(transform(screen, 'scaleX')).toBeLessThan(1);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(1);
  expect(onRefresh).not.toHaveBeenCalled();
  scroll(screen, -500);
  expect(transform(screen, 'scaleY')).toBeCloseTo(1.65);
  expect(transform(screen, 'scaleX')).toBeCloseTo(0.78);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').transform[0].translateY)).toBe(100);
  for (const y of [-40, 0, 80, 0]) scroll(screen, y);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  expect(startAnimation).not.toHaveBeenCalled();
});

it('lets the native control trigger and finish refreshing without a timer or scroll reset', async () => {
  const onRefresh = jest.fn();
  const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  const props = { ...listProps, onRefresh, progressViewOffset: 210 };
  const screen = render(<BorrowhoodRefreshList {...props} refreshing={false} />);
  await ready(screen);
  const nativeControl = () => screen.UNSAFE_getByType(RefreshControl);
  expect(nativeControl().props.tintColor).toBe('transparent');
  expect(nativeControl().props.progressViewOffset).toBe(210);
  fireEvent(nativeControl(), 'refresh');
  expect(onRefresh).toHaveBeenCalledTimes(1);
  screen.rerender(<BorrowhoodRefreshList {...props} refreshing />);
  expect(nativeControl().props.refreshing).toBe(true);
  expect(screen.getByLabelText('Refreshing').props.accessibilityState).toEqual({ busy: true });
  expect(startAnimation).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Existing post')).toBeTruthy();
  scroll(screen, 80);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  scroll(screen, 0);
  screen.rerender(<BorrowhoodRefreshList {...props} refreshing={false} />);
  expect(nativeControl().props.refreshing).toBe(false);
  expect(screen.queryByLabelText('Refreshing')).toBeNull();
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  expect(stopAnimation).toHaveBeenCalledTimes(1);
  expect(scrollToOffset).not.toHaveBeenCalled();
});

it('uses an existing native scroll animation value without stealing its handler', async () => {
  const scrollY = new Animated.Value(0);
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false });
  const screen = render(<BorrowhoodRefreshList {...listProps} refreshing={false} onRefresh={jest.fn()} scrollY={scrollY} onScroll={onScroll} />);
  await ready(screen);
  scroll(screen, -120);
  expect(scrollY.__getValue()).toBe(-120);
  expect(transform(screen, 'scaleY')).toBeGreaterThan(1);
  scroll(screen, 120);
  expect(scrollY.__getValue()).toBe(120);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(0);
});

it('keeps the hat still for Reduce Motion and reacts to settings changing during refresh', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
  const props = { ...listProps, onRefresh: jest.fn() };
  const screen = render(<BorrowhoodRefreshList {...props} refreshing />);
  await act(async () => {});
  scroll(screen, -120);
  expect(transform(screen, 'scaleX')).toBe(1);
  expect(transform(screen, 'scaleY')).toBe(1);
  expect(startAnimation).not.toHaveBeenCalled();
  act(() => motionChanged(false));
  expect(startAnimation).toHaveBeenCalledTimes(1);
  act(() => motionChanged(true));
  expect(stopAnimation).toHaveBeenCalledTimes(1);
  expect(transform(screen, 'scaleY')).toBe(1);
  screen.unmount();
  expect(removeListener).toHaveBeenCalledTimes(1);
});

it('stops the loading animation when the page unmounts', async () => {
  const screen = render(<BorrowhoodRefreshList {...listProps} refreshing onRefresh={jest.fn()} />);
  await ready(screen);
  expect(startAnimation).toHaveBeenCalledTimes(1);
  screen.unmount();
  expect(stopAnimation).toHaveBeenCalledTimes(1);
  expect(removeListener).toHaveBeenCalledTimes(1);
});

it('does not overwrite a changed motion preference with an older pending read', async () => {
  let resolvePreference;
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => new Promise(resolve => { resolvePreference = resolve; }));
  const screen = render(<BorrowhoodRefreshList {...listProps} refreshing onRefresh={jest.fn()} />);
  act(() => motionChanged(true));
  await act(async () => resolvePreference(false));
  expect(transform(screen, 'scaleY')).toBe(1);
  expect(startAnimation).not.toHaveBeenCalled();
});

it('preserves the native Android indicator and refresh gesture', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const onRefresh = jest.fn();
  const screen = render(<BorrowhoodRefreshList {...listProps} refreshing={false} onRefresh={onRefresh} />);
  const nativeControl = screen.UNSAFE_getByType(RefreshControl);
  expect(nativeControl.props.colors).toEqual([COLORS.spinner]);
  expect(screen.queryByTestId('BorrowhoodRefresh.indicator')).toBeNull();
  fireEvent(nativeControl, 'refresh');
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
