// Completion notices lead to exchange details. Ratings are not part of the app.
export const returnCompleteBody = ({ itemTitle } = {}) =>
  `${itemTitle || 'Your item'} has been returned. Tap to view your exchange.`;

export const giveawayCompleteBody = ({ itemTitle } = {}) =>
  `${itemTitle ? `The handoff for ${itemTitle}` : 'Your item pickup'} is complete. Tap to view your exchange.`;

// Correct previously stored notices when read, without changing their IDs,
// read state, participant context, or the historical record in the database.
export function currentNotificationBody(type, body) {
  if (!['return_confirmed', 'giveaway_complete'].includes(type) || typeof body !== 'string') return body;
  return body.replace(/Tap to leave a rating(?: for your neighbor)?\./gi, 'Tap to view your exchange.');
}
