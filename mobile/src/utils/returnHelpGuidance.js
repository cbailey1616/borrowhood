import { borrowGuidance } from './borrowStatus';
import { formatCalendarDate, parseCalendarDate } from './calendarDate';
import { isTransferListing } from './directFee';

// Keep date limits on local calendar days, including across daylight-saving changes.
export function returnExtensionDates(endDate, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const current = parseCalendarDate(endDate);
  const afterCurrent = current ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 12) : today;
  const minimumDate = new Date(Math.max(today.getTime(), afterCurrent.getTime()));
  const maximumDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90, 12);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
  return {
    minimumDate,
    maximumDate,
    initialDate: new Date(Math.min(maximumDate.getTime(), Math.max(minimumDate.getTime(), tomorrow.getTime()))),
    available: minimumDate <= maximumDate,
  };
}

// Display guidance only. The server still authorizes every return action.
export function returnHelpGuidance(transaction, now = new Date()) {
  if (!transaction) return null;
  const owner = !!transaction.isLender;
  const neighbor = owner ? transaction.borrower : transaction.lender;
  const name = neighbor?.firstName || (owner ? 'your neighbor' : 'the owner');
  const isTransfer = isTransferListing({ listingType: transaction.listing?.listingType || transaction.listingType });
  const active = !isTransfer && !!transaction.actualPickupAt && !transaction.actualReturnAt
    && !transaction.hasDispute && ['picked_up', 'return_pending'].includes(transaction.status);
  const due = parseCalendarDate(transaction.endDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue = !!due && due < today;
  const dueLabel = formatCalendarDate(transaction.endDate, { weekday: 'short', month: 'short', day: 'numeric' });
  const pending = transaction.status === 'return_pending'
    || (transaction.status === 'returned' && transaction.paymentStatus === 'authorized');
  const complete = transaction.status === 'completed'
    || (transaction.status === 'returned' && transaction.paymentStatus !== 'authorized');
  const guidance = {
    ...borrowGuidance({ ...transaction, isGiveaway: isTransfer }),
    neighbor,
    messageLabel: neighbor?.firstName ? `Message ${name}` : owner ? 'Message borrower' : 'Message owner',
    canMessage: !!neighbor?.id && transaction.status !== 'account_deleted',
    canExtend: owner && active,
    canRequestTime: !!transaction.isBorrower && active && !pending,
    canReport: owner && active && overdue,
    exchangeFirst: !active || (owner && pending),
    exchangeDescription: 'See the details and next steps',
    icon: 'return-down-back-outline',
    overdue: active && overdue && !pending,
    dueLabel,
  };
  if (transaction.hasDispute || transaction.status === 'disputed' || transaction.status === 'account_deleted') {
    return { ...guidance, icon: 'alert-circle-outline' };
  }
  if (isTransfer) return { ...guidance, title: 'No return needed', detail: 'This exchange does not require a return.', icon: 'gift-outline' };
  if (pending) return {
    ...guidance,
    title: owner ? 'Ready to confirm the return?' : 'Waiting for the owner',
    detail: owner ? `${name} marked the item as returned. Confirm once you have it back.`
      : `You marked this item as returned. ${name} still needs to confirm it is back.`,
    exchangeDescription: owner ? 'Confirm receipt and finish the return' : 'Check the latest return status',
    icon: 'time-outline',
  };
  if (complete) return { ...guidance, title: 'Return complete', detail: 'The item is back and this exchange is finished.', icon: 'checkmark-circle-outline' };
  if (active) return {
    ...guidance,
    title: overdue ? 'Return date has passed' : dueLabel ? `Return by ${dueLabel}` : 'Arrange the return',
    detail: owner ? `Check in with ${name} to arrange the handoff.` : `Agree on a time and place with ${name} to bring it back.`,
    exchangeDescription: owner ? 'Item back? Open to confirm the return' : 'Handed it back? Open to record your return',
    icon: overdue ? 'time-outline' : 'calendar-outline',
  };
  return guidance;
}
