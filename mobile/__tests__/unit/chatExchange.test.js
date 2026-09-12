import { exchangesWith, exchangeAction } from '../../src/utils/chatExchange';
const t = { id: '1', borrower: { id: 'a' }, lender: { id: 'b' }, listing: { id: 'drill' }, status: 'pending' };
it('only pins active exchanges between these exact chat participants', () => {
  expect(exchangesWith([t, { ...t, id: 'other', lender: { id: 'c' } }, { ...t, id: 'done', status: 'completed' }], 'a', 'b')).toEqual([t]);
  expect(exchangesWith([t], 'a', undefined)).toEqual([]);
});
it('prioritizes the chat item while preserving other exchanges', () => {
  expect(exchangesWith([{ ...t, id: '2', listing: { id: 'ladder' } }, t], 'b', 'a', 'drill').map(x => x.id)).toEqual(['1', '2']);
});
it('routes the lender to the queue and lets either participant confirm the handoff', () => {
  expect(exchangeAction(t, 'b')).toEqual({ label: 'View queue', screen: 'RequestQueue', params: { listingId: 'drill' } });
  expect(exchangeAction(t, 'a').method).toBeUndefined();
  expect(exchangeAction(t, 'a').screen).toBeUndefined();
  expect(exchangeAction({ ...t, status: 'approved' }, 'a').method).toBe('confirmRentalPickup');
  expect(exchangeAction({ ...t, status: 'approved' }, 'b')).toEqual(expect.objectContaining({ method: 'confirmRentalPickup', confirmation: 'Only confirm once you have handed the item to your neighbor.' }));
  expect(exchangeAction({ ...t, status: 'approved' }, 'stranger').method).toBeUndefined();
  expect(exchangeAction({ ...t, status: 'approved', actualPickupAt: '2026-09-11' }, 'b').method).toBeUndefined();
  expect(exchangeAction({ ...t, status: 'approved', hasDispute: true }, 'b').method).toBeUndefined();
});
it('uses the queue for legacy pending requests and details when listing context is missing', () => {
  expect(exchangeAction({ ...t, rentalFee: 5 }, 'b')).toEqual({ label: 'View queue', screen: 'RequestQueue', params: { listingId: 'drill' } });
  expect(exchangeAction({ ...t, listing: null }, 'b')).toEqual({ label: 'Borrow details' });
});
it('keeps return condition checks on the details screen and never requests a giveaway return', () => {
  expect(exchangeAction({ ...t, status: 'picked_up' }, 'a')).toEqual({ label: 'Mark returned' });
  expect(exchangeAction({ ...t, status: 'return_pending' }, 'b')).toEqual({ label: 'Confirm return' });
  expect(exchangeAction({ ...t, status: 'picked_up', listingType: 'giveaway' }, 'a').label).toBe('Borrow details');
});
