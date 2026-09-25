import { returnExtensionDates, returnHelpGuidance } from '../../src/utils/returnHelpGuidance';

const now = new Date(2026, 8, 25, 17);
const exchange = {
  status: 'picked_up', isBorrower: true, isLender: false,
  actualPickupAt: '2026-09-24T16:00:00Z', endDate: '2026-09-27T00:00:00.000Z',
  listing: { listingType: 'lend' },
  lender: { id: 'owner', firstName: 'Taylor' }, borrower: { id: 'borrower', firstName: 'Alex' },
};

it('gives borrowers a due date and messaging without owner permissions', () => {
  expect(returnHelpGuidance(exchange, now)).toMatchObject({
    title: 'Return by Sun, Sep 27', canMessage: true, messageLabel: 'Message Taylor',
    canRequestTime: true, canExtend: false, canReport: false, overdue: false, exchangeFirst: false,
  });
});

it.each(['2026-09-25', '2026-09-26'])('does not offer a missing-return report on or before %s', endDate => {
  expect(returnHelpGuidance({ ...exchange, isBorrower: false, isLender: true, endDate }, now)).toMatchObject({
    canExtend: true, canReport: false, overdue: false, messageLabel: 'Message Alex',
  });
});

it('offers owners a report only after the calendar return day', () => {
  expect(returnHelpGuidance({ ...exchange, isLender: true, isBorrower: false, endDate: '2026-09-24T00:00:00Z' }, now)).toMatchObject({
    title: 'Return date has passed', dueLabel: 'Thu, Sep 24', canReport: true, overdue: true,
  });
});

it('does not tell a borrower awaiting owner confirmation to return the item again', () => {
  expect(returnHelpGuidance({ ...exchange, status: 'return_pending', endDate: '2026-09-24' }, now)).toMatchObject({
    title: 'Waiting for the owner', canRequestTime: false, canReport: false, overdue: false,
  });
});

it('prioritizes owner confirmation when a borrower has recorded the handoff', () => {
  expect(returnHelpGuidance({ ...exchange, isBorrower: false, isLender: true, status: 'return_pending' }, now)).toMatchObject({
    title: 'Ready to confirm the return?', exchangeFirst: true,
  });
});

it('keeps legacy deposit-authorized returns awaiting the owner', () => {
  expect(returnHelpGuidance({ ...exchange, status: 'returned', paymentStatus: 'authorized' }, now)).toMatchObject({
    title: 'Waiting for the owner', canExtend: false, canRequestTime: false,
  });
});

it.each(['completed', 'returned'])('does not offer return changes for %s exchanges', status => {
  expect(returnHelpGuidance({ ...exchange, status, actualReturnAt: '2026-09-25T16:00:00Z', isLender: true }, now)).toMatchObject({
    title: 'Return complete', canExtend: false, canRequestTime: false, canReport: false, exchangeFirst: true,
  });
});

it.each(['giveaway', 'sell'])('does not offer returns for %s listings', listingType => {
  expect(returnHelpGuidance({ ...exchange, isLender: true, listing: { listingType } }, now)).toMatchObject({
    title: 'No return needed', canExtend: false, canRequestTime: false, canReport: false,
  });
});

it('keeps disputes in their existing review flow', () => {
  expect(returnHelpGuidance({ ...exchange, hasDispute: true, isLender: true }, now)).toMatchObject({
    title: 'An issue is being reviewed', exchangeFirst: true, canExtend: false, canReport: false,
  });
});

it('does not offer return actions before pickup', () => {
  expect(returnHelpGuidance({ ...exchange, actualPickupAt: null, status: 'approved', isLender: true }, now)).toMatchObject({
    title: 'Next: arrange pickup', canExtend: false, canRequestTime: false, canReport: false,
  });
});

it('does not offer messaging to a deleted account', () => {
  expect(returnHelpGuidance({ ...exchange, status: 'account_deleted' }, now)).toMatchObject({
    title: 'Your neighbor deleted their account', canMessage: false, exchangeFirst: true,
  });
});

it('handles unavailable dates and neighbors without showing invalid dates or broken messages', () => {
  expect(returnHelpGuidance({ ...exchange, lender: null, endDate: 'invalid' }, now)).toMatchObject({
    title: 'Arrange the return', messageLabel: 'Message owner', canMessage: false, canReport: false, dueLabel: '',
  });
  expect(returnHelpGuidance(null, now)).toBeNull();
});

it('offers only later calendar days for a future return', () => {
  expect(returnExtensionDates('2026-09-27T00:00:00.000Z', now)).toEqual({
    minimumDate: new Date(2026, 8, 28, 12), initialDate: new Date(2026, 8, 28, 12),
    maximumDate: new Date(2026, 11, 24, 12), available: true,
  });
});

it('allows today for an overdue return and suggests tomorrow', () => {
  expect(returnExtensionDates('2026-09-24', now)).toMatchObject({
    minimumDate: new Date(2026, 8, 25, 12), initialDate: new Date(2026, 8, 26, 12), available: true,
  });
});

it('keeps calendar-day limits across daylight-saving changes', () => {
  expect(returnExtensionDates('2026-10-31', new Date(2026, 9, 31, 23))).toEqual({
    minimumDate: new Date(2026, 10, 1, 12), initialDate: new Date(2026, 10, 1, 12),
    maximumDate: new Date(2027, 0, 29, 12), available: true,
  });
});

it.each(['2026-12-24', '2026-12-25'])('does not suggest a date beyond the limit when due %s', endDate => {
  expect(returnExtensionDates(endDate, now)).toMatchObject({ available: false, initialDate: new Date(2026, 11, 24, 12) });
});
