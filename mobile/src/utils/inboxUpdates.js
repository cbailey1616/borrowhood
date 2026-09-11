const subscribersByUser = new Map();

export function subscribeInboxChanges(userId, listener) {
  const subscribers = subscribersByUser.get(userId) || new Set();
  subscribersByUser.set(userId, subscribers);
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) subscribersByUser.delete(userId);
  };
}

// The mounted badge hook owns refresh ordering, so a read notification can
// invalidate an older request before it restores an obsolete unread count.
export function notifyInboxChanged(userId) {
  const subscribers = subscribersByUser.get(userId);
  if (!subscribers?.size) return false;
  for (const listener of subscribers) listener();
  return true;
}
