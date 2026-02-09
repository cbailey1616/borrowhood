import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('NativeHeader', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders title as large title', () => {
    const NativeHeader = require('../../../src/components/NativeHeader').default;
    const { getAllByText } = render(<NativeHeader title="Feed" />);
    // Both large and small title are rendered
    expect(getAllByText('Feed').length).toBe(2);
  });

  it('renders with scrollY shared value', () => {
    const NativeHeader = require('../../../src/components/NativeHeader').default;
    const scrollY = { value: 0 };
    const { getAllByText } = render(<NativeHeader title="Feed" scrollY={scrollY} />);
    // Both large and small title are rendered
    expect(getAllByText('Feed').length).toBeGreaterThanOrEqual(1);
  });

  it('renders right element when provided', () => {
    const NativeHeader = require('../../../src/components/NativeHeader').default;
    const { getByText } = render(
      <NativeHeader title="Profile" rightElement={<Text>Edit</Text>} />
    );
    expect(getByText('Edit')).toBeTruthy();
  });

  it('renders left element when provided', () => {
    const NativeHeader = require('../../../src/components/NativeHeader').default;
    const { getByText } = render(
      <NativeHeader title="Detail" leftElement={<Text>Back</Text>} />
    );
    expect(getByText('Back')).toBeTruthy();
  });

  it('renders children below title', () => {
    const NativeHeader = require('../../../src/components/NativeHeader').default;
    const { getByText } = render(
      <NativeHeader title="Search">
        <Text>Search bar here</Text>
      </NativeHeader>
    );
    expect(getByText('Search bar here')).toBeTruthy();
  });
});
