import { nextHomeAction, exchangeHomeAction, exchangeStatus } from '../../src/utils/homeAction';

const now = new Date('2026-09-16T12:00:00');
const exchange = { id: 'ladder-borrow', status: 'picked_up', isBorrower: true,
  listing: { id: 'ladder', title: 'Ladder' }, endDate: '2026-09-20' };
const action = overrides => exchangeHomeAction({ ...exchange, ...overrides }, 'me', now);

it.each(['pending', 'completed', 'declined', 'cancelled', 'returned', 'return_pending'])('does not interrupt the borrower for %s', status => {
  expect(action({ status })).toBeNull();
});

it('keeps quiet borrows, completed handoffs, and unknown roles off Home', () => {
  expect(action({})).toBeNull();
  expect(action({ endDate: 'invalid' })).toBeNull();
  expect(action({ endDate: '2026-09-15', listingType: 'sell' })).toBeNull();
  expect(action({ endDate: '2026-09-15', listingType: 'giveaway' })).toBeNull();
  expect(action({ isBorrower: undefined, status: 'approved' })).toBeNull();
  expect(action({ isBorrower: false, endDate: '2026-09-15' })).toBeNull();
});

it.each([
  ['2026-09-15', 'Ladder overdue', 'Overdue'],
  ['2026-09-16', 'Ladder due back today', 'Due back today'],
  ['2026-09-17', 'Ladder due back tomorrow', 'Due back tomorrow'],
])('names the item and calendar deadline for %s', (endDate, title, status) => {
  expect(action({ endDate })).toMatchObject({ title, label: 'View details', destination: { name: 'TransactionDetail', params: { id: exchange.id } } });
  expect(exchangeStatus({ ...exchange, endDate }, 'me', now)).toBe(status);
});

it('groups incoming requests and opens their queue directly', () => {
  const pending = ['sam', 'jo'].map(id => ({ ...exchange, id, status: 'pending', isBorrower: false, borrower: { id } }));
  expect(nextHomeAction(pending, [], 'me', now)).toMatchObject({ title: '2 requests for Ladder', label: 'Review requests',
    destination: { name: 'RequestQueue', params: { listingId: 'ladder' } } });
  expect(nextHomeAction(pending.slice(0, 1), [], 'me', now).title).toBe('Someone wants Ladder');
});

it('keeps return confirmation available until completion even without unread updates', () => {
  expect(action({ isBorrower: false, status: 'returned', paymentStatus: 'authorized' })).toMatchObject({ title: 'Was Ladder returned?', label: 'Confirm return' });
  expect(action({ isBorrower: false, status: 'return_pending' }).label).toBe('Confirm return');
  expect(action({ isBorrower: false, status: 'returned', paymentStatus: 'released' })).toBeNull();
});

it.each([true, false])('opens pickup details for borrower=%s', isBorrower => {
  expect(action({ isBorrower, status: 'approved' })).toMatchObject({ title: 'Ladder ready for pickup', label: 'View pickup' });
  expect(action({ isBorrower, status: 'paid', actualPickupAt: now.toISOString() })).toBeNull();
});

it('shows just the highest-priority action and moves to the next after it resolves', () => {
  const request = { ...exchange, id: 'request', status: 'pending', isBorrower: false };
  const overdue = { ...exchange, endDate: '2026-09-15' };
  expect(nextHomeAction([request, overdue], [], 'me', now).id).toBe(exchange.id);
  expect(nextHomeAction([request, { ...overdue, status: 'returned' }], [], 'me', now).destination.name).toBe('RequestQueue');
});

it('asks only the owner to review a missed pickup and removes that prompt after an extension', () => {
  const pickupReview = { needed: true };
  expect(action({ status: 'paid', isBorrower: false, pickupReview })).toMatchObject({ title: 'Was Ladder picked up?', label: 'Review pickup' });
  expect(action({ status: 'paid', isBorrower: true, pickupReview }).label).toBe('View pickup');
  expect(action({ status: 'paid', isBorrower: false, pickupReview: { needed: false } }).label).toBe('View pickup');
  expect(action({ status: 'paid', isBorrower: false, pickupReview, hasDispute: true })).toBeNull();
  expect(action({ status: 'paid', isBorrower: false, pickupReview, actualPickupAt: now.toISOString() })).toBeNull();
});

it('shows a dispute only when this person has a response to give', () => {
  const issue = { id: 'issue', status: 'awaitingResponse', respondent: { id: 'me' }, claimant: { id: 'sam' }, listing: { title: 'Ladder' } };
  expect(nextHomeAction([], [issue], 'me', now)).toMatchObject({ title: 'Review an issue with Ladder', destination: { name: 'DisputeDetail', params: { id: 'issue' } } });
  expect(nextHomeAction([], [issue], 'sam', now)).toBeNull();
  expect(nextHomeAction([], [{ ...issue, hasResponse: true }], 'me', now)).toBeNull();
  expect(nextHomeAction([], [{ ...issue, status: 'underReview' }], 'me', now)).toBeNull();
  expect(nextHomeAction([], [{ ...issue, status: 'counterPending' }], 'sam', now).id).toBe('issue');
  expect(action({ status: 'disputed', endDate: '2026-09-15' })).toBeNull();
});
