import { screenContent } from '../services/contentPolicy.js';
import { communityConversations } from '../services/communityChat.js';
import { listingAccessSql } from '../utils/sharingPolicy.js';
import { canViewListing } from '../services/listingAccess.js';
import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { deliverMessage } from '../services/chatDelivery.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { sendNotification } from '../services/notifications.js';

const router = Router();
router.use(screenContent());

router.get('/capabilities', authenticate, async (req, res) => {
  try {
    const schema = await query(`SELECT COUNT(*)::int AS count FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'messages'
      AND column_name IN ('client_request_id', 'client_request_hash')`);
    const index = await query("SELECT to_regclass('idx_messages_client_request') AS ready");
    const threads = await query(`SELECT COUNT(*)::int AS count FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'messages' AND column_name IN ('parent_id','reply_to_id')`);
    res.json({ idempotentMessages: schema.rows[0]?.count === 2 && !!index.rows[0]?.ready, threadedMessages: threads.rows[0]?.count === 2 });
  } catch { res.json({ idempotentMessages: false }); }
});

// ============================================
// GET /api/messages/conversations
// List user's conversations
// ============================================
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT
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
           WHEN c.user1_id = $1 THEN COALESCE(NULLIF(TRIM(u2.display_name), ''), u2.first_name)
           ELSE COALESCE(NULLIF(TRIM(u1.display_name), ''), u1.first_name)
         END as other_first_name,
         CASE
           WHEN c.user1_id = $1 THEN CASE WHEN NULLIF(TRIM(u2.display_name), '') IS NOT NULL THEN '' WHEN u2.last_name IS NOT NULL THEN LEFT(u2.last_name, 1) || '.' ELSE '' END
           ELSE CASE WHEN NULLIF(TRIM(u1.display_name), '') IS NOT NULL THEN '' WHEN u1.last_name IS NOT NULL THEN LEFT(u1.last_name, 1) || '.' ELSE '' END
         END as other_last_name,
         CASE
           WHEN c.user1_id = $1 THEN u2.profile_photo_url
           ELSE u1.profile_photo_url
         END as other_photo_url,
         CASE WHEN c.user1_id = $1 THEN u2.is_verified ELSE u1.is_verified END AS other_verified,
         m.content as last_message,
         m.created_at as last_message_at,
         m.sender_id as last_message_sender,
         m.deleted_at as last_message_deleted_at,
         m.image_url as last_message_image_url,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND is_read = false) as unread_count
       FROM conversations c
       JOIN users u1 ON c.user1_id = u1.id
       JOIN users u2 ON c.user2_id = u2.id
       LEFT JOIN listings l ON c.listing_id = l.id AND ${listingAccessSql('l', '$1')}
       LEFT JOIN LATERAL (
         SELECT content, created_at, sender_id, deleted_at, image_url
         FROM messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       WHERE c.user1_id = $1 OR c.user2_id = $1
       ORDER BY COALESCE(m.created_at, c.created_at) DESC, c.id DESC`,
      [req.user.id]
    );

    const direct = result.rows.map(c => ({
      id: c.id,
      listing: c.listing_title ? {
        id: c.listing_id,
        title: c.listing_title,
        photoUrl: c.listing_photo,
      } : null,
      otherUser: {
        id: c.other_user_id,
        firstName: c.other_first_name,
        lastName: c.other_last_name,
        profilePhotoUrl: c.other_photo_url,
        isVerified: c.other_verified === true,
      },
      lastMessage: c.last_message_deleted_at ? 'This message was deleted' : c.last_message_image_url && !c.last_message ? 'Sent a photo' : c.last_message,
      lastMessageAt: c.last_message_at,
      lastMessageSenderId: c.last_message_sender,
      unreadCount: parseInt(c.unread_count) || 0,
      createdAt: c.created_at,
    }));
    const groups = await communityConversations(req.user.id);
    res.json([...direct, ...groups].sort((a, b) =>
      (Date.parse(b.lastMessageAt || b.createdAt) || 0) - (Date.parse(a.lastMessageAt || a.createdAt) || 0)
      || a.id.localeCompare(b.id)));
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
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const threadId = req.query.threadId;
  const threaded = req.query.threaded === 'true' || !!threadId;
  if (threadId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId)) return res.status(400).json({ error: 'Invalid thread' });

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
    let root = null;
    if (threadId) {
      const parent = await query('SELECT id, sender_id, content, image_url, deleted_at, created_at FROM messages WHERE id=$1 AND conversation_id=$2 AND parent_id IS NULL', [threadId, req.params.id]);
      root = parent.rows[0];
      if (!root) return res.status(404).json({ error: 'Message thread not found' });
    }

    // Get other user info
    const otherUserId = conv.user1_id === req.user.id ? conv.user2_id : conv.user1_id;
    const otherUser = await query(
      'SELECT id, first_name, last_name, display_name, profile_photo_url FROM users WHERE id = $1',
      [otherUserId]
    );

    // Get listing info if exists
    let listing = null;
    if (conv.listing_id) {
      const listingResult = await query(
        `SELECT l.id, l.title,
                (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url
         FROM listings l WHERE l.id = $1 AND ${listingAccessSql('l', '$2')}`,
        [conv.listing_id, req.user.id]
      );
      if (listingResult.rows.length > 0) {
        listing = {
          id: listingResult.rows[0].id,
          title: listingResult.rows[0].title,
          photoUrl: listingResult.rows[0].photo_url,
        };
      }
    }

    // Read state only clears the viewer's own unread badge. Do not return it
    // to either participant as a receipt for the other person's activity.
    if (!threaded) await query(
      'UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false',
      [req.params.id, req.user.id]
    );

    // Get messages
    const messages = await query(
      `SELECT m.id, m.sender_id, m.content, m.created_at, m.deleted_at, m.image_url, m.parent_id, m.reply_to_id,
         (SELECT COUNT(*)::int FROM messages r WHERE r.conversation_id=m.conversation_id AND r.parent_id=m.id) AS reply_count,
         (SELECT COUNT(*)::int FROM messages r WHERE r.conversation_id=m.conversation_id AND r.parent_id=m.id AND r.sender_id!=$4 AND r.is_read=false) AS unread_reply_count
       FROM messages m
       WHERE m.conversation_id = $1 ${threadId ? 'AND m.parent_id=$5' : threaded ? 'AND m.parent_id IS NULL' : ''}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset, req.user.id, ...(threadId ? [threadId] : [])]
    );
    if (threaded) await query('UPDATE messages SET is_read=true WHERE id=ANY($1::uuid[]) AND sender_id!=$2', [messages.rows.map(m=>m.id).concat(root ? [root.id] : []), req.user.id]);

    // Batch-load reactions for returned messages
    const messageIds = messages.rows.map(m => m.id).concat(root ? [root.id] : []);
    let reactionsMap = {};
    if (messageIds.length > 0) {
      const reactions = await query(
        `SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id = ANY($1)`,
        [messageIds]
      );
      for (const r of reactions.rows) {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push({ userId: r.user_id, emoji: r.emoji });
      }
    }

    res.json({
      conversation: {
        id: conv.id,
        listing,
        otherUser: otherUser.rows[0] ? {
          id: otherUser.rows[0].id,
          firstName: otherUser.rows[0].display_name || otherUser.rows[0].first_name,
          lastName: otherUser.rows[0].display_name ? '' : (otherUser.rows[0].last_name ? otherUser.rows[0].last_name.charAt(0) + '.' : ''),
          profilePhotoUrl: otherUser.rows[0].profile_photo_url,
        } : null,
      },
      thread: root ? { id: root.id, senderId: root.sender_id, content: root.deleted_at ? null : root.content,
        imageUrl: root.deleted_at ? null : root.image_url, isDeleted: !!root.deleted_at, createdAt: root.created_at, isOwnMessage: root.sender_id === req.user.id, reactions: reactionsMap[root.id] || [] } : null,
      hasMore: messages.rows.length === limit,
      messages: messages.rows.map(m => ({
        id: m.id,
        senderId: m.sender_id,
        parentId: m.parent_id || null,
        replyToId: m.reply_to_id || null,
        replyCount: m.reply_count || 0,
        unreadReplyCount: m.unread_reply_count || 0,
        content: m.deleted_at ? null : m.content,
        imageUrl: m.deleted_at ? null : m.image_url,
        isDeleted: !!m.deleted_at,
        createdAt: m.created_at,
        isOwnMessage: m.sender_id === req.user.id,
        reactions: reactionsMap[m.id] || [],
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
  body('content').optional().trim().isLength({ min: 1, max: 2000 }),
  body('imageUrl').optional().isString(),
  body('listingId').optional().isUUID(),
  body('clientRequestId').optional().isUUID(),
  body('parentId').optional().isUUID(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { recipientId, content, imageUrl, listingId, clientRequestId, parentId } = req.body;

    if (!content && !imageUrl) {
      return res.status(400).json({ error: 'Message must have content or an image' });
    }

    if (recipientId === req.user.id) {
      return res.status(400).json({ error: 'Cannot message yourself' });
    }

    try {
      if (listingId) {
        // Attaching an item to a chat must not grant either participant access.
        const access = await Promise.all([
          canViewListing(listingId, req.user.id), canViewListing(listingId, recipientId),
        ]);
        if (access.some(allowed => !allowed)) return res.status(404).json({ error: 'Listing not found' });
      }
      const message = await withTransaction(client => deliverMessage(client, {
        senderId: req.user.id, recipientId, content, imageUrl, listingId, clientRequestId, parentId,
      }));
      const conversationId = message.conversation_id;

      if (!message.replayed) {
        try {
          // Get sender name for notification
          const sender = await query(
            'SELECT first_name, display_name FROM users WHERE id = $1',
            [req.user.id]
          );

          // Send notification to recipient
          const preview = imageUrl && !content ? 'Sent a photo' : (content || '').substring(0, 50) + ((content || '').length > 50 ? '...' : '');
          await sendNotification(
            recipientId,
            'new_message',
            {
              senderName: sender.rows[0]?.display_name || sender.rows[0]?.first_name || 'Someone',
              messagePreview: preview,
              conversationId,
              ...(message.parent_id ? { threadId: message.parent_id } : {}),
            },
            { fromUserId: req.user.id }
          ).catch(err => console.error('Message notification failed:', err.message));
        } catch (error) {
          console.error('Message saved; notification preparation failed:', error.message);
        }
      }

      res.status(message.replayed ? 200 : 201).json({
        id: message.id,
        conversationId,
        parentId: message.parent_id || null,
        replyToId: message.reply_to_id || null,
        content: content || null,
        imageUrl: imageUrl || null,
        createdAt: message.created_at,
      });

    } catch (err) {
      console.error('Send message error:', err);
      const expectedError = [403, 404, 409].includes(err.status);
      res.status(expectedError ? err.status : 500).json({ error: expectedError ? err.message : 'Failed to send message' });
    }
  }
);

// ============================================
// DELETE /api/messages/:id
// Soft delete a message (owner only)
// ============================================
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const msg = await query(
      'SELECT id, sender_id FROM messages WHERE id = $1',
      [req.params.id]
    );

    if (msg.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (msg.rows[0].sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Can only delete your own messages' });
    }

    await query(
      'UPDATE messages SET deleted_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

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

// ============================================
// POST /api/messages/:id/react
// Add or update emoji reaction on a message
// ============================================
const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👎'];

router.post('/:id/react', authenticate,
  body('emoji').isString().isIn(ALLOWED_EMOJIS).withMessage('Invalid emoji'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Verify message exists and user has access
      const msg = await query(
        `SELECT m.id FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.id = $1 AND (c.user1_id = $2 OR c.user2_id = $2)`,
        [req.params.id, req.user.id]
      );

      if (msg.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Each user can add each emoji once.
      await query(
        `INSERT INTO message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id, emoji)
         DO NOTHING`,
        [req.params.id, req.user.id, req.body.emoji]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('React to message error:', err);
      res.status(500).json({ error: 'Failed to react to message' });
    }
  }
);

// ============================================
// DELETE /api/messages/:id/react
// Remove own reaction from a message
// ============================================
router.delete('/:id/react', authenticate, async (req, res) => {
  try {
    await query(
      'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND ($3::text IS NULL OR emoji = $3)',
      [req.params.id, req.user.id, req.query.emoji || null]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Remove reaction error:', err);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

export default router;
