import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, requireVerified } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { sendNotification, sendBulkNotification } from '../services/notifications.js';

const router = Router();

// ============================================
// GET /api/requests
// Browse open requests in user's communities
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { communityId, categoryId, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Get user's communities
    const communitiesResult = await query(
      'SELECT community_id FROM community_memberships WHERE user_id = $1',
      [req.user.id]
    );
    const communityIds = communitiesResult.rows.map(c => c.community_id);

    if (communityIds.length === 0) {
      return res.json([]);
    }

    let whereConditions = [`r.status = 'open'`, `(r.expires_at IS NULL OR r.expires_at > NOW())`];
    let params = [];
    let paramIndex = 1;

    // Filter by user's communities or specific community
    if (communityId) {
      whereConditions.push(`r.community_id = $${paramIndex++}`);
      params.push(communityId);
    } else {
      whereConditions.push(`r.community_id = ANY($${paramIndex++})`);
      params.push(communityIds);
    }

    // Category filter
    if (categoryId) {
      whereConditions.push(`r.category_id = $${paramIndex++}`);
      params.push(categoryId);
    }

    // Search
    if (search) {
      whereConditions.push(`to_tsvector('english', r.title || ' ' || COALESCE(r.description, '')) @@ plainto_tsquery($${paramIndex++})`);
      params.push(search);
    }

    // Don't show user's own requests in browse
    whereConditions.push(`r.user_id != $${paramIndex++}`);
    params.push(req.user.id);

    params.push(limit, offset);

    const result = await query(
      `SELECT r.*, u.first_name, u.last_name, u.profile_photo_url,
              c.name as category_name
       FROM item_requests r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    res.json(result.rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      neededFrom: r.needed_from,
      neededUntil: r.needed_until,
      visibility: r.visibility,
      status: r.status,
      category: r.category_name,
      requester: {
        id: r.user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        profilePhotoUrl: r.profile_photo_url,
      },
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('Get requests error:', err);
    res.status(500).json({ error: 'Failed to get requests' });
  }
});

// ============================================
// GET /api/requests/mine
// Get current user's requests
// ============================================
router.get('/mine', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, c.name as category_name
       FROM item_requests r
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.user_id = $1 AND r.status = 'open'
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      neededFrom: r.needed_from,
      neededUntil: r.needed_until,
      visibility: r.visibility,
      status: r.status,
      category: r.category_name,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      isExpired: r.expires_at ? new Date(r.expires_at) <= new Date() : false,
    })));
  } catch (err) {
    console.error('Get my requests error:', err);
    res.status(500).json({ error: 'Failed to get requests' });
  }
});

// ============================================
// GET /api/requests/:id
// Get request details
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, u.id as user_id, u.first_name, u.last_name, u.profile_photo_url,
              u.rating, u.rating_count, u.total_transactions,
              c.name as category_name
       FROM item_requests r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const r = result.rows[0];

    res.json({
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      neededFrom: r.needed_from,
      neededUntil: r.needed_until,
      visibility: r.visibility,
      status: r.status,
      category: r.category_name,
      categoryId: r.category_id,
      requester: {
        id: r.user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        profilePhotoUrl: r.profile_photo_url,
        rating: parseFloat(r.rating) || 0,
        ratingCount: r.rating_count,
        totalTransactions: r.total_transactions,
      },
      isOwner: r.user_id === req.user.id,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('Get request error:', err);
    res.status(500).json({ error: 'Failed to get request' });
  }
});

// ============================================
// POST /api/requests
// Create a new item request
// ============================================
router.post('/', authenticate,
  body('title').trim().isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ max: 2000 }),
  body('communityId').optional({ nullable: true }).isUUID(),
  body('categoryId').isUUID(),
  body('type').optional().isIn(['item', 'service']),
  body('neededFrom').optional().isISO8601(),
  body('neededUntil').optional().isISO8601(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let {
      title, description, communityId, categoryId,
      neededFrom, neededUntil, visibility, expiresIn, expiresAt,
      type
    } = req.body;

    type = type || 'item';

    // Compute expires_at value
    let expiresAtValue = null;
    if (expiresIn === 'never') {
      expiresAtValue = null; // No expiration
    } else if (expiresAt) {
      expiresAtValue = new Date(expiresAt); // Custom date
    } else {
      const expiresInMap = { '1d': '1 day', '3d': '3 days', '1w': '7 days' };
      expiresAtValue = expiresInMap[expiresIn] || '1 day';
    }

    // Convert visibility array to single enum value (widest scope)
    if (Array.isArray(visibility)) {
      visibility = visibility.includes('town') ? 'town'
        : visibility.includes('neighborhood') ? 'neighborhood'
        : 'close_friends';
    }
    if (!['close_friends', 'neighborhood', 'town'].includes(visibility)) {
      visibility = 'neighborhood';
    }

    try {
      // Verify user is member of community (if community specified)
      if (communityId) {
        const memberCheck = await query(
          'SELECT 1 FROM community_memberships WHERE user_id = $1 AND community_id = $2',
          [req.user.id, communityId]
        );

        if (memberCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Must be community member to post' });
        }
      }

      // Create request
      let result;
      if (expiresAtValue === null) {
        // No expiration
        result = await query(
          `INSERT INTO item_requests (
            user_id, community_id, category_id, title, description,
            needed_from, needed_until, visibility, status, expires_at, type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NULL, $9)
          RETURNING id`,
          [
            req.user.id, communityId, categoryId || null, title, description,
            neededFrom || null, neededUntil || null, visibility, type
          ]
        );
      } else if (expiresAtValue instanceof Date) {
        // Custom date
        result = await query(
          `INSERT INTO item_requests (
            user_id, community_id, category_id, title, description,
            needed_from, needed_until, visibility, status, expires_at, type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10)
          RETURNING id`,
          [
            req.user.id, communityId, categoryId || null, title, description,
            neededFrom || null, neededUntil || null, visibility, expiresAtValue, type
          ]
        );
      } else {
        // Interval string (1 day, 3 days, 7 days)
        result = await query(
          `INSERT INTO item_requests (
            user_id, community_id, category_id, title, description,
            needed_from, needed_until, visibility, status, expires_at, type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW() + $9::interval, $10)
          RETURNING id`,
          [
            req.user.id, communityId, categoryId || null, title, description,
            neededFrom || null, neededUntil || null, visibility, expiresAtValue, type
          ]
        );
      }

      const requestId = result.rows[0].id;
      res.status(201).json({ id: requestId });

      // Fire-and-forget: notify relevant users about the new request
      (async () => {
        try {
          // Get the creator's name
          const creator = await query('SELECT first_name FROM users WHERE id = $1', [req.user.id]);
          const firstName = creator.rows[0]?.first_name || 'Someone';

          let recipientIds = [];

          if (visibility === 'close_friends' || visibility === 'neighborhood' || visibility === 'town') {
            // For close_friends: notify user's accepted friends
            if (visibility === 'close_friends') {
              const friends = await query(
                `SELECT CASE WHEN user_id = $1 THEN friend_id ELSE user_id END as uid
                 FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
                [req.user.id]
              );
              recipientIds = friends.rows.map(f => f.uid);
            }

            // For neighborhood: notify community members
            if (visibility === 'neighborhood' && communityId) {
              const members = await query(
                'SELECT user_id FROM community_memberships WHERE community_id = $1 AND user_id != $2',
                [communityId, req.user.id]
              );
              recipientIds = members.rows.map(m => m.user_id);
            }

            // For town: notify all users in the same city/state
            if (visibility === 'town') {
              const userLocation = await query(
                'SELECT city, state FROM users WHERE id = $1',
                [req.user.id]
              );
              if (userLocation.rows[0]?.city) {
                const townUsers = await query(
                  'SELECT id FROM users WHERE city = $1 AND state = $2 AND id != $3',
                  [userLocation.rows[0].city, userLocation.rows[0].state, req.user.id]
                );
                recipientIds = townUsers.rows.map(u => u.id);
              }
            }
          }

          if (recipientIds.length > 0) {
            await sendBulkNotification(
              recipientIds,
              'new_request',
              { firstName, title, requestId },
              { fromUserId: req.user.id, requestId }
            );
          }
        } catch (notifErr) {
          console.error('Request notification error:', notifErr);
        }
      })();
    } catch (err) {
      console.error('Create request error:', err);
      res.status(500).json({ error: 'Failed to create request' });
    }
  }
);

