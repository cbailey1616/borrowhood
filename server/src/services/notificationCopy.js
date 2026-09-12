// Completion notices lead to exchange details. Ratings are not part of the app.
export const returnCompleteBody = ({ itemTitle } = {}) =>
  `${itemTitle || 'Your item'} has been returned. Tap to view your exchange.`;

export const giveawayCompleteBody = ({ itemTitle } = {}) =>
  `${itemTitle ? `The handoff for ${itemTitle}` : 'Your item pickup'} is complete. Tap to view your exchange.`;

// Correct previously stored notices when read, without changing their IDs,
// read state, participant context, or the historical record in the database.
export function currentNotificationBody(type, body) {
  if (typeof body !== 'string') return body;
  if (['return_confirmed', 'giveaway_complete'].includes(type)) {
    return body.replace(/Tap to leave a rating(?: for your neighbor)?\./gi, 'Tap to view your exchange.');
  }
  if (type === 'request_declined') return body
    .replace(/^This item isn't available right now\./, 'Your request was declined.')
    .replace(/^(.+) isn't available right now\./, 'Your request for $1 was declined.')
    .replace(/Tap to browse similar items nearby\./gi, 'Tap to view your request.');
  if (type === 'pickup_confirmed') return body
    .replace(/is now in your hands\./gi, 'has been picked up.')
    .replace(/Remember to return it by /gi, 'Return due ');
  if (type === 'join_approved') return 'You’re ready to browse and share with your neighbors. Tap to see nearby items.';
  return body;
}

export function currentNotificationTitle(type, title) {
  return ({ pickup_confirmed: 'Pickup confirmed', giveaway_complete: 'Pickup complete',
    request_approved: 'Request approved', request_declined: 'Request declined',
    join_approved: 'Welcome to Borrowhood', return_reminder: 'Return reminder' })[type] || title;
}
