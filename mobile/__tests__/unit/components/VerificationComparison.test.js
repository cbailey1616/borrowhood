import React from 'react';
import { render, within } from '@testing-library/react-native';
import VerificationComparison from '../../../src/components/VerificationComparison';
const ReactNative = require('react-native');
beforeEach(() => jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 }));
afterEach(() => jest.restoreAllMocks());
it('distinguishes Town previews from borrowing while keeping friends and neighborhood access', () => {
  const screen = render(<VerificationComparison />);
  expect(screen.getByLabelText('Borrow from friends and neighbors. Not verified: Yes. Verified: Yes.')).toBeTruthy();
  expect(screen.getByLabelText('Browse Town borrowing. Not verified: Preview. Verified: Yes.')).toBeTruthy();
  expect(screen.getByLabelText('Borrow across Town. Not verified: No. Verified: Yes.')).toBeTruthy();
  expect(screen.getByLabelText('Have a verified badge. Not verified: No. Verified: Yes.')).toBeTruthy();
});
it('keeps labels and availability together with large text', () => {
  ReactNative.useWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.8 });
  const screen = render(<VerificationComparison />);
  expect(screen.queryByText('Not verified')).toBeNull();
  const row = screen.getByLabelText('Browse Town borrowing. Not verified: Preview. Verified: Yes.');
  expect(within(row).getByText('Not verified: Preview\nVerified: Yes')).toBeTruthy();
});
