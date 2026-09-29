import { exchangeIsActive, exchangeHomeAction, exchangeStatus, isBorrower } from './homeAction';
import { groupPendingExchanges } from './requestActivity';
import { isTransferListing } from './directFee';
import { parseCalendarDate, formatCalendarDate } from './calendarDate';

const SECTIONS = [
  { key: 'needs-you', title: 'Needs you', icon: 'hand-right-outline' },
  { key: 'pickup', title: 'Ready for pickup', icon: 'basket-outline' },
  { key: 'in-use', title: 'Borrowing & lending', icon: 'handshake-outline' },
  { key: 'waiting', title: 'Waiting', icon: 'time-outline' },
];

function belongsToUser(transaction, userId) {
  if (!userId) return false;
  if (transaction.borrower?.id || transaction.lender?.id) {
    return transaction.borrower?.id === userId || transaction.lender?.id === userId;
  }
  return typeof transaction.isBorrower === 'boolean';
}

function returnDate(transaction, now) {
  if (transaction.status !== 'picked_up' || isTransferListing(transaction)) return null;
  const date = parseCalendarDate(transaction.endDate);
  if (!date) return null;
  const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const label = days < 0 ? 'Return overdue' : days === 0 ? 'Due back today' : days === 1 ? 'Due back tomorrow'
    : `Return by ${formatCalendarDate(transaction.endDate, { month: 'short', day: 'numeric' })}`;
  return { label, overdue: days < 0, soon: days <= 1, time: date.getTime() };
}

export function trackedExchanges(transactions = [], userId, now = new Date(), disputes = []) {
  const active = transactions.filter(transaction => belongsToUser(transaction, userId) && exchangeIsActive(transaction));
  return groupPendingExchanges(active, userId).map(transaction => {
    const borrower = isBorrower(transaction, userId);
    const neighbor = borrower ? transaction.lender : transaction.borrower;
    const name = neighbor?.firstName || 'your neighbor';
    const action = exchangeHomeAction(transaction, userId, now);
    const due = returnDate(transaction, now);
    const dispute = disputes.find(item => item.transactionId === transaction.id
      && ['awaitingResponse', 'counterPending', 'underReview'].includes(item.status)
      && (item.claimant?.id === userId || item.respondent?.id === userId));
    const issue = transaction.status === 'disputed' || !!dispute;
    const needsIssueReview = dispute && (dispute.status === 'awaitingResponse' && !dispute.hasResponse && dispute.respondent?.id === userId
      || dispute.status === 'counterPending' && dispute.claimant?.id === userId);
    const awaitingReturn = transaction.status === 'return_pending'
      || transaction.status === 'returned' && transaction.paymentStatus === 'authorized';
    const pending = transaction.status === 'pending';
    const needsYou = needsIssueReview || !issue && !transaction.hasDispute && (pending && !borrower
      || awaitingReturn && !borrower || transaction.pickupReview?.needed && !borrower && !!action
      || due?.soon && borrower);
    const section = needsYou ? 'needs-you' : issue || pending || awaitingReturn ? 'waiting'
      : ['approved', 'paid'].includes(transaction.status) ? 'pickup' : 'in-use';
    const status = issue ? needsIssueReview ? 'Your turn: review issue' : 'Issue under review'
      : pending && borrower ? `Waiting for ${name}` : awaitingReturn && borrower
      ? `Waiting for ${name} to confirm the return` : awaitingReturn ? 'Return reported' : exchangeStatus(transaction, userId, now);
    const nextStep = issue ? needsIssueReview ? 'Review the issue and respond' : 'Check the latest update'
      : pending ? borrower ? 'The owner will review your request' : 'Choose a request to review'
      : awaitingReturn ? borrower ? null : 'Confirm once the item is back'
      : section === 'pickup' ? `Arrange a time and place with ${name}`
      : needsYou && transaction.pickupReview?.needed ? 'Confirm whether the handoff happened'
      : borrower ? 'Confirm the return after you hand it back' : `Waiting for ${name} to return it`;
    const disputeId = dispute?.id || transaction.disputeId;
    const destination = issue && disputeId ? { name: 'DisputeDetail', params: { id: disputeId } }
      : action?.destination || { name: 'TransactionDetail', params: { id: transaction.id } };
    return {
      id: transaction.id, transaction, section, status, nextStep, destination,
      title: transaction.listing?.title || 'Item unavailable',
      person: transaction.requestCount > 1 ? `${transaction.requestCount} neighbors requested this`
        : `${borrower ? 'From' : 'To'} ${name}`,
      due: issue ? null : due, label: issue ? needsIssueReview ? 'Review issue' : 'View issue' : pending && borrower || awaitingReturn && borrower ? 'View details'
        : needsYou && due ? 'Return details' : action?.label || 'View details',
      priority: needsIssueReview || due?.overdue && borrower ? 0 : action?.priority ?? 5,
      time: due?.time || new Date(transaction.createdAt).getTime() || 0,
    };
  }).sort((a, b) => a.priority - b.priority || a.time - b.time || String(a.id).localeCompare(String(b.id)));
}

export function exchangeRows(exchanges) {
  return SECTIONS.flatMap(section => {
    const items = exchanges.filter(exchange => exchange.section === section.key);
    return items.length ? [{ ...section, id: `section:${section.key}`, type: 'section', count: items.length },
      ...items.map(item => ({ ...item, type: 'exchange' }))] : [];
  });
}
