import { CONDITION_LABELS, TRANSACTION_STATUS_LABELS } from './config';
import { directFeeLabel, isSaleListing, isTransferListing } from './directFee';

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function exchangeDetailRows(transaction) {
  const transfer = isTransferListing(transaction);
  const status = transfer && transaction.status === 'picked_up' ? 'Completed'
    : transaction.status === 'returned' && transaction.paymentStatus === 'authorized' ? 'Awaiting return confirmation'
    : transaction.status === 'declined' ? 'Declined' : TRANSACTION_STATUS_LABELS[transaction.status];
  const fee = transaction.directFee;
  const hasFee = fee && Number.isFinite(Number(fee.amount)) && Number(fee.amount) > 0;
  const feeLabel = directFeeLabel({ ...transaction, directFee: hasFee ? fee : null });
  const rate = transaction.dailyRate;
  const hasRate = rate !== null && rate !== undefined && rate !== '' && Number.isFinite(Number(rate)) && Number(rate) >= 0;
  const price = isSaleListing(transaction) ? (hasFee ? feeLabel : 'Ask for price')
    : feeLabel || (hasRate ? Number(rate) > 0 ? `$${Number(rate).toFixed(2)}/day` : 'Free to borrow' : null);
  return [
    ['Status', status],
    ['Requested', formatDate(transaction.createdAt)],
    ['Picked up', formatDate(transaction.actualPickupAt)],
    ...(!transfer ? [['Returned', formatDate(transaction.actualReturnAt)]] : []),
    ['Price', price],
    ['Condition at pickup', CONDITION_LABELS[transaction.conditionAtPickup]],
    ...(!transfer ? [['Condition at return', CONDITION_LABELS[transaction.conditionAtReturn]]] : []),
  ].filter(([, value]) => Boolean(value));
}
