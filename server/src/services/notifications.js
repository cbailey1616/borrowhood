import { query } from '../utils/db.js';
import logger from '../utils/logger.js';
import { returnCompleteBody, giveawayCompleteBody } from './notificationCopy.js';
import { INCOMING_REQUEST_TYPES, requestQueueCopy } from './requestActivity.js';

// Notification types and their templates
const NOTIFICATION_TEMPLATES = {
  verification_failed: { title: 'Verification needs another look', body: () => 'Open Stripe to try verification again.' },
  circle_invite: { title: 'You’re invited', body: data => `${data.inviterName || 'A neighbor'} invited you to ${data.circleName || 'a circle'}.` },
  rank_ready: { title: 'Your neighbor rating is ready', body: data => data.body },
  rank_up: { title: 'You moved up!', body: data => data.body },
  rank_down: { title: 'Neighbor rating update', body: data => data.body },
  // Borrow requests
  borrow_request: {
    title: 'New Borrow Request',
    body: (data) => data.borrowerName
      ? `${data.borrowerName} wants to borrow your ${data.itemTitle || 'item'}. Tap to review their request.`
      : 'You have a new borrow request. Tap to review and respond.',
  },
  giveaway_claim: {
    title: 'Someone Wants Your Item!',
    body: (data) => data.borrowerName
      ? `${data.borrowerName} ${data.isSale ? 'wants to buy' : 'wants'} your ${data.itemTitle || 'item'}. Tap to review their request.`
      : 'Someone wants your item. Tap to review.',
  },
  request_approved: {
    title: 'Request approved',
    body: (data) => `${data.lenderName || 'Your neighbor'} approved your request${data.itemTitle ? ` for ${data.itemTitle}` : ''}. Tap to arrange pickup.`,
  },
  request_declined: {
    title: 'Request declined',
    body: (data) => data.itemTitle
      ? `Your request for ${data.itemTitle} was declined. Tap to view your request.`
      : 'Your request was declined. Tap to view your request.',
  },
  borrow_cancelled: {
    title: 'Borrow cancelled',
    body: data => data.itemTitle
      ? `The pickup for ${data.itemTitle} was cancelled. No pickup is expected.`
      : 'This borrow was cancelled. No pickup is expected.',
  },

  // Transaction flow
  payment_confirmed: {
    title: 'Payment Confirmed',
    body: (data) => data.itemTitle
      ? `You're all set! ${data.itemTitle} is ready for pickup. Tap to see details.`
      : 'You\'re all set! Your item is ready for pickup. Tap to see details.',
  },
  pickup_confirmed: {
    title: 'Pickup confirmed',
    body: (data) => {
      const returnBy = data.returnDate
        ? ` Return due ${new Date(data.returnDate).toLocaleDateString()}.`
        : '';
      return data.itemTitle
        ? `${data.itemTitle} has been picked up.${returnBy} Tap to view your exchange.`
        : `The item has been picked up.${returnBy} Tap to view your exchange.`;
    },
  },
  return_confirmed: {
    title: 'Return Complete',
    body: returnCompleteBody,
  },
  deposit_released: {
    title: 'Deposit Refunded',
    body: (data) => data.itemTitle
      ? `Your deposit for ${data.itemTitle} has been refunded. Tap to view details.`
      : 'Your security deposit has been refunded. Tap to view details.',
  },
  giveaway_complete: {
    title: 'Pickup complete',
    body: giveawayCompleteBody,
  },
  giveaway_expired: {
    title: 'Request Expired',
    body: (data) => data.itemTitle
      ? `Your request for ${data.itemTitle} expired because the owner didn't respond in time.`
      : 'Your item request expired because the owner didn\'t respond in time.',
  },
  giveaway_pickup_expired: {
    title: 'Pickup Expired',
    body: (data) => data.itemTitle
      ? `The pickup window for ${data.itemTitle} has expired. The item has been relisted.`
      : 'The pickup window has expired. The item has been relisted.',
  },
  return_reminder: {
    title: 'Return reminder',
    body: (data) => {
      const when = ['today', 'tomorrow'].includes(data.dueDate) ? data.dueDate : data.dueDate ? `on ${data.dueDate}` : 'soon';
      return data.itemTitle
        ? `${data.itemTitle} is due back ${when}. Tap to coordinate the return.`
        : `Your borrowed item is due back ${when}. Tap to coordinate the return.`;
    },
  },

  // Disputes
  dispute_opened: {
    title: 'Action Needed',
    body: (data) => data.itemTitle
      ? `A concern was raised about ${data.itemTitle}. Tap to review and respond.`
      : 'A concern was raised about your transaction. Tap to review and respond.',
  },
  dispute_resolved: {
    title: 'Issue Resolved',
    body: (data) => data.itemTitle
      ? `The issue with ${data.itemTitle} has been resolved. Tap to see the outcome.`
      : 'Your dispute has been resolved. Tap to see the outcome.',
  },

  dispute_counter_received: {
    title: 'Counter Offer Received',
    body: (data) => data.respondentName
      ? `${data.respondentName} sent a counter offer${data.counterAmount ? ` of $${parseFloat(data.counterAmount).toFixed(2)}` : ''}. Tap to review.`
      : 'You received a counter offer on your dispute. Tap to review.',
  },
  dispute_filed_against_you: {
    title: 'Action Needed',
    body: (data) => data.itemTitle
      ? `A ${data.typeLabel || 'concern'} was raised about ${data.itemTitle}. You have 48 hours to respond.`
      : 'An issue was raised about a recent transaction. You have 48 hours to respond.',
  },
  dispute_response_received: {
    title: 'Dispute Response',
    body: (data) => data.respondentName
      ? `${data.respondentName} responded to your dispute. Tap to review.`
      : 'The other party responded to your dispute. Tap to review.',
  },
  dispute_auto_advanced: {
    title: 'Response Window Closed',
    body: () => 'The 48-hour response window has passed. This dispute has been escalated for review. Tap to view details.',
  },
  dispute_ready_for_review: {
    title: 'Dispute Needs Review',
    body: (data) => data.itemTitle
      ? `A dispute about ${data.itemTitle} is ready for your review.`
      : 'A dispute in your community needs review.',
  },
  dispute_under_review: {
    title: 'Dispute Status Update',
    body: () => 'Your dispute has been advanced to review after no response was received.',
  },

  // Payment issues
  payment_failed: {
    title: 'Payment Issue',
    body: (data) => data.body || 'There was an issue processing a payment. Please check your account or contact support.',
  },

  // Ratings
  new_rating: {
    title: 'New Rating',
    body: (data) => data.raterName
      ? `${data.raterName} left you a rating. Tap to see what they said.`
      : 'You received a new rating. Tap to view it.',
  },
  rating_received: {
    title: 'New Rating',
    body: (data) => 'You received a new rating. Tap to view it.',
  },

  // Community
  join_request: {
    title: 'New Neighbor',
    body: (data) => data.userName
      ? `${data.userName} wants to join ${data.communityName || 'your community'}. Tap to review.`
      : 'Someone wants to join your community. Tap to review their request.',
  },
  join_approved: {
    title: 'Welcome to Borrowhood',
    body: () => 'You’re ready to browse and share with your neighbors. Tap to see nearby items.',
  },

  // A neighbor deliberately responded to an item request.
  request_offer: {
    title: 'New private offer',
    body: () => 'A neighbor offered an item for your request. Tap to view their offer.',
  },

  // New request posted
  new_request: {
    title: 'Neighbor Needs Help',
    body: (data) => data.firstName
      ? `${data.firstName} is looking for: ${data.title || 'something'}. Got one? Tap to help out.`
      : 'A neighbor posted a new request nearby. Tap to see if you can help.',
  },

  // Messages
  new_message: {
    title: 'New Message',
    body: (data) => data.senderName
      ? `${data.senderName}: ${data.messagePreview || 'Sent you a message'}`
      : 'You have a new message. Tap to read it.',
  },

  // Discussions
  discussion_reply: {
    title: 'New Reply',
    body: (data) => data.posterName
      ? `${data.posterName} replied in the conversation about ${data.itemTitle || 'a listing'}.`
      : 'There’s a new reply in your conversation.',
  },
  listing_comment: {
    title: 'New Question',
    body: (data) => data.posterName
      ? `${data.posterName} asked a question about ${data.itemTitle || 'your listing'}. Tap to respond.`
      : 'Someone asked about your listing. Tap to respond.',
  },
  request_comment: {
    title: 'New Response',
    body: (data) => data.posterName
      ? `${data.posterName} responded to your request for ${data.itemTitle || 'an item'}. Tap to view.`
      : 'Someone responded to your request. Tap to view.',
  },

  // Friends
  friend_request: {
    title: 'New Friend Request',
    body: (data) => data.fromName
      ? `${data.fromName} wants to connect with you on Borrowhood. Tap to respond.`
      : 'You have a new friend request. Tap to respond.',
  },
  friend_accepted: {
    title: 'You\'re connected!',
    body: (data) => data.friendName
      ? `${data.friendName} accepted your friend request. You can now see each other's items.`
      : 'Your friend request was accepted! You can now see each other\'s items.',
  },

  // Verification
  verification_expiring: {
    title: 'Temporary Access Expiring',
    body: () => 'Your temporary access expires soon — check your verification status.',
  },

  // Subscription
  subscription_expired: {
    title: 'Listings Updated',
    body: (data) => data.body || 'Your town-level listings have been moved to neighborhood visibility.',
  },

  // Referrals
  referral_joined: {
    title: 'Your friend joined!',
    body: (data) => data.friendName
      ? `${data.friendName} just joined Borrowhood thanks to you! Thanks for helping your neighborhood grow.`
      : 'Someone just joined using your referral code! Thanks for helping your neighborhood grow.',
  },
  referral_reward: {
    title: 'You earned free Plus!',
    body: () => 'Amazing — you\'ve unlocked free Plus for a year by inviting 3 friends! Enjoy the perks.',
  },
};

