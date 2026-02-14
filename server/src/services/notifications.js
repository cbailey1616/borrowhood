import { query } from '../utils/db.js';
import logger from '../utils/logger.js';

// Notification types and their templates
const NOTIFICATION_TEMPLATES = {
  // Borrow requests
  borrow_request: {
    title: 'New Borrow Request',
    body: (data) => data.borrowerName
      ? `${data.borrowerName} wants to borrow your ${data.itemTitle || 'item'}. Tap to review their request.`
      : 'You have a new borrow request. Tap to review and respond.',
  },
  request_approved: {
    title: 'You\'re all set!',
    body: (data) => data.itemTitle
      ? `Great news — your request to borrow ${data.itemTitle} was approved! Tap to coordinate pickup.`
      : 'Great news — your borrow request was approved! Tap to coordinate pickup.',
  },
  request_declined: {
    title: 'Request Update',
    body: (data) => data.itemTitle
      ? `${data.itemTitle} isn't available right now. Tap to browse similar items nearby.`
      : 'This item isn\'t available right now. Tap to browse similar items nearby.',
  },

  // Transaction flow
  payment_confirmed: {
    title: 'Payment Confirmed',
    body: (data) => data.itemTitle
      ? `You're all set! ${data.itemTitle} is ready for pickup. Tap to see details.`
      : 'You\'re all set! Your item is ready for pickup. Tap to see details.',
  },
  pickup_confirmed: {
    title: 'Enjoy your borrow!',
    body: (data) => {
      const returnBy = data.returnDate
        ? ` Remember to return it by ${new Date(data.returnDate).toLocaleDateString()}.`
        : '';
      return data.itemTitle
        ? `${data.itemTitle} is now in your hands.${returnBy} Tap to view your rental.`
        : `Your item is now in your hands.${returnBy} Tap to view your rental.`;
    },
  },
  return_confirmed: {
    title: 'Return Complete',
    body: (data) => data.itemTitle
      ? `${data.itemTitle} has been returned. Tap to leave a rating for your neighbor.`
      : 'Your item has been returned. Tap to leave a rating for your neighbor.',
  },
  return_reminder: {
    title: 'Friendly Reminder',
    body: (data) => {
      const when = data.dueDate === 'today' ? 'today' : `on ${data.dueDate || 'soon'}`;
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

  // Ratings
  new_rating: {
    title: 'New Rating',
    body: (data) => data.raterName
      ? `${data.raterName} left you a ${data.rating}-star rating. Tap to see what they said.`
      : `You received a ${data.rating || 5}-star rating. Tap to view it.`,
  },
  rating_received: {
    title: 'New Rating',
    body: (data) => `You received a ${data.rating || 5}-star rating. Tap to view it.`,
  },

  // Community
  join_request: {
    title: 'New Neighbor',
    body: (data) => data.userName
      ? `${data.userName} wants to join ${data.communityName || 'your community'}. Tap to review.`
      : 'Someone wants to join your community. Tap to review their request.',
  },
  join_approved: {
    title: 'Welcome to the neighborhood!',
    body: (data) => data.communityName
      ? `You've been approved to join ${data.communityName}. Tap to start browsing items nearby.`
      : 'You\'re in! Tap to start browsing items from your neighbors.',
  },

  // Item requests (wanted items)
  item_match: {
    title: 'We found a match!',
    body: (data) => data.itemTitle
      ? `A neighbor has ${data.itemTitle} — just what you were looking for! Tap to check it out.`
      : 'An item matching your request is available nearby! Tap to check it out.',
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
      ? `${data.posterName} replied to your question on ${data.itemTitle || 'a listing'}. Tap to see their answer.`
      : 'Someone replied to your question. Tap to see their answer.',
  },
  listing_comment: {
    title: 'New Question',
    body: (data) => data.posterName
      ? `${data.posterName} asked a question about ${data.itemTitle || 'your listing'}. Tap to respond.`
      : 'Someone asked about your listing. Tap to respond.',
  },

  // Friends
  friend_request: {
    title: 'New Friend Request',
    body: (data) => data.fromName
      ? `${data.fromName} wants to connect with you on BorrowHood. Tap to respond.`
      : 'You have a new friend request. Tap to respond.',
  },
  friend_accepted: {
    title: 'You\'re connected!',
    body: (data) => data.friendName
      ? `${data.friendName} accepted your friend request. You can now see each other's items.`
      : 'Your friend request was accepted! You can now see each other\'s items.',
  },

  // Referrals
  referral_joined: {
    title: 'Your friend joined!',
    body: (data) => data.friendName
      ? `${data.friendName} just joined BorrowHood thanks to you! Keep sharing to unlock free Plus.`
      : 'Someone just joined using your referral code! Keep sharing to unlock free Plus.',
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
      `INSERT INTO notifications (user_id, type, title, body, from_user_id, transaction_id, listing_id, request_id, conversation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
      if (push_token && prefs.push !== false && prefs[type] !== false) {
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
