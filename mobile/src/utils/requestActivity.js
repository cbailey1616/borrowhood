export const isIncomingRequest = item => ['borrow_request', 'giveaway_claim'].includes(item.type);

// Only an owner's pending requests form a queue. A borrower's request and an
// accepted exchange still open their own tracker.
export function groupPendingExchanges(transactions, userId) {
  const groups = new Map();
  const items = [];
  for (const transaction of transactions) {
    const listingId = transaction.listing?.id;
    const isOwner = transaction.isBorrower === false || transaction.lender?.id === userId;
    if (transaction.status !== 'pending' || !isOwner || !listingId) {
      items.push(transaction);
      continue;
    }
    let group = groups.get(listingId);
    if (!group) {
      group = { ...transaction, id: `queue:${listingId}`, queueListingId: listingId, requests: [] };
      groups.set(listingId, group);
      items.push(group);
    }
    group.requests.push(transaction);
    group.requestCount = new Set(group.requests.map(item => item.borrower?.id || item.id)).size;
  }
  return items;
}

// Also handles older servers that still return one notification per request.
export function groupRequestNotifications(notifications, transactions = [], userId) {
  const byTransaction = new Map(transactions.map(item => [item.id, item]));
  const queues = new Map(groupPendingExchanges(transactions, userId)
    .filter(item => item.queueListingId).map(item => [item.queueListingId, item]));
  const groups = new Map();
  const result = [];
  for (const notification of notifications) {
    const transaction = byTransaction.get(notification.transactionId);
    if (isIncomingRequest(notification) && transaction && transaction.status !== 'pending') continue;
    const listingId = notification.queueListingId || notification.listingId || transaction?.listing?.id;
    const pending = !transaction || (transaction.status === 'pending' && transaction.isBorrower !== true);
    if (!isIncomingRequest(notification) || !listingId || !pending) {
      result.push(notification);
      continue;
    }
    let group = groups.get(listingId);
    if (!group) {
      group = { ...notification, queueListingId: listingId, notificationIds: [], serverGrouped: !!notification.queueListingId, members: new Set(), requestCount: 0, isRead: true };
      groups.set(listingId, group);
      result.push(group);
    }
    group.notificationIds.push(...(notification.notificationIds || [notification.id]));
    group.members.add(notification.fromUserId || notification.transactionId || notification.id);
    group.requestCount = Math.max(group.requestCount, notification.requestCount || 0, queues.get(listingId)?.requestCount || 0, group.members.size);
    group.isRead = group.isRead && notification.isRead;
    const title = queues.get(listingId)?.listing?.title || notification.listingTitle || transaction?.listing?.title;
    if (title) group.title = group.requestCount > 1
      ? `${group.requestCount} people requested ${title}`
      : `${notification.fromUser?.firstName || transaction?.borrower?.firstName || 'A neighbor'} requested ${title}`;
    else if (group.requestCount > 1) group.title = `${group.requestCount} people requested your item`;
    group.body = 'See queue';
    group.fromUser = group.requestCount > 1 ? null : notification.fromUser;
  }
  return result.map(({ members, ...item }) => item);
}

export async function readActivity(api, item) {
  // Individual reads work on older servers too. Only acknowledge the records
  // the person actually saw, so a request arriving meanwhile stays unread.
  if (item.serverGrouped && item.notificationIds?.length > 1) {
    await api.markNotificationRead(item.id, item.notificationIds);
  } else {
    await Promise.all((item.notificationIds || [item.id]).map(id => api.markNotificationRead(id)));
  }
}
