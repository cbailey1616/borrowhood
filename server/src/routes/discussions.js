import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { sendNotification } from '../services/notifications.js';

const router = Router();

// ============================================
// GET /api/listings/:listingId/discussions
// Get top-level discussion posts for a listing
// ============================================
router.get('/:listingId/discussions', authenticate, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await query(
      `SELECT d.id, d.content, d.reply_count, d.created_at, d.updated_at,
              u.id as user_id, u.first_name, u.last_name, u.profile_photo_url
       FROM listing_discussions d
       JOIN users u ON d.user_id = u.id
       WHERE d.listing_id = $1 AND d.parent_id IS NULL AND d.is_hidden = false
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.listingId, limit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM listing_discussions
       WHERE listing_id = $1 AND parent_id IS NULL AND is_hidden = false`,
      [req.params.listingId]
    );

    res.json({
      posts: result.rows.map(d => ({
        id: d.id,
        content: d.content,
        replyCount: d.reply_count,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        user: {
          id: d.user_id,
          firstName: d.first_name,
          lastName: d.last_name,
          profilePhotoUrl: d.profile_photo_url,
        },
        isOwn: d.user_id === req.user.id,
      })),
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Get discussions error:', err);
    res.status(500).json({ error: 'Failed to get discussions' });
  }
});

// ============================================
// GET /api/listings/:listingId/discussions/:postId/replies
// Get replies to a discussion post
// ============================================
router.get('/:listingId/discussions/:postId/replies', authenticate, async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await query(
      `SELECT d.id, d.content, d.created_at, d.updated_at,
              u.id as user_id, u.first_name, u.last_name, u.profile_photo_url
       FROM listing_discussions d
       JOIN users u ON d.user_id = u.id
       WHERE d.parent_id = $1 AND d.is_hidden = false
       ORDER BY d.created_at ASC
       LIMIT $2 OFFSET $3`,
      [req.params.postId, limit, offset]
    );

    res.json({
      replies: result.rows.map(d => ({
        id: d.id,
        content: d.content,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        user: {
          id: d.user_id,
          firstName: d.first_name,
          lastName: d.last_name,
          profilePhotoUrl: d.profile_photo_url,
        },
        isOwn: d.user_id === req.user.id,
      })),
    });
  } catch (err) {
    console.error('Get replies error:', err);
    res.status(500).json({ error: 'Failed to get replies' });
  }
});

// ============================================
// POST /api/listings/:listingId/discussions
// Create a new discussion post or reply
// ============================================
router.post('/:listingId/discussions', authenticate,
  body('content').trim().isLength({ min: 1, max: 2000 }),
  body('parentId').optional().isUUID(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, parentId } = req.body;
    const { listingId } = req.params;

    try {
      // Verify listing exists
      const listing = await query(
        'SELECT id, owner_id, title FROM listings WHERE id = $1 AND status = $2',
        [listingId, 'active']
      );

      if (listing.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      const listingData = listing.rows[0];

      // If replying, verify parent exists and belongs to this listing
      if (parentId) {
        const parent = await query(
          'SELECT id, user_id, listing_id FROM listing_discussions WHERE id = $1 AND is_hidden = false',
          [parentId]
        );

        if (parent.rows.length === 0) {
          return res.status(404).json({ error: 'Parent post not found' });
        }

        if (parent.rows[0].listing_id !== listingId) {
          return res.status(400).json({ error: 'Parent post does not belong to this listing' });
        }
      }

      // Create the post
      const result = await query(
        `INSERT INTO listing_discussions (listing_id, user_id, parent_id, content)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [listingId, req.user.id, parentId || null, content]
      );

      const post = result.rows[0];

      // Get poster's name for notifications
      const posterResult = await query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [req.user.id]
      );
      const posterName = `${posterResult.rows[0].first_name} ${posterResult.rows[0].last_name}`;

      // Send notifications
      if (parentId) {
        // Replying to a post - notify the original poster (if not self)
        const parent = await query(
          'SELECT user_id FROM listing_discussions WHERE id = $1',
          [parentId]
        );
        const parentUserId = parent.rows[0].user_id;

        if (parentUserId !== req.user.id) {
          await sendNotification(
            parentUserId,
            'discussion_reply',
            {
              posterName,
              itemTitle: listingData.title,
              messagePreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
            },
            {
              fromUserId: req.user.id,
              listingId,
              discussionId: post.id,
            }
          );
        }
      } else {
        // New top-level comment - notify listing owner (if not self)
        if (listingData.owner_id !== req.user.id) {
          await sendNotification(
            listingData.owner_id,
            'listing_comment',
            {
              posterName,
              itemTitle: listingData.title,
              messagePreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
            },
            {
              fromUserId: req.user.id,
              listingId,
              discussionId: post.id,
            }
          );
        }
      }

      res.status(201).json({
        id: post.id,
        content,
        parentId: parentId || null,
        createdAt: post.created_at,
        user: {
          id: req.user.id,
          firstName: posterResult.rows[0].first_name,
          lastName: posterResult.rows[0].last_name,
        },
      });
    } catch (err) {
      console.error('Create discussion error:', err);
      res.status(500).json({ error: 'Failed to create post' });
    }
  }
);

// ============================================
// DELETE /api/listings/:listingId/discussions/:postId
// Delete a discussion post (author or listing owner only)
// ============================================
router.delete('/:listingId/discussions/:postId', authenticate, async (req, res) => {
  const { listingId, postId } = req.params;

  try {
    // Get the post and listing info
    const result = await query(
      `SELECT d.user_id as post_user_id, l.owner_id as listing_owner_id
       FROM listing_discussions d
       JOIN listings l ON d.listing_id = l.id
       WHERE d.id = $1 AND d.listing_id = $2`,
      [postId, listingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { post_user_id, listing_owner_id } = result.rows[0];

    // Check authorization - post author or listing owner can delete
    if (req.user.id !== post_user_id && req.user.id !== listing_owner_id) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    // Soft delete by hiding
    await query(
      `UPDATE listing_discussions
       SET is_hidden = true, hidden_by = $1, hidden_at = NOW()
       WHERE id = $2`,
      [req.user.id, postId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Delete discussion error:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

export default router;
