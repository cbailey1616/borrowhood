// Presentation only: messages stay in their server/draft models.
export function formatChatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatChatDay(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

const senderKey = message => message?.senderId ?? message?.sender?.id ?? (message?.isOwnMessage ? 'own' : 'other');

// A new person, day, or five-minute pause starts a visual message group.
export function chatMessageMeta(message, previous, now, { groupAcrossPauses = false } = {}) {
  const date = new Date(message.createdAt);
  const previousDate = new Date(previous?.createdAt);
  const sameDay = !!previous && date.toDateString() === previousDate.toDateString();
  const gap = date - previousDate;
  return {
    time: formatChatTime(message.createdAt),
    day: formatChatDay(message.createdAt, now),
    showDate: !sameDay,
    startsGroup: !sameDay || senderKey(message) !== senderKey(previous) || !Number.isFinite(gap) || gap < 0 || (!groupAcrossPauses && gap >= 5 * 60000),
  };
}
