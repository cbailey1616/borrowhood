import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { currentNotificationBody } from '../services/notificationCopy.js';
import { GROUPED_ACTIVITY_SQL, UNREAD_ACTIVITY_SQL, requestQueueCopy } from '../services/requestActivity.js';

import { normalizedPreferences, validPreferenceKeys, preferencePatch } from '../services/notificationPreferences.js';

const router = Router();

// ============================================
// GET /api/notifications
// Get user's notifications
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { unreadOnly } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    let whereClause = 'n.newest = 1';
    if (unreadOnly === 'true') {
      whereClause += ' AND n.group_is_read = false';
    }

    const result = await query(
      `${GROUPED_ACTIVITY_SQL} SELECT n.*,
              u.first_name as from_first_name, u.last_name as from_last_name,
              u.display_name as from_display_name, u.profile_photo_url as from_photo,
              u.is_verified AS from_verified,
              (SELECT COUNT(DISTINCT t.borrower_id) FROM borrow_transactions t
                WHERE t.listing_id = n.queue_listing_id AND t.lender_id = $1 AND t.status = 'pending') AS request_count
       FROM activity n
       LEFT JOIN users u ON n.from_user_id = u.id
       WHERE ${whereClause}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    // Get unread count
    const unreadCount = await query(
      UNREAD_ACTIVITY_SQL,
      [req.user.id]
    );

    res.json({
      notifications: result.rows.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: currentNotificationBody(n.type, n.body),
        ...(n.queue_listing_id ? requestQueueCopy(Number(n.request_count), n.listing_title, n.from_display_name || n.from_first_name) : {}),
        transactionId: n.transaction_id,
        listingId: n.item_listing_id,
        listingTitle: n.listing_title,
        queueListingId: n.queue_listing_id,
        requestCount: n.queue_listing_id ? Number(n.request_count) : undefined,
        notificationIds: n.notification_ids,
        requestId: n.request_id,
        conversationId: n.conversation_id,
        disputeId: n.dispute_id,
        fromUserId: n.from_user_id,
        fromUser: n.from_first_name && Number(n.request_count) < 2 ? {
          firstName: n.from_display_name || n.from_first_name,
          lastName: n.from_display_name ? '' : (n.from_last_name ? n.from_last_name.charAt(0) + '.' : ''),
          profilePhotoUrl: n.from_photo,
          isVerified: n.from_verified === true,
        } : null,
        isRead: n.group_is_read,
        createdAt: n.created_at,
      })),
      unreadCount: parseInt(unreadCount.rows[0].count),
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// ============================================
// GET /api/notifications/badge-count
// Get combined unread badge count
// ============================================
router.get('/badge-count', authenticate, async (req, res) => {
  const userId = req.user.id;

  try {
    const [messagesResult, notificationsResult, actionsResult] = await Promise.all([
      query(
        `SELECT COUNT(*) FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.is_read = false AND m.sender_id != $1
         AND (c.user1_id = $1 OR c.user2_id = $1)`,
        [userId]
      ),
      query(
        UNREAD_ACTIVITY_SQL,
        [userId]
      ),
      query(
        `SELECT COUNT(*) FROM borrow_transactions WHERE (
         (lender_id = $1 AND status = 'pending')
         OR (borrower_id = $1 AND status = 'approved')
         OR (lender_id = $1 AND status = 'return_pending'))`,
        [userId]
      ),
    ]);

    const messages = parseInt(messagesResult.rows[0].count);
    const notifications = parseInt(notificationsResult.rows[0].count);
    const actions = parseInt(actionsResult.rows[0].count);

    res.json({
      messages,
      notifications,
      actions,
      total: messages + notifications + actions,
    });
  } catch (err) {
    console.error('Get badge count error:', err);
    res.status(500).json({ error: 'Failed to get badge count' });
  }
});

// ============================================
// POST /api/notifications/:id/read
// Mark notification as read
// ============================================
router.post('/:id/read', authenticate, async (req, res) => {
  const ids = req.body?.notificationIds || [req.params.id];
  if (!Array.isArray(ids) || !ids.length || ids.length > 2000 || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return res.status(400).json({ error: 'Choose valid notifications.' });
  }
  try {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [ids, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ============================================
// POST /api/notifications/read-all
// Mark all notifications as read
// ============================================
router.post('/read-all', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// ============================================
// PUT /api/notifications/push-token
// Update push notification token
// ============================================
router.put('/push-token', authenticate, async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  try {
    await query(
      'UPDATE users SET push_token = $1 WHERE id = $2',
      [token, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Update push token error:', err);
    res.status(500).json({ error: 'Failed to update push token' });
  }
});

// ============================================
// PATCH /api/notifications/preferences
// Update notification preferences
// ============================================
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT notification_preferences FROM users WHERE id = $1', [req.user.id]);
    res.json(normalizedPreferences(result.rows[0]?.notification_preferences || {}));
  } catch (err) {
    console.error('Get notification preferences error:', err);
    res.status(500).json({ error: 'Could not load notification settings' });
  }
});

router.patch('/preferences', authenticate, async (req, res) => {
  const prefs = req.body;
  if (!prefs || Array.isArray(prefs) || Object.entries(prefs).some(([key,value]) => !validPreferenceKeys.has(key) || typeof value !== 'boolean')) {
    return res.status(400).json({ error: 'Choose valid notification settings' });
  }
  // Keep the older master switch in sync; merge atomically so rapid toggles
  // cannot overwrite another preference saved in parallel.
  const patch = preferencePatch(prefs);
  try {
    const result = await query(`UPDATE users SET notification_preferences =
      COALESCE(notification_preferences, '{}'::jsonb) || $1::jsonb WHERE id = $2 RETURNING notification_preferences`,
      [JSON.stringify(patch), req.user.id]);
    res.json({ success: true, preferences: normalizedPreferences(result.rows[0].notification_preferences) });
  } catch (err) {
    console.error('Update preferences error:', err);
    res.status(500).json({ error: 'Could not save notification settings' });
  }
});

export default router;
