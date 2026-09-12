import { ACTIVITY_SQL } from './notificationPreferences.js';

export const INCOMING_REQUEST_TYPES = ['borrow_request', 'giveaway_claim'];

export function requestQueueCopy(count, itemTitle, name) {
  return {
    title: count > 1 ? `${count} people requested ${itemTitle || 'your item'}`
      : `${name || 'A neighbor'} requested ${itemTitle || 'your item'}`,
    body: 'See queue',
  };
}

// Group before pagination, and use this same projection for the unread badge.
// Records remain separate so acknowledging a viewed group never clears a
// request that arrived after the group was loaded.
export const ACTIVITY_SOURCE_SQL = `WITH activity_source AS (
  SELECT n.*,
    COALESCE(t.listing_id, n.listing_id) AS item_listing_id,
    l.title AS listing_title,
    CASE WHEN n.type IN ('borrow_request', 'giveaway_claim')
      AND t.status = 'pending' AND t.lender_id = $1 AND l.owner_id = $1
      THEN t.listing_id END AS queue_listing_id
  FROM notifications n
  LEFT JOIN borrow_transactions t ON t.id = n.transaction_id
  LEFT JOIN listings l ON l.id = COALESCE(t.listing_id, n.listing_id)
  WHERE n.user_id = $1 AND ${ACTIVITY_SQL}
    AND (n.type NOT IN ('borrow_request', 'giveaway_claim') OR t.id IS NULL OR t.status = 'pending')
)`;

export const UNREAD_ACTIVITY_SQL = `${ACTIVITY_SOURCE_SQL}
  SELECT COUNT(DISTINCT COALESCE('queue:' || queue_listing_id::text, id::text)) AS count
  FROM activity_source WHERE is_read = false`;

export const GROUPED_ACTIVITY_SQL = `${ACTIVITY_SOURCE_SQL}, activity AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY COALESCE('queue:' || queue_listing_id::text, id::text)
      ORDER BY created_at DESC, id DESC) AS newest,
    BOOL_AND(is_read) OVER (PARTITION BY COALESCE('queue:' || queue_listing_id::text, id::text)) AS group_is_read,
    ARRAY_AGG(id) OVER (PARTITION BY COALESCE('queue:' || queue_listing_id::text, id::text)) AS notification_ids
  FROM activity_source
)`;
