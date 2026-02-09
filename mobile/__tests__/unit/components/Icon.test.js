import React from 'react';
import { render } from '@testing-library/react-native';

describe('Icon', () => {
  beforeEach(() => jest.clearAllMocks());

  it('re-exports Ionicons as default and named export', () => {
    const Icon = require('../../../src/components/Icon');
    expect(Icon.default).toBeDefined();
    expect(Icon.Ionicons).toBeDefined();
    expect(Icon.default).toBe(Icon.Ionicons);
  });

  it('renders with name, size, and color props', () => {
    const { Ionicons } = require('../../../src/components/Icon');
    const { toJSON } = render(<Ionicons name="home" size={24} color="#fff" />);
    expect(toJSON()).toBeTruthy();
  });
});
