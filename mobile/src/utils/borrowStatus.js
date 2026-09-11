// Presentation only: actions remain subject to server permissions and state.
export function borrowGuidance({ status, isBorrower, isGiveaway, hasDispute, lender, borrower, endDate, paymentStatus }) {
  const neighbor = (isBorrower ? lender : borrower)?.firstName || (isBorrower ? 'the owner' : 'your neighbor');
  const date = endDate && new Date(endDate);
  const due = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'the agreed date';
  if (hasDispute || status === 'disputed') return { title: 'An issue is being reviewed', detail: 'Check the latest update with your neighbor before taking another step.' };
  switch (status) {
    case 'pending': return isBorrower
      ? { title: `Waiting for ${neighbor}`, detail: `${neighbor} needs to approve your request. There’s nothing you need to do yet—we’ll notify you when they respond.` }
      : { title: 'Review your queue', detail: `${neighbor} is waiting. Open the queue to approve or decline requests.` };
    case 'approved': case 'paid': return { title: 'Next: arrange pickup', detail: isBorrower
      ? `Agree on a time and place with ${neighbor}. After you receive the item, tap Confirm pickup below.`
      : `Agree on a time and place with ${neighbor}. After the handoff, ${neighbor} needs to confirm pickup in the app.` };
    case 'picked_up': return isGiveaway
      ? { title: 'Exchange complete', detail: 'The handoff is complete. No return is needed.' }
      : { title: isBorrower ? `Return by ${due}` : `Waiting for ${neighbor} to return it`, detail: isBorrower
        ? `Arrange the return with ${neighbor}. Confirm return only after you’ve handed the item back.`
        : `The return is due ${due}. Confirm return only once the item is back with you.` };
    case 'return_pending': return isBorrower
      ? { title: `Waiting for ${neighbor} to confirm`, detail: `Your return was reported. ${neighbor} needs to confirm they have the item back. Nothing else to do right now.` }
      : { title: 'Your turn: confirm the return', detail: `${neighbor} reported the return. Confirm only once you have the item back.` };
    case 'returned':
      if (paymentStatus === 'authorized') return isBorrower
        ? { title: `Waiting for ${neighbor} to confirm`, detail: 'The return is recorded. The owner still needs to confirm receipt and release the deposit.' }
        : { title: 'Your turn: confirm the return', detail: 'Confirm you have the item back to finish the exchange and release the deposit.' };
      // Falls through: current fee-free returns finish immediately.
    case 'completed': return { title: 'Exchange complete', detail: isGiveaway ? 'The handoff is complete. Nothing else to do.' : 'The item has been returned. Nothing else to do.' };
    case 'cancelled': return { title: 'Request cancelled', detail: 'No pickup is expected. Nothing else to do for this exchange.' };
    case 'declined': return { title: 'Request declined', detail: 'No pickup is expected. You can look for another item nearby.' };
    default: return { title: 'Exchange details', detail: 'Check with your neighbor about the next step.' };
  }
}
