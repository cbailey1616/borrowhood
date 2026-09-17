const PUBLIC_TYPES = ['listing_comment', 'request_comment', 'discussion_reply'];

export function publicReplyRoute(notification) {
  if (!PUBLIC_TYPES.includes(notification?.type)) return null;
  const thread = { ...(notification.threadId ? { threadId: notification.threadId } : {}),
    ...(notification.discussionId ? { discussionId: notification.discussionId } : {}) };
  if (notification.requestId) return { requestId: notification.requestId, ...thread };
  if (notification.listingId) return { listingId: notification.listingId, ...thread };
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

// Older builds store the subject in the message text. Keep that wire format,
// but display its exact, generated prefix as a compact context attachment.
// A subject has no stable ID here, so it must never become a guessed item link.
export function messagePresentation(content) {
  if (typeof content !== 'string') return { text: '', context: null };
  const match = content.match(/^About (item|request): “([^\n]+)”(?:\nReplying to: “([^\n]+)”)?(?:\n\n([\s\S]*)|$)/);
  if (!match) return { text: content, context: null };
  return { text: match[4] || '', context: { type: match[1], title: match[2], replyText: match[3] || '' } };
}
