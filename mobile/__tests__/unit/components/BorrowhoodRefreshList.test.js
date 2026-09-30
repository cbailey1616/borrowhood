import React from 'react';
import { AccessibilityInfo, Animated, FlatList, Platform, RefreshControl, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import BorrowhoodRefreshList, {MIN_REFRESH_MS, REBOUND_MS, SPIN_MS} from '../../../src/components/BorrowhoodRefreshList';
import BorrowhoodRefreshScrollView from '../../../src/components/BorrowhoodRefreshScrollView';
import { COLORS } from '../../../src/utils/config';
import {haptics} from '../../../src/utils/haptics';
jest.mock('../../../src/utils/haptics',()=>({haptics:{light:jest.fn()}}));

let mockFocused = true;
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>mockFocused}));
let removeListener;
let motionChanged;
let startAnimation;
let stopAnimation;

beforeEach(() => {
  mockFocused = true;
  jest.useFakeTimers();
  jest.clearAllMocks();
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

afterEach(() => {jest.restoreAllMocks();jest.useRealTimers();});

const listProps = {
  testID: 'Refresh.list',
  data: [{ id: 'one' }],
  keyExtractor: item => item.id,
  renderItem: () => <Text>Existing post</Text>,
};
const value = node => typeof node === 'number' ? node : node.__getValue();
const style = (screen, id) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);
const transform = (screen, name) => value(style(screen, 'BorrowhoodRefresh.logo').transform.find(entry => name in entry)[name]);
const scroll = (screen, y) => { fireEvent(screen.getByTestId('Refresh.list'), 'scrollBeginDrag'); return fireEvent.scroll(screen.getByTestId('Refresh.list'), { nativeEvent: {
  contentOffset: { x: 0, y }, contentSize: { width: 390, height: 1000 }, layoutMeasurement: { width: 390, height: 700 },
} }); };
const ready = async () => { await act(async () => {}); };

it('stretches the existing hat with the pull, caps it, and hides when released or browsing', async () => {
  const onRefresh = jest.fn();
  const screen = render(<BorrowhoodRefreshList {...listProps} refreshing={false} onRefresh={onRefresh} progressViewOffset={210} />);
  await ready(screen);
  expect(style(screen, 'BorrowhoodRefresh.indicator').top).toBe(-28);
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

it('keeps a fast native refresh visible for the rebound and spin without resetting scroll', async () => {
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
  expect(nativeControl().props.refreshing).toBe(true);
  act(()=>jest.advanceTimersByTime(MIN_REFRESH_MS-1));
  expect(nativeControl().props.refreshing).toBe(true);
  act(()=>jest.advanceTimersByTime(1));
  expect(nativeControl().props.refreshing).toBe(false);
  expect(screen.queryByLabelText('Refreshing')).toBeNull();
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  expect(stopAnimation).toHaveBeenCalledTimes(1);
  expect(scrollToOffset).not.toHaveBeenCalled();
  expect(haptics.light).toHaveBeenCalledTimes(2);
});
it('gives one threshold haptic per pull and avoids a second trigger tap',async()=>{
 const onRefresh=jest.fn();
 const screen=render(<BorrowhoodRefreshList {...listProps} refreshing={false} onRefresh={onRefresh}/>);
 await ready();
 scroll(screen,-80);scroll(screen,-100);scroll(screen,-90);
 expect(haptics.light).toHaveBeenCalledTimes(1);
 fireEvent(screen.UNSAFE_getByType(RefreshControl),'refresh');
 expect(haptics.light).toHaveBeenCalledTimes(1);
 fireEvent(screen.UNSAFE_getByType(RefreshControl),'refresh');
 expect(onRefresh).toHaveBeenCalledTimes(1);
 act(()=>jest.advanceTimersByTime(MIN_REFRESH_MS));
 expect(haptics.light).toHaveBeenCalledTimes(2);
});
it('does not give a completion haptic after leaving the page',async()=>{
 const screen=render(<BorrowhoodRefreshList {...listProps} refreshing={false} onRefresh={jest.fn()}/>);
 await ready();
 fireEvent(screen.UNSAFE_getByType(RefreshControl),'refresh');
 screen.unmount();
 act(()=>jest.advanceTimersByTime(MIN_REFRESH_MS));
 expect(haptics.light).toHaveBeenCalledTimes(1);
});

it('keeps the hat behind the feed and hides it as the content snaps back while still refreshing', async () => {
  const screen = render(<BorrowhoodRefreshList {...listProps} refreshing onRefresh={jest.fn()} progressViewOffset={210} />);
  await ready();
  expect(screen.toJSON().children[0].props.testID).toBe('BorrowhoodRefresh.indicator');
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  scroll(screen, -80);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(1);
  const pulledPosition = value(style(screen, 'BorrowhoodRefresh.indicator').transform[0].translateY);
  scroll(screen, -5);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBeLessThan(1);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').transform[0].translateY)).toBeLessThan(pulledPosition);
  scroll(screen, 0);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
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

it('reveals the Feed hat below its pinned ribbon and above its first tile', async () => {
  const headerHeight = 240;
  const screen = render(<BorrowhoodRefreshList {...listProps} refreshing={false} onRefresh={jest.fn()} indicatorTop={headerHeight} />);
  await ready();
  scroll(screen, -80);
  const indicator = style(screen, 'BorrowhoodRefresh.indicator');
  const hatTop = indicator.top + value(indicator.transform[0].translateY);
  expect(hatTop).toBeGreaterThanOrEqual(headerHeight);
  expect(hatTop + indicator.height).toBeLessThanOrEqual(headerHeight + 80);
  scroll(screen, 0);
  expect(value(style(screen, 'BorrowhoodRefresh.indicator').opacity)).toBe(0);
});

it('gives Ideas the same stretch, full-turn hold and haptics while retaining its keyboard scroll view', async () => {
  const onRefresh = jest.fn();
  const screen = render(<BorrowhoodRefreshScrollView testID="Refresh.list" refreshing={false} onRefresh={onRefresh}
    extraScrollHeight={32} keyboardShouldPersistTaps="handled"><Text>Existing plan</Text></BorrowhoodRefreshScrollView>);
  await ready();
  scroll(screen, -80);
  expect(transform(screen, 'scaleY')).toBeGreaterThan(1);
  expect(haptics.light).toHaveBeenCalledTimes(1);
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(startAnimation).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('Refresh.list').props.extraScrollHeight).toBe(32);
  expect(screen.getByTestId('Refresh.list').props.keyboardShouldPersistTaps).toBe('handled');
  act(() => jest.advanceTimersByTime(MIN_REFRESH_MS - 1));
  expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
  act(() => jest.advanceTimersByTime(1));
  expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  expect(haptics.light).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Existing plan')).toBeTruthy();
});

it('allows a complete 360 degree spin after the rebound on fast responses', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  const screen = render(<BorrowhoodRefreshList {...listProps} refreshing onRefresh={jest.fn()} />);
  await ready();
  expect(timing.mock.calls.some(([, config]) => config.duration === REBOUND_MS)).toBe(true);
  expect(timing.mock.calls.some(([, config]) => config.duration === SPIN_MS && config.toValue === 1)).toBe(true);
  expect(MIN_REFRESH_MS).toBeGreaterThan(REBOUND_MS + SPIN_MS);
  expect(style(screen, 'BorrowhoodRefresh.logo').width).toBe(56);
  scroll(screen, -80);
  const indicator = style(screen, 'BorrowhoodRefresh.indicator');
  expect(indicator.top + value(indicator.transform[0].translateY)).toBeGreaterThanOrEqual(0);
  expect(indicator.top + value(indicator.transform[0].translateY) + indicator.height).toBeLessThanOrEqual(80);
});

it('hides a stale negative offset after release and when mounted without a pull', async () => {
  const scrollY = new Animated.Value(-40);
  const screen = render(<BorrowhoodRefreshList {...listProps} scrollY={scrollY} refreshing={false} onRefresh={jest.fn()} />);
  await ready();
  expect(value(style(screen,'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  scroll(screen,-90);
  expect(value(style(screen,'BorrowhoodRefresh.indicator').opacity)).toBe(1);
  fireEvent(screen.getByTestId('Refresh.list'),'scrollEndDrag',{nativeEvent:{contentOffset:{x:0,y:-90},velocity:{x:0,y:0}}});
  expect(value(style(screen,'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  act(()=>scrollY.setValue(-30));
  expect(value(style(screen,'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  expect(scrollY.__getValue()).toBe(-30);
});

it('clears a partial pull when leaving Home and keeps it hidden on return', async () => {
  const scrollY = new Animated.Value(0);
  const props = {...listProps,scrollY,refreshing:false,onRefresh:jest.fn()};
  const screen = render(<BorrowhoodRefreshList {...props} />);
  await ready();
  scroll(screen,-40);
  expect(value(style(screen,'BorrowhoodRefresh.indicator').opacity)).toBe(1);
  mockFocused=false; screen.rerender(<BorrowhoodRefreshList {...props} />);
  expect(value(style(screen,'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  mockFocused=true; screen.rerender(<BorrowhoodRefreshList {...props} />);
  expect(value(style(screen,'BorrowhoodRefresh.indicator').opacity)).toBe(0);
  expect(scrollY.__getValue()).toBe(-40);
  scroll(screen,-80);
  expect(value(style(screen,'BorrowhoodRefresh.indicator').opacity)).toBe(1);
});
