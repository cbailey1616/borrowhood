import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/notifications
// Get user's notifications
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { unreadOnly, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let whereClause = 'n.user_id = $1';
    if (unreadOnly === 'true') {
      whereClause += ' AND n.is_read = false';
    }

    const result = await query(
      `SELECT n.*,
              u.first_name as from_first_name, u.last_name as from_last_name,
              u.profile_photo_url as from_photo
       FROM notifications n
       LEFT JOIN users u ON n.from_user_id = u.id
       WHERE ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    // Get unread count
    const unreadCount = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      notifications: result.rows.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        transactionId: n.transaction_id,
        listingId: n.listing_id,
        fromUser: n.from_first_name ? {
          firstName: n.from_first_name,
          lastName: n.from_last_name,
          profilePhotoUrl: n.from_photo,
        } : null,
        isRead: n.is_read,
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
        'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
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
  try {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
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
router.patch('/preferences', authenticate, async (req, res) => {
  const { email, push } = req.body;

  try {
    const current = await query(
      'SELECT notification_preferences FROM users WHERE id = $1',
      [req.user.id]
    );

    const prefs = current.rows[0].notification_preferences || {};

    if (email !== undefined) prefs.email = email;
    if (push !== undefined) prefs.push = push;

    await query(
      'UPDATE users SET notification_preferences = $1 WHERE id = $2',
      [JSON.stringify(prefs), req.user.id]
    );

    res.json({ success: true, preferences: prefs });
  } catch (err) {
    console.error('Update preferences error:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
