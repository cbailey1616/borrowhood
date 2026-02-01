import { query } from '../utils/db.js';
import logger from '../utils/logger.js';

// Notification types and their templates
const NOTIFICATION_TEMPLATES = {
  // Borrow requests
  borrow_request: {
    title: 'New Borrow Request',
    body: (data) => data.borrowerName
      ? `${data.borrowerName} wants to borrow your ${data.itemTitle || 'item'}`
      : `Someone wants to borrow your item`,
  },
  request_approved: {
    title: 'Request Approved',
    body: (data) => data.itemTitle
      ? `Your request to borrow ${data.itemTitle} has been approved!`
      : 'Your borrow request has been approved!',
  },
  request_declined: {
    title: 'Request Declined',
    body: (data) => data.itemTitle
      ? `Your request to borrow ${data.itemTitle} was declined`
      : 'Your borrow request was declined',
  },

  // Transaction flow
  payment_confirmed: {
    title: 'Payment Received',
    body: (data) => data.itemTitle
      ? `Payment confirmed for ${data.itemTitle}. Ready for pickup!`
      : 'Payment confirmed. Ready for pickup!',
  },
  pickup_confirmed: {
    title: 'Item Picked Up',
    body: (data) => data.itemTitle
      ? `${data.itemTitle} has been picked up`
      : 'Your item has been picked up',
  },
  return_confirmed: {
    title: 'Item Returned',
    body: (data) => data.itemTitle
      ? `${data.itemTitle} has been returned`
      : 'Your item has been returned',
  },
  return_reminder: {
    title: 'Return Reminder',
    body: (data) => data.itemTitle
      ? `${data.itemTitle} is due back ${data.dueDate || 'soon'}`
      : `Your borrowed item is due back ${data.dueDate || 'soon'}`,
  },

  // Disputes
  dispute_opened: {
    title: 'Dispute Opened',
    body: (data) => data.itemTitle
      ? `A dispute has been opened for ${data.itemTitle}`
      : 'A dispute has been opened for your transaction',
  },
  dispute_resolved: {
    title: 'Dispute Resolved',
    body: (data) => data.itemTitle
      ? `The dispute for ${data.itemTitle} has been resolved`
      : 'Your dispute has been resolved',
  },

  // Ratings
  new_rating: {
    title: 'New Rating',
    body: (data) => data.raterName
      ? `${data.raterName} left you a ${data.rating}-star rating`
      : `You received a ${data.rating || 5}-star rating`,
  },
  rating_received: {
    title: 'New Rating',
    body: (data) => `You received a ${data.rating || 5}-star rating`,
  },

  // Community
  join_request: {
    title: 'Join Request',
    body: (data) => data.userName
      ? `${data.userName} wants to join ${data.communityName || 'your community'}`
      : 'Someone wants to join your community',
  },
  join_approved: {
    title: 'Welcome!',
    body: (data) => data.communityName
      ? `You've been approved to join ${data.communityName}`
      : 'Your membership has been approved!',
  },

  // Item requests (wanted items)
  item_match: {
    title: 'Item Match',
    body: (data) => data.itemTitle
      ? `Someone has ${data.itemTitle} that matches what you're looking for!`
      : 'An item matching your request is available!',
  },

  // Messages
  new_message: {
    title: 'New Message',
    body: (data) => data.senderName
      ? `${data.senderName}: ${data.messagePreview || 'Sent you a message'}`
      : 'You have a new message',
  },

  // Discussions
  discussion_reply: {
    title: 'Reply to Your Question',
    body: (data) => data.posterName
      ? `${data.posterName} replied to your question on ${data.itemTitle || 'a listing'}`
      : 'Someone replied to your question',
  },
  listing_comment: {
    title: 'New Question on Your Listing',
    body: (data) => data.posterName
      ? `${data.posterName} asked a question about ${data.itemTitle || 'your listing'}`
      : 'Someone asked a question about your listing',
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
  try {
    const template = NOTIFICATION_TEMPLATES[type];
    if (!template) {
      logger.warn(`Unknown notification type: ${type}`);
      return null;
    }

    const title = template.title;
    const body = typeof template.body === 'function' ? template.body(data) : template.body;

    // Create notification record
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, body, from_user_id, transaction_id, listing_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        userId,
        type,
        title,
        body,
        options.fromUserId || null,
        options.transactionId || null,
        options.listingId || null,
      ]
    );

    const notificationId = result.rows[0].id;

    // Get user's push token and preferences
    const user = await query(
      'SELECT push_token, notification_preferences FROM users WHERE id = $1',
      [userId]
    );

    if (user.rows.length > 0) {
      const { push_token, notification_preferences } = user.rows[0];
      const prefs = notification_preferences || {};

      // Send push notification if enabled and token exists
      if (push_token && prefs.push !== false) {
        await sendPushNotification(push_token, { title, body, data: { notificationId, type, ...data } });
      }
    }

    return notificationId;
  } catch (err) {
    logger.error('Send notification error:', err);
    return null;
  }
}

/**
 * Send push notification via Expo Push Service
 * Borrowhood uses React Native with Expo, so we use Expo's push service
 */
async function sendPushNotification(pushToken, { title, body, data }) {
  try {
    // Validate Expo push token format
    if (!pushToken.startsWith('ExponentPushToken[')) {
      logger.warn('Invalid Expo push token format');
      return;
    }

    const message = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.data?.status === 'error') {
      logger.warn('Push notification error:', result.data.message);
    }

    return result;
  } catch (err) {
    logger.error('Push notification send error:', err);
  }
}

/**
 * Send notification to multiple users
 */
export async function sendBulkNotification(userIds, type, data, options = {}) {
  const results = await Promise.allSettled(
    userIds.map(userId => sendNotification(userId, type, data, options))
  );

  return results.map((r, i) => ({
    userId: userIds[i],
    success: r.status === 'fulfilled',
    notificationId: r.status === 'fulfilled' ? r.value : null,
  }));
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
