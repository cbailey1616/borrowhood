import React from 'react';
import { DeviceEventEmitter, Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ComposerKeyboardView from '../../../src/components/ComposerKeyboardView';

let mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
let mockHeaderHeight = 103;
let nativeFrame = { y: 120, height: 724 };

jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => mockHeaderHeight }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: () => mockWindow,
}));

const keyboardEvent = (top, height = mockWindow.height - top) => ({
  duration: 0, easing: 'keyboard',
  endCoordinates: { screenX: 0, screenY: top, width: mockWindow.width, height },
});
const emit = async (name, event) => act(async () => DeviceEventEmitter.emit(name, event));
const padding = screen => StyleSheet.flatten(screen.getByTestId('viewport').props.style).paddingBottom;
const contentBottom = screen => nativeFrame.y + nativeFrame.height - padding(screen);
const viewport = props => <ComposerKeyboardView testID="viewport" style={{ flex: 1 }} {...props}><Text>Composer</Text></ComposerKeyboardView>;

beforeEach(() => {
  mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
  mockHeaderHeight = 103;
  nativeFrame = { y: 120, height: 724 };
  View.prototype.measureInWindow.mockReset();
  View.prototype.measureInWindow.mockImplementation(callback => callback(0, nativeFrame.y, mockWindow.width, nativeFrame.height));
  jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
});
afterEach(() => jest.restoreAllMocks());

it('keeps content above the keyboard as the suggestion bar changes height', async () => {
  const screen = render(viewport());
  await emit('keyboardWillShow', keyboardEvent(520));
  expect(contentBottom(screen)).toBe(520);
  await emit('keyboardWillChangeFrame', keyboardEvent(476));
  expect(contentBottom(screen)).toBe(476);
  await emit('keyboardDidChangeFrame', keyboardEvent(480));
  expect(contentBottom(screen)).toBe(480);
  await emit('keyboardWillHide', keyboardEvent(844, 0));
  expect(padding(screen)).toBe(0);
});

it('uses native measurement when navigation underestimates the header and the bottom has an inset', async () => {
  // Native content ends above a 20-point bottom inset. Neither the estimated
  // header nor the entire window height represents this available viewport.
  nativeFrame = { y: 120, height: 704 };
  const screen = render(viewport());
  await emit('keyboardWillShow', keyboardEvent(520));
  expect(contentBottom(screen)).toBe(520);
  expect(padding(screen)).toBe(304);
});

it('remeasures on native layout, header changes and rotation without accumulating padding', async () => {
  const screen = render(viewport());
  await emit('keyboardWillShow', keyboardEvent(520));
  nativeFrame = { y: 140, height: 680 };
  fireEvent(screen.getByTestId('viewport'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 680 } } });
  expect(contentBottom(screen)).toBe(520);
  mockHeaderHeight = 123;
  nativeFrame = { y: 150, height: 694 };
  screen.rerender(viewport());
  expect(contentBottom(screen)).toBe(520);
  mockWindow = { ...mockWindow, width: 844, height: 390 };
  nativeFrame = { y: 32, height: 358 };
  screen.rerender(viewport());
  await emit('keyboardWillChangeFrame', keyboardEvent(220));
  expect(contentBottom(screen)).toBe(220);
  await emit('keyboardWillHide', keyboardEvent(390, 0));
  expect(padding(screen)).toBe(0);
});

it('restores the composer inset when mounted with a keyboard already open', () => {
  Keyboard.metrics.mockReturnValue(keyboardEvent(520).endCoordinates);
  Keyboard.isVisible.mockReturnValue(true);
  const visibility = jest.fn();
  const screen = render(viewport({ onKeyboardVisibilityChange: visibility }));
  expect(contentBottom(screen)).toBe(520);
  expect(visibility).toHaveBeenLastCalledWith(true);
});

it('ignores an older asynchronous measurement after the native viewport moves', async () => {
  const pending = [];
  View.prototype.measureInWindow.mockImplementation(callback => pending.push(callback));
  const screen = render(viewport());
  await emit('keyboardWillShow', keyboardEvent(520));
  const latest = pending.pop();
  await act(async () => latest(0, 120, 390, 724));
  expect(padding(screen)).toBe(324);
  await act(async () => pending.forEach(callback => callback(0, 88, 390, 579)));
  expect(padding(screen)).toBe(324);
});

it('lets Android resize its own window without adding a second keyboard inset', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  // Android has already resized the window down to the keyboard's top.
  mockWindow = { ...mockWindow, height: 520 };
  nativeFrame = { y: 88, height: 432 };
  const visibility = jest.fn();
  const screen = render(viewport({ onKeyboardVisibilityChange: visibility }));
  await emit('keyboardDidShow', keyboardEvent(520, 324));
  expect(contentBottom(screen)).toBe(520);
  expect(padding(screen)).toBe(0);
  expect(visibility).toHaveBeenLastCalledWith(true);
  await emit('keyboardDidHide', keyboardEvent(844, 0));
  expect(visibility).toHaveBeenLastCalledWith(false);
});

it('does not move the whole conversation for a floating iPad keyboard', async () => {
  mockWindow = { ...mockWindow, width: 1024, height: 1366 };
  nativeFrame = { y: 74, height: 1292 };
  const visibility = jest.fn();
  const screen = render(viewport({ onKeyboardVisibilityChange: visibility }));
  await emit('keyboardWillShow', keyboardEvent(1050));
  expect(contentBottom(screen)).toBe(1050);
  await emit('keyboardWillChangeFrame', {
    ...keyboardEvent(850, 264),
    endCoordinates: { screenX: 600, screenY: 850, width: 320, height: 264 },
  });
  expect(padding(screen)).toBe(0);
  expect(visibility).toHaveBeenLastCalledWith(false);
});
