import { Animated } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import useFeedHeader from '../../../src/hooks/useFeedHeader';

// Exercise the same Animated graph in JS so pull and rebound offsets can be
// replayed without a native UI thread. The app uses the native driver.
beforeEach(() => {
  const event = Animated.event;
  jest.spyOn(Animated, 'event').mockImplementation((mapping, config) => event(mapping, { ...config, useNativeDriver: false }));
});
afterEach(() => jest.restoreAllMocks());

function measuredHeader(options) {
  const hook = renderHook(props => useFeedHeader(props), { initialProps: options });
  act(() => hook.result.current.onLayout({ nativeEvent: { layout: { height: 180 } } }));
  const position = () => {
    const value = hook.result.current.style.transform[0].translateY;
    return typeof value === 'number' ? value : value.__getValue();
  };
  const scroll = y => {
    act(() => hook.result.current.onScroll({ nativeEvent: { contentOffset: { y } } }));
    return position();
  };
  return { ...hook, position, scroll };
}

it('holds the ribbon at the top throughout pulling, refreshing, and rebounding', () => {
  const header = measuredHeader();
  for (const y of [0, -30, -110, -70, -12, 0, -48, 0]) {
    expect(header.scroll(y)).toBeCloseTo(0);
  }
  // Rebounding from a pull must not count as scrolling down the feed.
  expect(header.scroll(42)).toBeCloseTo(-42);
});

it('hides during browsing and reveals on upward scrolling before reaching the top', () => {
  const header = measuredHeader();
  const offsets = [0, 40, 200, 360, 330, 250, 80, 0, -80, 0];
  const positions = [0, -40, -180, -180, -150, -70, 0, 0, 0, 0];
  offsets.forEach((y, index) => expect(header.scroll(y)).toBeCloseTo(positions[index]));
});

it('keeps focused search visible and resumes hiding when focus leaves', () => {
  const header = measuredHeader({ pinned: false });
  expect(header.scroll(90)).toBeCloseTo(-90);
  header.rerender({ pinned: true });
  expect(header.position()).toBe(0);
  expect(header.scroll(-80)).toBe(0);
  header.rerender({ pinned: false });
  expect(header.scroll(0)).toBeCloseTo(0);
  expect(header.scroll(60)).toBeCloseTo(-60);
});

it('preserves the grid header behavior and resets when the column count changes', () => {
  const header = measuredHeader({ columns: 2 });
  const offsets = [0, -80, 0, 70, 200, 500, 450, 100, 0];
  const positions = [0, 0, 0, -70, -180, -180, -180, -100, 0];
  offsets.forEach((y, index) => expect(header.scroll(y)).toBeCloseTo(positions[index]));
  header.scroll(500);
  header.rerender({ columns: 1 });
  expect(header.position()).toBeCloseTo(0);
});
