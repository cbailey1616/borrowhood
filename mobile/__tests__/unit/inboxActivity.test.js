import { inboxActivity } from '../../src/utils/inboxActivity';
import { readActivity } from '../../src/utils/requestActivity';

const exchange = { id: 'exchange', status: 'approved', isBorrower: true,
  listing: { id: 'ladder', title: 'Ladder' }, lender: { firstName: 'Sam' } };
const notice = (id, extra = {}) => ({ id, transactionId: 'exchange', type: 'request_approved', title: 'Approved',
  isRead: false, createdAt: '2026-09-15T12:00:00Z', ...extra });

it('combines the current exchange and all its updates into one unread row', () => {
  const rows = inboxActivity([notice('approved'), notice('pickup', { type: 'pickup_confirmed', createdAt: '2026-09-16T12:00:00Z' })],
    [{ ...exchange, status: 'picked_up' }], 'me');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ title: 'Ladder', body: 'Currently borrowing', isRead: false,
    readId: 'pickup', notificationIds: ['approved', 'pickup'], destination: { name: 'TransactionDetail', params: { id: 'exchange' } } });
});

it('keeps read, unfinished exchanges present without inventing an unread badge', () => {
  const [row] = inboxActivity([notice('approved', { isRead: true })], [exchange], 'me');
  expect(row.isRead).toBe(true);
  expect(row.action.label).toBe('View pickup');
  expect(inboxActivity([], [exchange], 'me')[0]).toMatchObject({ isRead: true, notificationIds: [] });
});

it('keeps the missed-pickup reminder in the existing exchange row, then clears the action after extension', () => {
  const ownerExchange = { ...exchange, isBorrower: false, pickupReview: { needed: true } };
  const updates = [notice('approved', { isRead: true }), notice('pickup-check', { type: 'pickup_check', createdAt: '2026-09-18T12:00:00Z' })];
  const rows = inboxActivity(updates, [ownerExchange], 'me');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ title: 'Ladder', body: 'Was this item picked up?', isRead: false, action: { label: 'Review pickup' } });
  const [extended] = inboxActivity(updates.map(n => ({ ...n, isRead: true })), [{ ...ownerExchange, pickupReview: { needed: false } }], 'me');
  expect(extended).toMatchObject({ body: 'Ready for pickup', isRead: true, action: { label: 'View pickup' } });
});

it('retains one completed exchange card and leaves separate exchanges separate', () => {
  const old = { ...exchange, status: 'completed' };
  const newer = { ...exchange, id: 'second' };
  const rows = inboxActivity([notice('done', { type: 'return_confirmed' })], [old, newer], 'me');
  expect(rows).toHaveLength(2);
  expect(rows[0].exchange.id).toBe('second');
  expect(rows[1]).toMatchObject({ body: 'Exchange complete', action: null });
});

it('removes an obsolete request notice without making a duplicate approved card', () => {
  const lender = { ...exchange, isBorrower: false };
  const rows = inboxActivity([notice('old', { type: 'borrow_request', listingId: 'ladder' }), notice('approved')], [lender], 'me');
  expect(rows).toHaveLength(1);
  expect(rows[0].notificationIds).toEqual(['approved']);
});

it('acknowledges only the server snapshot IDs, never the synthetic row ID', async () => {
  const [row] = inboxActivity([notice('pickup', { notificationIds: ['approved', 'pickup'] })], [exchange], 'me');
  const api = { markNotificationRead: jest.fn().mockResolvedValue({}) };
  await readActivity(api, { ...row, id: row.readId });
  expect(api.markNotificationRead).toHaveBeenCalledWith('pickup', ['approved', 'pickup']);
  const [newer] = inboxActivity([notice('return', { notificationIds: ['approved', 'pickup', 'return'] })], [exchange], 'me');
  expect(newer.isRead).toBe(false);
});

it('preserves specific issue and payment-failure information inside the exchange', () => {
  const [issue] = inboxActivity([notice('issue', { type: 'dispute_filed_against_you', disputeId: 'dispute', body: 'Sam reported damage. Review and respond.' })], [{ ...exchange, status: 'disputed' }], 'me');
  expect(issue).toMatchObject({ body: 'Sam reported damage. Review and respond.', action: null, destination: { name: 'DisputeDetail', params: { id: 'dispute' } } });
  const [payment] = inboxActivity([notice('failed', { type: 'payment_failed', body: 'Your payment could not be completed.' })], [exchange], 'me');
  expect(payment.body).toBe('Your payment could not be completed.');
});

it('does not merge public discussion replies into a private exchange', () => {
  const rows = inboxActivity([notice('reply', { type: 'discussion_reply', discussionId: 'post' })], [exchange], 'me');
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.id === 'reply').title).toBe('Approved');
});
