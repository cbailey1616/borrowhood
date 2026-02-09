import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('AnimatedCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders children', () => {
    const AnimatedCard = require('../../../src/components/AnimatedCard').default;
    const { getByText } = render(
      <AnimatedCard index={0}><Text>Card content</Text></AnimatedCard>
    );
    expect(getByText('Card content')).toBeTruthy();
  });

  it('fires onPress handler when provided', () => {
    const AnimatedCard = require('../../../src/components/AnimatedCard').default;
    const onPress = jest.fn();
    const { getByText } = render(
      <AnimatedCard index={0} onPress={onPress}><Text>Pressable card</Text></AnimatedCard>
    );
    fireEvent.press(getByText('Pressable card'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renders with index prop for animation delay', () => {
    const AnimatedCard = require('../../../src/components/AnimatedCard').default;
    const { toJSON } = render(
      <AnimatedCard index={3}><Text>Delayed</Text></AnimatedCard>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('applies custom style', () => {
    const AnimatedCard = require('../../../src/components/AnimatedCard').default;
    const { toJSON } = render(
      <AnimatedCard index={0} style={{ marginBottom: 10 }}><Text>Styled</Text></AnimatedCard>
    );
    expect(toJSON()).toBeTruthy();
  });
});
