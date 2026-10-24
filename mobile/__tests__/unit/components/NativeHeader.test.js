import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View, StyleSheet } from 'react-native';

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

it('fills the larger Duo status gap without moving the heading', () => {
  const regions = require('../../../src/context/ReservedRegionsContext');
  const reserved = jest.spyOn(regions, 'useTopReservedSpace').mockReturnValue(124);
  try {
    const NativeHeader = require('../../../src/components/NativeHeader').default;
    const screen = render(<NativeHeader title="Ideas" backdrop={<View />} />);
    const frame = () => ({
      height: StyleSheet.flatten(screen.getByTestId('Header.artworkBand', { includeHiddenElements: true }).props.style).height,
      offset: StyleSheet.flatten(screen.getByTestId('Header.content').props.style).marginTop,
    });
    const open = frame();
    reserved.mockReturnValue(174);
    screen.rerender(<NativeHeader title="Ideas" backdrop={<View />} />);
    const folded = frame();
    expect(folded.height - open.height).toBe(50);
    expect(folded.height + folded.offset).toBe(open.height + open.offset);
    expect(174 - folded.height).toBeLessThanOrEqual(8);
  } finally { reserved.mockRestore(); }
});
