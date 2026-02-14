import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { sendNotification } from '../services/notifications.js';

const router = Router();

// ============================================
// GET /api/messages/conversations
// List user's conversations
// ============================================
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (c.id)
         c.id,
         c.listing_id,
         c.created_at,
         l.title as listing_title,
         (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as listing_photo,
         CASE
           WHEN c.user1_id = $1 THEN c.user2_id
           ELSE c.user1_id
         END as other_user_id,
         CASE
           WHEN c.user1_id = $1 THEN u2.first_name
           ELSE u1.first_name
         END as other_first_name,
         CASE
           WHEN c.user1_id = $1 THEN u2.last_name
           ELSE u1.last_name
         END as other_last_name,
         CASE
           WHEN c.user1_id = $1 THEN u2.profile_photo_url
           ELSE u1.profile_photo_url
         END as other_photo_url,
         m.content as last_message,
         m.created_at as last_message_at,
         m.sender_id as last_message_sender,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND is_read = false) as unread_count
       FROM conversations c
       JOIN users u1 ON c.user1_id = u1.id
       JOIN users u2 ON c.user2_id = u2.id
       LEFT JOIN listings l ON c.listing_id = l.id
       LEFT JOIN LATERAL (
         SELECT content, created_at, sender_id
         FROM messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       WHERE c.user1_id = $1 OR c.user2_id = $1
       ORDER BY c.id, m.created_at DESC NULLS LAST`,
      [req.user.id]
    );

    res.json(result.rows.map(c => ({
      id: c.id,
      listing: c.listing_id ? {
        id: c.listing_id,
        title: c.listing_title,
        photoUrl: c.listing_photo,
      } : null,
      otherUser: {
        id: c.other_user_id,
        firstName: c.other_first_name,
        lastName: c.other_last_name,
        profilePhotoUrl: c.other_photo_url,
      },
      lastMessage: c.last_message,
      lastMessageAt: c.last_message_at,
      lastMessageSenderId: c.last_message_sender,
      unreadCount: parseInt(c.unread_count) || 0,
      createdAt: c.created_at,
    })));
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// ============================================
// GET /api/messages/conversations/:id
// Get messages in a conversation
// ============================================
router.get('/conversations/:id', authenticate, async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Verify user is part of conversation
    const convCheck = await query(
      'SELECT * FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [req.params.id, req.user.id]
    );

    if (convCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conv = convCheck.rows[0];

    // Get other user info
    const otherUserId = conv.user1_id === req.user.id ? conv.user2_id : conv.user1_id;
    const otherUser = await query(
      'SELECT id, first_name, last_name, profile_photo_url FROM users WHERE id = $1',
      [otherUserId]
    );

    // Get listing info if exists
    let listing = null;
    if (conv.listing_id) {
      const listingResult = await query(
        `SELECT l.id, l.title,
                (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url
         FROM listings l WHERE l.id = $1`,
        [conv.listing_id]
      );
      if (listingResult.rows.length > 0) {
        listing = {
          id: listingResult.rows[0].id,
          title: listingResult.rows[0].title,
          photoUrl: listingResult.rows[0].photo_url,
        };
      }
    }

    // Mark messages as read
    await query(
      'UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false',
      [req.params.id, req.user.id]
    );

    // Get messages
    const messages = await query(
      `SELECT m.id, m.sender_id, m.content, m.is_read, m.created_at
       FROM messages m
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );

    res.json({
      conversation: {
        id: conv.id,
        listing,
        otherUser: otherUser.rows[0] ? {
          id: otherUser.rows[0].id,
          firstName: otherUser.rows[0].first_name,
          lastName: otherUser.rows[0].last_name,
          profilePhotoUrl: otherUser.rows[0].profile_photo_url,
        } : null,
      },
      messages: messages.rows.map(m => ({
        id: m.id,
        senderId: m.sender_id,
        content: m.content,
        isRead: m.is_read,
        createdAt: m.created_at,
        isOwnMessage: m.sender_id === req.user.id,
      })).reverse(), // Return oldest first
    });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// ============================================
// POST /api/messages
// Send a message (creates conversation if needed)
// ============================================
router.post('/', authenticate,
  body('recipientId').isUUID(),
  body('content').trim().isLength({ min: 1, max: 2000 }),
  body('listingId').optional().isUUID(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { recipientId, content, listingId } = req.body;

    if (recipientId === req.user.id) {
      return res.status(400).json({ error: 'Cannot message yourself' });
    }

    try {
      // Find or create conversation
      let conversationId;

      // Check if conversation exists (with or without listing context)
      const existingConv = await query(
        `SELECT id FROM conversations
         WHERE ((user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1))
         AND (listing_id = $3 OR ($3 IS NULL AND listing_id IS NULL))`,
        [req.user.id, recipientId, listingId || null]
      );

      if (existingConv.rows.length > 0) {
        conversationId = existingConv.rows[0].id;
      } else {
        // Create new conversation
        const newConv = await query(
          'INSERT INTO conversations (user1_id, user2_id, listing_id) VALUES ($1, $2, $3) RETURNING id',
          [req.user.id, recipientId, listingId || null]
        );
        conversationId = newConv.rows[0].id;
      }

      // Insert message
      const messageResult = await query(
        'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING id, created_at',
        [conversationId, req.user.id, content]
      );

      // Get sender name for notification
      const sender = await query(
        'SELECT first_name FROM users WHERE id = $1',
        [req.user.id]
      );

      // Send notification to recipient
      await sendNotification(
        recipientId,
        'new_message',
        {
          senderName: sender.rows[0]?.first_name || 'Someone',
          messagePreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
          conversationId,
        },
        { fromUserId: req.user.id }
      );

      res.status(201).json({
        id: messageResult.rows[0].id,
        conversationId,
        content,
        createdAt: messageResult.rows[0].created_at,
      });
    } catch (err) {
      console.error('Send message error:', err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

// ============================================
// POST /api/messages/conversations/:id/read
// Mark all messages in conversation as read
// ============================================
router.post('/conversations/:id/read', authenticate, async (req, res) => {
  try {
    // Verify user is part of conversation
    const convCheck = await query(
      'SELECT id FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [req.params.id, req.user.id]
    );

    if (convCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await query(
      'UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2',
      [req.params.id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
