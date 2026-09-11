import { isTransferListing } from './directFee';
export function exchangesWith(transactions, userId, otherId, listingId) {
  if (!otherId) return [];
  return transactions.filter(t => ['pending', 'approved', 'paid', 'picked_up', 'return_pending', 'disputed'].includes(t.status)
    && ((t.borrower?.id === userId && t.lender?.id === otherId) || (t.lender?.id === userId && t.borrower?.id === otherId)))
    .sort((a, b) => Number(b.listing?.id === listingId) - Number(a.listing?.id === listingId)
      || new Date(b.createdAt) - new Date(a.createdAt));
}

export function exchangeAction(transaction, userId) {
  const borrower = transaction.borrower?.id === userId;
  const lender = transaction.lender?.id === userId;
  if (lender && transaction.status === 'pending' && transaction.listing?.id) {
    return { label: 'View queue', screen: 'RequestQueue', params: { listingId: transaction.listing.id } };
  }
  // Historical paid exchanges retain their fuller review screen after approval.
  if ((Number(transaction.rentalFee) || 0) + (Number(transaction.depositAmount) || 0) > 0) return { label: 'Borrow details' };
  if (borrower && ['approved', 'paid'].includes(transaction.status)) return { label: 'Confirm pickup', method: 'confirmRentalPickup', confirmation: 'Only confirm once you have received the item.' };
  if (transaction.status === 'picked_up' && !isTransferListing(transaction)) return { label: borrower ? 'Mark returned' : 'Confirm return' };
  if (lender && transaction.status === 'return_pending') return { label: 'Confirm return' };
  return { label: 'Borrow details' };
}
