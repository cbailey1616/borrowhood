import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text, StyleSheet } from 'react-native';

let mockReduceMotion = false;
jest.mock('../../../src/hooks/useReduceMotion', () => ({ __esModule: true, default: () => mockReduceMotion }));

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

const { haptics } = require('../../../src/utils/haptics');

describe('HapticPressable', () => {
  beforeEach(() => { jest.clearAllMocks(); mockReduceMotion = false; });

  it('keeps normal taps and long presses quiet by default', () => {
    const HapticPressable = require('../../../src/components/HapticPressable').default;
    const onLongPress = jest.fn();
    const screen = render(<HapticPressable onPress={() => {}} onLongPress={onLongPress}><Text>Quiet row</Text></HapticPressable>);
    fireEvent.press(screen.getByText('Quiet row'));
    fireEvent(screen.getByText('Quiet row'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
    Object.values(haptics).forEach(feedback => expect(feedback).not.toHaveBeenCalled());
  });

  it('uses explicit long-press feedback without adding feedback to a normal tap', () => {
    const HapticPressable = require('../../../src/components/HapticPressable').default;
    const screen = render(<HapticPressable onPress={() => {}} onLongPress={() => {}} longPressHaptic="selection"><Text>Reactions</Text></HapticPressable>);
    fireEvent.press(screen.getByText('Reactions'));
    expect(haptics.selection).not.toHaveBeenCalled();
    fireEvent(screen.getByText('Reactions'), 'longPress');
    expect(haptics.selection).toHaveBeenCalledTimes(1);
  });

  it('highlights a pressed row and respects Reduce Motion for an opted-in scale', () => {
    const HapticPressable = require('../../../src/components/HapticPressable').default;
    const spring = jest.spyOn(require('react-native-reanimated'), 'withSpring');
    mockReduceMotion = true;
    const screen = render(<HapticPressable testID="row" scaleDown={0.97} pressedBackgroundColor="sage" style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}><Text>Row</Text></HapticPressable>);
    fireEvent(screen.getByTestId('row'), 'pressIn');
    expect(StyleSheet.flatten(screen.getByTestId('row').props.style)).toMatchObject({ backgroundColor: 'sage', opacity: 0.9 });
    expect(spring).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('row'), 'pressOut');
    expect(StyleSheet.flatten(screen.getByTestId('row').props.style).opacity).toBe(1);
    spring.mockRestore();
  });

  it('fires onPress callback', () => {
    const HapticPressable = require('../../../src/components/HapticPressable').default;
    const onPress = jest.fn();
    const { getByText } = render(
      <HapticPressable onPress={onPress}><Text>Tap</Text></HapticPressable>
    );
    fireEvent.press(getByText('Tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('triggers haptic feedback on press', () => {
    const HapticPressable = require('../../../src/components/HapticPressable').default;
    const { getByText } = render(
      <HapticPressable onPress={() => {}} haptic="light"><Text>Tap</Text></HapticPressable>
    );
    fireEvent.press(getByText('Tap'));
    expect(haptics.light).toHaveBeenCalled();
  });

  it('respects disabled state', () => {
    const HapticPressable = require('../../../src/components/HapticPressable').default;
    const onPress = jest.fn();
    const { getByText } = render(
      <HapticPressable onPress={onPress} disabled><Text>Disabled</Text></HapticPressable>
    );
    fireEvent.press(getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('supports custom haptic type', () => {
    const HapticPressable = require('../../../src/components/HapticPressable').default;
    const { getByText } = render(
      <HapticPressable onPress={() => {}} haptic="medium"><Text>Medium</Text></HapticPressable>
    );
    fireEvent.press(getByText('Medium'));
    expect(haptics.medium).toHaveBeenCalled();
  });

  it('passes accessibility props', () => {
    const HapticPressable = require('../../../src/components/HapticPressable').default;
    const { getByLabelText } = render(
      <HapticPressable
        onPress={() => {}}
        accessibilityLabel="Submit button"
        accessibilityRole="button"
      >
        <Text>Submit</Text>
      </HapticPressable>
    );
    expect(getByLabelText('Submit button')).toBeTruthy();
  });
});
