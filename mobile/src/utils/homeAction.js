import { listingIcon } from './listingPresentation';
import { isTransferListing } from './directFee';
import { groupPendingExchanges } from './requestActivity';

export const exchangeIsActive = transaction => ['pending', 'approved', 'paid', 'return_pending', 'disputed'].includes(transaction.status)
  || (transaction.status === 'picked_up' && !isTransferListing(transaction))
  || (transaction.status === 'returned' && transaction.paymentStatus === 'authorized');

export const isBorrower = (transaction, userId) => transaction.isBorrower ?? (!!userId && transaction.borrower?.id === userId);
const isLender = (transaction, userId) => transaction.isBorrower === false || (!!userId && transaction.lender?.id === userId);
const time = value => new Date(value).getTime() || 0;
// Due dates are calendar dates, including across daylight-saving changes.
const calendarDay = value => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
};

const returnTiming = (transaction, now) => {
  if (!transaction.endDate || isTransferListing(transaction)) return null;
  const due = calendarDay(transaction.endDate);
  const today = calendarDay(now);
  if (due === null || today === null || due > today + 1) return null;
  return { label: due < today ? 'Overdue' : due === today ? 'Due back today' : 'Due back tomorrow',
    priority: due < today ? 0 : 2, time: due * 86400000 };
};

export function exchangeHomeAction(transaction, userId, now = new Date()) {
  const title = transaction.listing?.title || 'your item';
  const borrower = isBorrower(transaction, userId);
  const lender = isLender(transaction, userId);
  if ((!borrower && !lender) || transaction.hasDispute || transaction.status === 'disputed') return null;
  const base = { id: transaction.id, icon: listingIcon(transaction), destination: { name: 'TransactionDetail', params: { id: transaction.id } }, time: time(transaction.createdAt) };
  if (lender && transaction.pickupReview?.needed && ['approved', 'paid'].includes(transaction.status) && !transaction.actualPickupAt) {
    return { ...base, title: `Was ${title} picked up?`, label: 'Review pickup', priority: 1 };
  }
  if (lender && (transaction.status === 'return_pending' || transaction.status === 'returned' && transaction.paymentStatus === 'authorized')) {
    return { ...base, title: `Was ${title} returned?`, label: 'Confirm return', priority: 1 };
  }
  if (borrower && transaction.status === 'picked_up') {
    const timing = returnTiming(transaction, now);
    if (timing) return { ...base, ...timing, title: `${title} ${timing.label.toLowerCase()}`, label: 'View details' };
  }
  if (lender && transaction.status === 'pending') {
    const count = transaction.requestCount || 1;
    const listingId = transaction.queueListingId || transaction.listing?.id;
    return { ...base, title: count > 1 ? `${count} requests for ${title}` : `Someone wants ${title}`,
      label: count > 1 ? 'Review requests' : 'Review request', priority: 3,
      destination: listingId ? { name: 'RequestQueue', params: { listingId } } : base.destination };
  }
  if ((borrower || lender) && ['approved', 'paid'].includes(transaction.status) && !transaction.actualPickupAt) {
    return { ...base, title: `${title} ready for pickup`, label: 'View pickup', priority: 4 };
  }
  return null;
}

export function nextHomeAction(transactions = [], disputes = [], userId, now = new Date()) {
  const actions = groupPendingExchanges(transactions, userId).map(t => exchangeHomeAction(t, userId, now)).filter(Boolean);
  for (const dispute of disputes) {
    const needsResponse = dispute.status === 'awaitingResponse' && !dispute.hasResponse && dispute.respondent?.id === userId;
    const needsCounterReview = dispute.status === 'counterPending' && dispute.claimant?.id === userId;
    if (userId && (needsResponse || needsCounterReview)) actions.push({
      id: dispute.id, icon: 'alert-circle', title: `Review an issue with ${dispute.listing?.title || 'your exchange'}`,
      label: 'Review issue', priority: 0, time: time(dispute.createdAt),
      destination: { name: 'DisputeDetail', params: { id: dispute.id } },
    });
  }
  return actions.sort((a, b) => a.priority - b.priority || a.time - b.time || String(a.id).localeCompare(String(b.id)))[0] || null;
}

export function exchangeStatus(transaction, userId, now = new Date()) {
  const borrower = isBorrower(transaction, userId);
  if (transaction.status === 'disputed') return 'Issue under review';
  switch (transaction.status) {
    case 'pending': return borrower ? 'Waiting for approval' : `${transaction.requestCount || 1} request${transaction.requestCount > 1 ? 's' : ''} to review`;
    case 'approved': case 'paid': return !borrower && transaction.pickupReview?.needed && !transaction.actualPickupAt && !transaction.hasDispute
      ? 'Was this item picked up?' : 'Ready for pickup';
    case 'picked_up': return isTransferListing(transaction) ? 'Pickup complete' : borrower ? returnTiming(transaction, now)?.label || 'Currently borrowing' : 'Currently lent out';
    case 'return_pending': return borrower ? 'Waiting for return confirmation' : 'Confirm the return';
    case 'returned': return transaction.paymentStatus === 'authorized' ? borrower ? 'Waiting for return confirmation' : 'Confirm the return' : 'Returned';
    case 'completed': return 'Exchange complete';
    case 'declined': return 'Request declined';
    case 'cancelled': return 'Request cancelled';
    case 'expired': return 'Request expired';
    default: return 'View exchange';
  }
}
