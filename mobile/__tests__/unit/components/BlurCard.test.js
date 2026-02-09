import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('BlurCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders children', () => {
    const BlurCard = require('../../../src/components/BlurCard').default;
    const { getByText } = render(
      <BlurCard><Text>Hello</Text></BlurCard>
    );
    expect(getByText('Hello')).toBeTruthy();
  });

  it('passes style prop', () => {
    const BlurCard = require('../../../src/components/BlurCard').default;
    const { toJSON } = render(
      <BlurCard style={{ marginTop: 10 }}><Text>Styled</Text></BlurCard>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with testID and accessibilityLabel', () => {
    const BlurCard = require('../../../src/components/BlurCard').default;
    const { getByTestId } = render(
      <BlurCard testID="test-card" accessibilityLabel="Test card">
        <Text>Content</Text>
      </BlurCard>
    );
    expect(getByTestId('test-card')).toBeTruthy();
  });
});
