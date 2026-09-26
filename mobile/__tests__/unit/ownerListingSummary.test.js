import { activeLendingExchange, lendingDetails, listingSharingDetails } from '../../src/utils/ownerListingSummary';

const now = new Date('2026-09-25T22:00:00');
const borrowed = { id: 'current', status: 'picked_up', isBorrower: false, listingType: 'lend', listing: { id: 'ladder' }, borrower: { firstName: 'Alex' } };

it('shows the current lender exchange instead of another item, incoming queue, or history', () => {
  const exchanges = [
    { ...borrowed, id: 'other-item', listing: { id: 'drill' } },
    { ...borrowed, id: 'outgoing', isBorrower: true },
    { ...borrowed, id: 'pending', status: 'pending' },
    { ...borrowed, id: 'completed', status: 'completed' },
    { ...borrowed, id: 'later-pickup', status: 'approved' },
    borrowed,
  ];
  expect(activeLendingExchange({ id: 'ladder' }, exchanges, 'owner')).toBe(borrowed);
});

it.each([
  ['2026-09-24T00:00:00.000Z', 'Overdue · due Sep 24'],
  ['2026-09-25', 'Due back today'],
  ['2026-09-26', 'Due back tomorrow'],
  ['2026-09-28', 'Due Sep 28'],
])('shows the agreed return date %s as a calendar date', (endDate, timing) => {
  expect(lendingDetails({ ...borrowed, endDate }, now)).toMatchObject({ person: 'With Alex', timing });
});

it('stops calling a returned item overdue while the owner needs to confirm it', () => {
  expect(lendingDetails({ ...borrowed, status: 'return_pending', endDate: '2026-09-01' }, now)).toMatchObject({ timing: 'Return ready to confirm', attention: true });
  expect(lendingDetails({ ...borrowed, status: 'return_pending', endDate: '2026-09-01' }, now).overdue).not.toBe(true);
});

it.each(['giveaway', 'sell'])('never displays a return date for a %s', listingType => {
  expect(lendingDetails({ ...borrowed, listingType, endDate: '2026-09-01' }, now).timing).toBe('');
  expect(lendingDetails({ ...borrowed, listingType, status: 'approved', startDate: '2026-09-01' }, now))
    .toMatchObject({ person: 'Pickup with Alex', timing: 'Ready for pickup' });
});

it('shows pickup follow-up and invalid dates without a misleading return deadline', () => {
  expect(lendingDetails({ ...borrowed, status: 'approved', pickupReview: { needed: true } }, now).timing).toBe('Check whether it was picked up');
  expect(lendingDetails({ ...borrowed, endDate: 'not-a-date' }, now).timing).toBe('');
});

it('shows every selected audience and keeps unreviewed sharing private', () => {
  expect(listingSharingDetails({ visibility: 'close_friends,neighborhood,town' }).label).toBe('Friends · Neighborhood · Town');
  expect(listingSharingDetails({ visibility: ['town'] }).label).toBe('Town');
  expect(listingSharingDetails({ visibility: ['private'] }).label).toBe('Only you');
  expect(listingSharingDetails({ visibility: ['town'], sharingReviewRequired: true }).label).toBe('Private · review sharing');
});
