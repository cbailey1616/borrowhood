import { trackedExchanges, exchangeRows } from '../../src/utils/exchangeTracking';

const now = new Date(2026, 8, 29, 12);
const loan = { id: 'loan', status: 'picked_up', listingType: 'lend', isBorrower: true,
  listing: { id: 'ladder', title: 'Ladder' }, borrower: { id: 'me' }, lender: { id: 'sam', firstName: 'Sam' },
  endDate: '2026-10-04T00:00:00.000Z' };
const track = (overrides = {}, userId = 'me', disputes = []) => trackedExchanges([{ ...loan, ...overrides }], userId, now, disputes)[0];

it('keeps quiet loans visible with a neighbor, deadline and one destination', () => {
  expect(track()).toMatchObject({ title: 'Ladder', person: 'From Sam', section: 'in-use', status: 'Currently borrowing',
    due: { label: 'Return by Oct 4' }, destination: { name: 'TransactionDetail', params: { id: 'loan' } } });
  expect(track({}, 'sam')).toBeDefined();
  expect(track({ isBorrower: false, borrower: { id: 'sam', firstName: 'Sam' }, lender: { id: 'me' } })).toMatchObject({
    person: 'To Sam', status: 'Currently lent out', nextStep: 'Waiting for Sam to return it', section: 'in-use',
  });
});

it.each(['completed', 'returned', 'declined', 'cancelled', 'expired'])('excludes closed %s exchanges', status => {
  expect(track({ status })).toBeUndefined();
});

it.each(['sell', 'giveaway'])('does not invent a return for a completed %s pickup', listingType => {
  expect(track({ listingType })).toBeUndefined();
  expect(track({ listingType, status: 'approved' })).toMatchObject({ section: 'pickup', due: null, label: 'View pickup' });
});

it('moves overdue and upcoming borrower returns into Needs you, not lender loans', () => {
  expect(track({ endDate: '2026-09-28' })).toMatchObject({ section: 'needs-you', label: 'Return details', due: { overdue: true } });
  expect(track({ endDate: '2026-09-29T00:00:00Z' })).toMatchObject({ section: 'needs-you', due: { label: 'Due back today' } });
  expect(track({ endDate: '2026-09-30' }).section).toBe('needs-you');
  expect(track({ isBorrower: false, endDate: '2026-09-28' }).section).toBe('in-use');
  expect(track({ endDate: '2026-02-30' }).due).toBeNull();
  expect(track({ endDate: null }).due).toBeNull();
});

it('keeps waiting separate from owner actions', () => {
  expect(track({ status: 'pending' })).toMatchObject({ section: 'waiting', status: 'Waiting for Sam', label: 'View details' });
  expect(track({ status: 'return_pending' })).toMatchObject({ section: 'waiting', status: 'Waiting for Sam to confirm the return' });
  expect(track({ status: 'return_pending', isBorrower: false })).toMatchObject({ section: 'needs-you', label: 'Confirm return' });
  expect(track({ status: 'returned', isBorrower: false, paymentStatus: 'authorized' }).section).toBe('needs-you');
  expect(track({ status: 'paid', isBorrower: false, pickupReview: { needed: true } })).toMatchObject({
    section: 'needs-you', label: 'Review pickup', nextStep: 'Confirm whether the handoff happened',
  });
});

it('groups owner requests into one queue but preserves accepted exchanges', () => {
  const requests = ['a', 'b'].map(id => ({ ...loan, id, status: 'pending', isBorrower: false,
    lender: { id: 'me' }, borrower: { id, firstName: id } }));
  const exchanges = trackedExchanges([...requests, loan], 'me', now);
  expect(exchanges).toHaveLength(2);
  expect(exchanges[0]).toMatchObject({ id: 'queue:ladder', person: '2 neighbors requested this', section: 'needs-you',
    label: 'Review requests', destination: { name: 'RequestQueue', params: { listingId: 'ladder' } } });
  expect(exchangeRows(exchanges).map(item => item.type === 'section' ? item.title : item.id)).toEqual([
    'Needs you', 'queue:ladder', 'Borrowing & lending', 'loan',
  ]);
});

it('shows only the signed-in account and avoids arbitrary actions for unknown roles', () => {
  expect(track({}, 'stranger')).toBeUndefined();
  expect(track({}, null)).toBeUndefined();
  expect(track({ borrower: null, lender: null, isBorrower: undefined })).toBeUndefined();
  expect(track({ borrower: null, lender: null })).toBeDefined();
});

it('routes issues to their details, and highlights only the participant who must respond', () => {
  const dispute = { id: 'issue', transactionId: 'loan', status: 'awaitingResponse', respondent: { id: 'me' }, claimant: { id: 'sam' } };
  expect(track({ status: 'disputed', disputeId: 'issue' })).toMatchObject({ section: 'waiting', status: 'Issue under review',
    destination: { name: 'DisputeDetail', params: { id: 'issue' } }, due: null });
  expect(track({ status: 'disputed' }, 'me', [dispute])).toMatchObject({ section: 'needs-you', label: 'Review issue', status: 'Your turn: review issue' });
  expect(track({ status: 'disputed' }, 'me', [{ ...dispute, hasResponse: true }]).section).toBe('waiting');
  expect(track({ status: 'disputed' }, 'me', [{ ...dispute, status: 'counterPending', claimant: { id: 'me' } }]).section).toBe('needs-you');
  expect(track({ status: 'disputed' }, 'me', [{ ...dispute, claimant: { id: 'other' }, respondent: { id: 'other' } }]).section).toBe('waiting');
  expect(track({}, 'me', [{ ...dispute, status: 'dismissed' }]).section).toBe('in-use');
});

it('keeps an unreturned closure in a separate history section without prompting the borrower to confirm a return',()=>{
  const transaction={id:'missing',status:'closed_unreturned',isBorrower:true,borrower:{id:'me'},lender:{id:'owner'},listing:{title:'Drill'}};
  const rows=trackedExchanges([transaction],'me');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({section:'closed',status:'Closed — item not returned',label:'View details'});
});