/**
 * Send a notification to a user
 * @param {string} userId - Recipient user ID
 * @param {string} type - Notification type (key from NOTIFICATION_TEMPLATES)
 * @param {object} data - Data for the notification template
 * @param {object} options - Additional options (fromUserId, transactionId, listingId)
 */
export async function sendNotification(userId, type, data, options = {}) {
  if (type === 'item_match') return null;
  try {
    const template = NOTIFICATION_TEMPLATES[type];
    if (!template) {
      logger.warn(`Unknown notification type: ${type}`);
      return null;
    }

    let title = template.title;
    let body = typeof template.body === 'function' ? template.body(data) : template.body;
    let queue = null;
    const listingId = options.listingId || data.listingId;
    if (INCOMING_REQUEST_TYPES.includes(type) && listingId) {
      const pending = await query(`SELECT l.title, COUNT(DISTINCT t.borrower_id) AS count
        FROM listings l JOIN borrow_transactions t ON t.listing_id = l.id
        WHERE l.id = $1 AND l.owner_id = $2 AND t.lender_id = $2 AND t.status = 'pending'
        GROUP BY l.id, l.title`, [listingId, userId]);
      if (Number(pending.rows[0]?.count) > 0) {
        queue = { queueListingId: listingId, requestCount: Number(pending.rows[0].count) };
        ({ title, body } = requestQueueCopy(queue.requestCount, pending.rows[0].title, data.borrowerName));
      }
    }

    const runQuery = options.runQuery || query;
    const pushData = options.activityOnly ? null : JSON.stringify({ ...data, ...queue });
    if (options.existingNotificationId) {
      const existing = await runQuery('UPDATE notifications SET push_data=$3 WHERE id=$1 AND user_id=$2 RETURNING id',
        [options.existingNotificationId, userId, pushData]);
      return existing.rows[0]?.id || null;
    }
    // The database trigger persists delivery jobs in this same transaction.
    const result = await runQuery(
      `INSERT INTO notifications (user_id, type, title, body, from_user_id, transaction_id, listing_id, request_id, conversation_id, dispute_id,
        discussion_id, thread_id, circle_id, push_data, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET dedupe_key=EXCLUDED.dedupe_key
       RETURNING id`,
      [
        userId,
        type,
        title,
        body,
        options.fromUserId || data.fromUserId || null,
        options.transactionId || data.transactionId || null,
        options.listingId || data.listingId || null,
        options.requestId || data.requestId || null,
        options.conversationId || data.conversationId || null,
        options.disputeId || data.disputeId || null,
        options.discussionId || data.discussionId || null,
        options.threadId || data.threadId || options.discussionId || data.discussionId || null,
        options.circleId || data.circleId || null,
        pushData,
        options.dedupeKey || null,
      ]
    );

    return result.rows[0].id;
  } catch (err) {
    if (options.throwOnError) throw err;
    logger.error('Send notification error:', err);
    return null;
  }
}

/**
 * Send notification to multiple users
 */
export async function sendBulkNotification(userIds, type, data, options = {}) {
  const recipients = [...new Set(userIds)];
  const results = [];
  for (let i = 0; i < recipients.length; i += 20) {
    results.push(...await Promise.all(recipients.slice(i, i + 20).map(async userId => {
      try {
        const notificationId = await sendNotification(userId, type, data, options);
        return { userId, success: !!notificationId, notificationId };
      } catch { return { userId, success: false, notificationId: null }; }
    })));
  }
  return results;
}

/**
 * Send notification to all organizers of a community
 */
export async function notifyOrganizers(communityId, type, data, options = {}) {
  const organizers = await query(
    `SELECT user_id FROM community_memberships
     WHERE community_id = $1 AND role = 'organizer'`,
    [communityId]
  );

  const organizerIds = organizers.rows.map(o => o.user_id);
  return sendBulkNotification(organizerIds, type, data, options);
}

export default { sendNotification, sendBulkNotification, notifyOrganizers };
