import React from 'react';
import { render, within } from '@testing-library/react-native';
import VerificationComparison from '../../../src/components/VerificationComparison';
const ReactNative = require('react-native');

const available = [
  'Borrow from friends',
  'Borrow in your neighborhood',
  'Buy items or claim giveaways',
  'Post requests',
];
const townLabel = 'Borrow across town. Without ID verification: not available. Verified: available.';

beforeEach(() => {
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
});
afterEach(() => jest.restoreAllMocks());

it('clearly identifies Town borrowing as requiring identity verification', () => {
  const screen = render(<VerificationComparison />);
  expect(screen.getByText('Without ID')).toBeTruthy();
  expect(screen.getByText('Verified')).toBeTruthy();
  available.forEach(label => {
    expect(screen.getByLabelText(`${label}. Without ID verification: available. Verified: available.`)).toBeTruthy();
  });
  expect(screen.getByLabelText(townLabel)).toBeTruthy();
});

it('keeps availability next to each capability with large text', () => {
  ReactNative.useWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.8 });
  const screen = render(<VerificationComparison />);
  expect(screen.queryByText('Without ID')).toBeNull();
  expect(within(screen.getByLabelText(townLabel)).getByText('Without ID: No\nVerified: Yes')).toBeTruthy();
  available.forEach(label => {
    const row = screen.getByLabelText(`${label}. Without ID verification: available. Verified: available.`);
    expect(within(row).getByText('Without ID: Yes\nVerified: Yes')).toBeTruthy();
  });
});
