// Shared, presentation-only guidance; server permissions still control actions.
export function borrowGuidance({ status, isBorrower, isGiveaway, hasDispute }) {
  if (hasDispute || status === 'disputed') return { title: 'An issue is being reviewed', detail: 'Open the issue details for the latest update.' };
  switch (status) {
    case 'pending': return isBorrower
      ? { title: 'Waiting for the owner', detail: 'Your request is sent. We’ll notify you when they respond.' }
      : { title: 'Review this request', detail: isGiveaway ? 'Check your neighbor’s profile, then approve or decline.' : 'Check the dates and borrower’s profile, then approve or decline.' };
    case 'approved': case 'paid': return { title: 'Arrange pickup', detail: isBorrower ? 'Message the owner to agree on a place and time. Confirm pickup only after you receive the item.' : 'Message your neighbor to agree on a place and time. Share pickup details privately.' };
    case 'picked_up': return { title: isGiveaway ? 'Pickup confirmed' : 'Return is next', detail: isGiveaway ? 'The handoff is complete.' : isBorrower ? 'Keep an eye on the agreed return date. Mark the item returned after handing it back.' : 'Confirm return after the item is back with you.' };
    case 'return_pending': return { title: 'Return reported', detail: 'The return is awaiting confirmation.' };
    case 'returned': case 'completed': return { title: isGiveaway ? 'Exchange complete' : 'Item returned', detail: isGiveaway ? 'The handoff is complete. Thanks for connecting with your neighbor.' : 'The item is back with its owner. Thanks for sharing with your neighbor.' };
    case 'cancelled': return { title: 'Request cancelled', detail: 'This exchange is no longer active.' };
    case 'declined': return { title: 'Request declined', detail: 'You can look for another item nearby.' };
    default: return { title: 'Exchange details', detail: 'Check below for the latest status.' };
  }
}
