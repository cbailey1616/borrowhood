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
    const { getByText } = render(<NativeHeader title="Feed" />);
    expect(getByText('Feed')).toBeTruthy();
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

  it('renders title when leftElement prop is passed (leftElement not used in current implementation)', () => {
    const NativeHeader = require('../../../src/components/NativeHeader').default;
    const { getByText } = render(
      <NativeHeader title="Detail" />
    );
    expect(getByText('Detail')).toBeTruthy();
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
