const PUBLIC_TYPES = ['listing_comment', 'request_comment', 'discussion_reply'];

export function publicReplyRoute(notification) {
  if (!PUBLIC_TYPES.includes(notification?.type)) return null;
  if (notification.requestId) return { requestId: notification.requestId };
  if (notification.listingId) return { listingId: notification.listingId };
  return null;
}

// Include the visible subject in the message itself so both participants can
// understand it after reopening a DM, including on older app builds.
export function privateMessagePrefix(context) {
  if (!context?.id || !context?.title) return '';
  const title = String(context.title).replace(/\s+/g, ' ').trim().slice(0, 255);
  const reply = context.replyText ? `\nReplying to: “${String(context.replyText).replace(/\s+/g, ' ').trim().slice(0, 120)}”` : '';
  return `About ${context.type === 'request' ? 'request' : 'item'}: “${title}”${reply}\n\n`;
}