// ============================================
// POST /api/requests/:id/renew
// Renew an expired request
// ============================================
router.post('/:id/renew', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT user_id, status FROM item_requests WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const status = result.rows[0].status;
    if (status !== 'open') {
      return res.status(400).json({ error: 'Only open requests can be renewed' });
    }

    const { expiresIn } = req.body;

    if (expiresIn === 'never') {
      await query(
        `UPDATE item_requests SET expires_at = NULL, created_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
    } else {
      const expiresInMap = { '1d': '1 day', '3d': '3 days', '1w': '7 days' };
      const interval = expiresInMap[expiresIn] || '1 day';
      await query(
        `UPDATE item_requests SET expires_at = NOW() + $1::interval, created_at = NOW() WHERE id = $2`,
        [interval, req.params.id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Renew request error:', err);
    res.status(500).json({ error: 'Failed to renew request' });
  }
});

// ============================================
// PATCH /api/requests/:id
// Update request
// ============================================
router.patch('/:id', authenticate,
  async (req, res) => {
    try {
      // Verify ownership
      const request = await query(
        'SELECT user_id FROM item_requests WHERE id = $1',
        [req.params.id]
      );

      if (request.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      if (request.rows[0].user_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const allowedFields = [
        'title', 'description', 'category_id', 'needed_from',
        'needed_until', 'visibility', 'status', 'type'
      ];

      const updates = [];
      const values = [];
      let paramIndex = 1;

      for (const field of allowedFields) {
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        let value = req.body[camelField];
        if (value !== undefined) {
          // Convert visibility array to single enum value
          if (field === 'visibility' && Array.isArray(value)) {
            value = value.includes('town') ? 'town'
              : value.includes('neighborhood') ? 'neighborhood'
              : 'close_friends';
          }
          updates.push(`${field} = $${paramIndex++}`);
          values.push(value);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id);

      await query(
        `UPDATE item_requests SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      res.json({ success: true });
    } catch (err) {
      console.error('Update request error:', err);
      res.status(500).json({ error: 'Failed to update request' });
    }
  }
);

// ============================================
// DELETE /api/requests/:id
// Close request (set status='closed')
// ============================================
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `UPDATE item_requests SET status = 'closed'
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or not authorized' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete request error:', err);
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

export default router;
