import React from 'react';
import { render } from '@testing-library/react-native';
import ListingPrice from '../../../src/components/ListingPrice';

it.each([
  [{ listingType: 'lend', directFee: { amount: 25, unit: 'day' } }, '$25.00 per day'],
  [{ listingType: 'lend', directFee: { amount: 4.5, unit: 'hour' } }, '$4.50 per hour'],
  [{ listingType: 'lend', directFee: { amount: 10, unit: 'flat' } }, '$10.00 flat fee'],
  [{ listingType: 'sell', directFee: { amount: 60, unit: 'day' } }, '$60.00 one-time price'],
  [{ listingType: 'giveaway', directFee: { amount: 60, unit: 'day' } }, 'Free to keep'],
  [{ listingType: 'lend', isFree: true }, 'Free to borrow'],
  [{ listingType: 'sell' }, 'Ask for price'],
])('makes price and payment period explicit for %j', (listing, label) => {
  const screen = render(<ListingPrice listing={listing} />);
  expect(screen.getByLabelText(label)).toBeTruthy();
});
