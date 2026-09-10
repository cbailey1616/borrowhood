import { listingAvailability } from '../src/utils/listingAvailability';

it.each([['reserved','Reserved'], ['borrowed','Borrowed'], ['paused','Paused'], ['sold','Sold'], ['given_away','Given away']])('explains %s without calling it available', (availabilityStatus, label) => {
  expect(listingAvailability({ availabilityStatus, isAvailable: false })).toMatchObject({ label, available: false });
});
it('does not guess borrowed or sold from a false availability flag', () => {
  expect(listingAvailability({ listingType: 'sell', isAvailable: false }).state).toBe('unavailable');
});
