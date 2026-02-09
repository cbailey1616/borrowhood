import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

const { haptics } = require('../../../src/utils/haptics');

describe('HapticPressable', () => {
  beforeEach(() => jest.clearAllMocks());

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
