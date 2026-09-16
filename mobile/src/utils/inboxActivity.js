import { groupPendingExchanges, groupRequestNotifications } from './requestActivity';
import { exchangeIsActive, exchangeHomeAction, exchangeStatus } from './homeAction';

const stamp = value => new Date(value).getTime() || 0;
const keyFor = item => item.queueListingId ? `queue:${item.queueListingId}`
  : item.transactionId && !item.discussionId && !item.threadId ? `exchange:${item.transactionId}`
  : item.disputeId ? `dispute:${item.disputeId}` : item.id;

// Combine the current exchange state and its event history into one row. Keep
// the exact notification IDs so reading a row cannot clear a later update.
export function inboxActivity(notifications = [], transactions = [], userId) {
  const groups = new Map();
  const byId = new Map(transactions.map(t => [t.id, t]));
  for (const notification of groupRequestNotifications(notifications, transactions, userId)) {
    const key = keyFor(notification);
    const previous = groups.get(key);
    const ids = [...new Set([...(previous?.notificationIds || []), ...(notification.notificationIds || [notification.id])])];
    const latest = !previous || stamp(notification.createdAt) >= stamp(previous.createdAt) ? notification : previous;
    groups.set(key, { ...latest, id: key, readId: latest.readId || latest.id,
      notificationIds: ids, isRead: (previous?.isRead ?? true) && notification.isRead === true,
      serverGrouped: !!(previous?.serverGrouped || notification.serverGrouped
        || (notification.notificationIds?.length && !notification.queueListingId)),
    });
  }
  for (const transaction of groupPendingExchanges(transactions.filter(exchangeIsActive), userId)) {
    const key = transaction.queueListingId ? `queue:${transaction.queueListingId}` : `exchange:${transaction.id}`;
    const notice = groups.get(key);
    groups.set(key, { ...notice, id: key, exchange: transaction,
      transactionId: transaction.queueListingId ? undefined : transaction.id,
      queueListingId: transaction.queueListingId, isRead: notice?.isRead ?? true,
      notificationIds: notice?.notificationIds || [], createdAt: notice?.createdAt || transaction.createdAt,
    });
  }
  return [...groups.values()].map(row => {
    const exchange = row.exchange || (!row.discussionId && !row.threadId && row.transactionId && byId.get(row.transactionId));
    if (!exchange) return row;
    const action = exchangeHomeAction(exchange, userId);
    const disputeId = row.disputeId || exchange.disputeId;
    const currentIssue = exchange.status === 'disputed' && row.type?.startsWith('dispute');
    const failedPayment = row.type === 'payment_failed' && ['pending', 'approved'].includes(exchange.status);
    return { ...row, exchange, title: exchange.listing?.title || row.listingTitle || 'Shared item',
      body: (currentIssue || failedPayment) && row.body ? row.body : exchangeStatus(exchange, userId), action,
      destination: disputeId ? { name: 'DisputeDetail', params: { id: disputeId } }
        : exchange.queueListingId ? { name: 'RequestQueue', params: { listingId: exchange.queueListingId } }
        : { name: 'TransactionDetail', params: { id: exchange.id } },
    };
  }).sort((a, b) => Number(!!b.action) - Number(!!a.action)
    || (a.action?.priority ?? 99) - (b.action?.priority ?? 99)
    || Number(!!b.exchange && exchangeIsActive(b.exchange)) - Number(!!a.exchange && exchangeIsActive(a.exchange))
    || stamp(b.createdAt) - stamp(a.createdAt) || String(a.id).localeCompare(String(b.id)));
}
