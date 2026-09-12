import { ownedPhotoReferences } from '../services/privatePhotos.js';
import { townPreviewSql, canPreviewTownPost, townRequestPreview } from '../services/townPreview.js';
import { listingAccessSql, requestAccessSql } from '../utils/sharingPolicy.js';
import { canViewRequest, offerListing } from '../services/listingAccess.js';
import { REQUIRE_IDENTITY_VERIFICATION } from '../utils/constants.js';
import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { authenticate, requireVerified, ENABLE_PAID_TIERS } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { sendNotification, sendBulkNotification } from '../services/notifications.js';
import { requestActiveSql, validRequestTimeZone } from '../utils/requestState.js';

const router = Router();

// ============================================
// GET /api/requests
// Browse open requests in user's communities
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { communityId, categoryId, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let whereConditions = [requestActiveSql('r')];
    let params = [];
    let paramIndex = 1;

    const fullAccess = requestAccessSql('r', '$' + paramIndex);
    whereConditions.push('(' + fullAccess + ' OR ' + townPreviewSql('r', 'user_id', '$' + paramIndex++) + ')');
    params.push(req.user.id);
    if (communityId) {
      whereConditions.push('r.community_id = $' + paramIndex++);
      params.push(communityId);
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
      `SELECT ${fullAccess} AS full_access, r.*, u.first_name, u.last_name, u.display_name, u.profile_photo_url, u.is_verified,
              c.name as category_name
       FROM item_requests r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    res.json(result.rows.map(r => r.full_access === false ? townRequestPreview(r) : ({
      id: r.id,
      title: r.title,
      description: r.description,
      photoUrl: r.photo_url || null,
      type: r.type,
      neededFrom: r.needed_from,
      neededUntil: r.needed_until,
      visibility: r.visibility,
      status: r.status,
      category: r.category_name,
      requester: {
        id: r.user_id,
        firstName: r.display_name || r.first_name,
        lastName: r.display_name ? '' : (r.last_name ? r.last_name.charAt(0) + '.' : ''),
        profilePhotoUrl: r.profile_photo_url,
        isVerified: r.is_verified === true,
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
      `SELECT r.*, ${requestActiveSql('r')} AS accepting_offers, c.name as category_name
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
      photoUrl: r.photo_url || null,
      type: r.type,
      neededFrom: r.needed_from,
      neededUntil: r.needed_until,
      visibility: r.visibility,
      status: r.status,
      category: r.category_name,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      isExpired: !r.accepting_offers,
      timeZone: r.time_zone,
    })));
  } catch (err) {
    console.error('Get my requests error:', err);
    res.status(500).json({ error: 'Failed to get requests' });
  }
});

// Older builds still check this endpoint before posting. Matching is retired.
router.get('/suggestions', authenticate, (req, res) => res.json({ suggestions: [] }));

// ============================================
// GET /api/requests/:id
// Get request details
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const fullAccess = await canViewRequest(req.params.id, req.user.id);
    if (!fullAccess && !await canPreviewTownPost(req.params.id, req.user.id, 'request')) return res.status(404).json({ error: 'Request not found' });
    const result = await query(
      `SELECT r.*, ${requestActiveSql('r')} AS accepting_offers, u.id as user_id, u.first_name, u.last_name, u.display_name, u.profile_photo_url, u.is_verified,
              u.lender_rating as rating, u.lender_rating_count as rating_count, u.total_transactions,
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
    if (!fullAccess) return res.json(townRequestPreview(r));

    res.json({
      id: r.id,
      title: r.title,
      description: r.description,
      photoUrl: r.photo_url || null,
      type: r.type,
      neededFrom: r.needed_from,
      neededUntil: r.needed_until,
      visibility: r.visibility,
      status: r.status,
      expiresAt: r.expires_at,
      timeZone: r.time_zone,
      isExpired: r.status === 'open' && !r.accepting_offers,
      category: r.category_name,
      categoryId: r.category_id,
      requester: {
        id: r.user_id,
        isVerified: r.is_verified === true,
        firstName: r.display_name || r.first_name,
        lastName: r.display_name ? '' : (r.last_name ? r.last_name.charAt(0) + '.' : ''),
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
  body('photoUrl').optional({ nullable: true }).isString().isLength({ max: 4096 }),
  body('communityId').optional({ nullable: true }).isUUID(),
  body('categoryId').optional({ nullable: true }).isUUID(),
  body('type').optional().isIn(['item', 'service']),
  body('neededFrom').optional().isISO8601(),
  body('neededUntil').optional().isISO8601(),
  body('timeZone').optional().custom(validRequestTimeZone).withMessage('Choose a valid timezone.'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let {
      title, description, communityId, categoryId,
      neededFrom, neededUntil, visibility, expiresIn, expiresAt,
      type, timeZone = 'UTC'
    } = req.body;

    type = type || 'item';
    let photoUrl = null;
    if (req.body.photoUrl) {
      if (type !== 'item') return res.status(400).json({ error: 'Photos are for item requests.' });
      try { [photoUrl] = await ownedPhotoReferences([req.body.photoUrl], req.user.id); }
      catch { return res.status(400).json({ error: 'Choose a photo you uploaded for this request.' }); }
    }

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

    // Store visibility as comma-separated
    let visArray = Array.isArray(visibility) ? visibility : [visibility || 'close_friends'];
    visArray = visArray.filter(v => ['close_friends', 'neighborhood', 'town'].includes(v));
    if (visArray.length === 0) visArray = ['close_friends'];

    try {
      if (visArray.includes('town')) {
        const town = await query('SELECT city, state FROM users WHERE id = $1', [req.user.id]);
        if (!town.rows[0]?.city?.trim() || !town.rows[0]?.state?.trim()) {
          return res.status(400).json({ error: 'Add your town and state to your profile before posting to Town.' });
        }
      }
      if (visArray.includes('neighborhood') && !communityId) return res.status(400).json({ error: 'Join or create a neighborhood for this request.' });
      visibility = visArray.join(',');
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

      const requestId = await withTransaction(async client => {
        // Create request
        let result;
        if (expiresAtValue === null) {
          // No expiration
          result = await client.query(
            `INSERT INTO item_requests (
              user_id, community_id, category_id, title, description,
              needed_from, needed_until, visibility, status, expires_at, type, time_zone
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NULL, $9, $10)
            RETURNING id`,
            [
              req.user.id, communityId, categoryId || null, title, description,
              neededFrom || null, neededUntil || null, visibility, type, timeZone
            ]
          );
        } else if (expiresAtValue instanceof Date) {
          // Custom date
          result = await client.query(
            `INSERT INTO item_requests (
              user_id, community_id, category_id, title, description,
              needed_from, needed_until, visibility, status, expires_at, type, time_zone
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11)
            RETURNING id`,
            [
              req.user.id, communityId, categoryId || null, title, description,
              neededFrom || null, neededUntil || null, visibility, expiresAtValue, type, timeZone
            ]
          );
        } else {
          // Interval string (1 day, 3 days, 7 days)
          result = await client.query(
            `INSERT INTO item_requests (
              user_id, community_id, category_id, title, description,
              needed_from, needed_until, visibility, status, expires_at, type, time_zone
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW() + $9::interval, $10, $11)
            RETURNING id`,
            [
              req.user.id, communityId, categoryId || null, title, description,
              neededFrom || null, neededUntil || null, visibility, expiresAtValue, type, timeZone
            ]
          );
        }

        const requestId = result.rows[0].id;
        if (photoUrl) await client.query('UPDATE item_requests SET photo_url=$1 WHERE id=$2', [photoUrl, requestId]);
        if (req.body.townPreviewEnabled === true && visibility.split(',').includes('town')) {
          await client.query('UPDATE item_requests SET town_preview_enabled=true WHERE id=$1', [requestId]);
        }
        return requestId;
      });
      res.status(201).json({ id: requestId });

      // Fire-and-forget: notify relevant users about the new request
      (async () => {
        try {
          // Get the creator's name
          const creator = await query('SELECT first_name, display_name FROM users WHERE id = $1', [req.user.id]);
          const firstName = creator.rows[0]?.display_name || creator.rows[0]?.first_name || 'Someone';

          let recipientIds = [];

          const visParts = visibility.split(',');
          if (visParts.length > 0) {
            // For close_friends: notify user's accepted friends
            if (visParts.includes('close_friends')) {
              const friends = await query(
                `SELECT CASE WHEN user_id = $1 THEN friend_id ELSE user_id END as uid
                 FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
                [req.user.id]
              );
              recipientIds.push(...friends.rows.map(f => f.uid));
            }

            // For neighborhood: notify community members
            if (visParts.includes('neighborhood') && communityId) {
              const members = await query(
                'SELECT user_id FROM community_memberships WHERE community_id = $1 AND user_id != $2',
                [communityId, req.user.id]
              );
              recipientIds.push(...members.rows.map(m => m.user_id));
            }

            // For town: notify all users in the same city/state
            if (visParts.includes('town')) {
              const userLocation = await query(
                'SELECT city, state FROM users WHERE id = $1',
                [req.user.id]
              );
              if (userLocation.rows[0]?.city) {
                const townUsers = await query(
                  'SELECT id FROM users WHERE LOWER(TRIM(city)) = LOWER(TRIM($1)) AND LOWER(TRIM(state)) = LOWER(TRIM($2)) AND id != $3',
                  [userLocation.rows[0].city, userLocation.rows[0].state, req.user.id]
                );
                recipientIds.push(...townUsers.rows.map(u => u.id));
              }
            }
          }

          if (recipientIds.length > 0) {
            const permitted = await query(`SELECT recipients.id FROM users recipients
              WHERE recipients.id = ANY($1::uuid[]) AND recipients.status != 'suspended' AND EXISTS (
                SELECT 1 FROM item_requests r WHERE r.id = $2 AND ${requestActiveSql('r')} AND ${requestAccessSql('r', 'recipients.id')}
              )`, [[...new Set(recipientIds)], requestId]);
            recipientIds = permitted.rows.map(row => row.id);
            await sendBulkNotification(
              recipientIds,
              'new_request',
              { firstName, title, requestId, requestType: type },
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

    const { expiresIn, timeZone } = req.body;
    if (timeZone !== undefined && !validRequestTimeZone(timeZone)) return res.status(400).json({ error: 'Choose a valid timezone.' });
    if (timeZone) await query('UPDATE item_requests SET time_zone=$1 WHERE id=$2', [timeZone, req.params.id]);
    // A renewed request must not keep a past needed-by date that immediately
    // removes it from discovery and rejects every offer again.
    await query(`UPDATE item_requests SET needed_from=NULL, needed_until=NULL
      WHERE id=$1 AND needed_until < (NOW() AT TIME ZONE time_zone)::date`, [req.params.id]);

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
      if (req.body.timeZone !== undefined && !validRequestTimeZone(req.body.timeZone)) return res.status(400).json({ error: 'Choose a valid timezone.' });
      // Verify ownership
      const request = await query(
        'SELECT user_id, community_id, type FROM item_requests WHERE id = $1',
        [req.params.id]
      );

      if (request.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      if (request.rows[0].user_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (req.body.visibility !== undefined) {
        const scopes = req.body.visibility;
        if (!Array.isArray(scopes) || !scopes.length || scopes.some(v => !['close_friends', 'neighborhood', 'town'].includes(v))) {
          return res.status(400).json({ error: 'Choose a valid request audience.' });
        }
        if (scopes.includes('town')) {
          const town = await query('SELECT city, state FROM users WHERE id = $1', [req.user.id]);
          if (!town.rows[0]?.city?.trim() || !town.rows[0]?.state?.trim()) {
            return res.status(400).json({ error: 'Add your town and state to your profile before posting to Town.' });
          }
        }
      }
      const selectedScopes = req.body.visibility;
      if (selectedScopes?.includes('neighborhood') || req.body.communityId !== undefined) {
        const communityId = req.body.communityId || request.rows[0].community_id;
        if (!communityId) return res.status(400).json({ error: 'Join or create a neighborhood first.' });
        const member = await query('SELECT 1 FROM community_memberships WHERE user_id=$1 AND community_id=$2', [req.user.id,communityId]);
        if (!member.rows.length) return res.status(403).json({ error: 'Choose a neighborhood you belong to.' });
        req.body.communityId = communityId;
      }
      if (req.body.photoUrl !== undefined && req.body.photoUrl !== null) {
        if (typeof req.body.photoUrl !== 'string' || req.body.photoUrl.length > 4096) return res.status(400).json({ error: 'Choose a valid photo.' });
        if ((req.body.type || request.rows[0].type) !== 'item') return res.status(400).json({ error: 'Photos are for item requests.' });
        try { [req.body.photoUrl] = await ownedPhotoReferences([req.body.photoUrl], req.user.id); }
        catch { return res.status(400).json({ error: 'Choose a photo you uploaded for this request.' }); }
      }
      if (req.body.type === 'service') req.body.photoUrl = null;
      const allowedFields = [
        'community_id', 'title', 'description', 'category_id', 'needed_from',
        'needed_until', 'visibility', 'status', 'type', 'time_zone', 'photo_url'
      ];

      const updates = [];
      const values = [];
      let paramIndex = 1;

      for (const field of allowedFields) {
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        let value = req.body[camelField];
        if (value !== undefined) {
          // Store visibility as comma-separated
          if (field === 'visibility' && Array.isArray(value)) {
            value = value.filter(v => ['close_friends', 'neighborhood', 'town'].includes(v)).join(',') || 'close_friends';
          }
          updates.push(`${field} = $${paramIndex++}`);
          values.push(value);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }
      if (req.body.visibility !== undefined) {
        updates.push('town_preview_enabled = $' + paramIndex++);
        values.push(req.body.visibility.includes('town') && req.body.townPreviewEnabled === true);
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


router.post('/:id/offers', authenticate, body('listingId').isUUID(), async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Choose an item to offer.' });
  try {
    const recipientId = await offerListing(req.params.id, req.body.listingId, req.user.id);
    await sendNotification(recipientId, 'request_offer', {}, {
      fromUserId: req.user.id, listingId: req.body.listingId, requestId: req.params.id,
    });
    res.status(201).json({ success: true });
  } catch (error) {
    if (!error.status) console.error('Private offer failed', { code: error.code || error.name });
    res.status(error.status || 500).json({
      error: error.status ? error.message : 'Could not send your offer right now. Please try again.',
      code: error.status ? error.code : 'OFFER_FAILED',
    });
  }
});

router.get('/:id/offers', authenticate, async (req, res) => {
  try {
    if (!await canViewRequest(req.params.id, req.user.id)) return res.status(404).json({ error: 'Request not found' });
    const result = await query(`SELECT l.id, l.title, l.owner_id, ss.expires_at
      FROM listing_shares ss JOIN listings l ON l.id = ss.listing_id
      WHERE ss.request_id = $1 AND (ss.user_id = $2 OR l.owner_id = $2)
        AND ss.revoked_at IS NULL AND ss.expires_at > NOW()
        AND ${listingAccessSql('l', '$2')}
      ORDER BY ss.created_at DESC`, [req.params.id, req.user.id]);
    res.json(result.rows.map(item => ({ id: item.id, title: item.title,
      isOwn: item.owner_id === req.user.id, expiresAt: item.expires_at })));
  } catch { res.status(500).json({ error: 'Could not load private offers.' }); }
});

router.delete('/:id/offers/:listingId', authenticate, async (req, res) => {
  try {
    await query(`UPDATE listing_shares ss SET revoked_at = NOW()
      FROM listings l WHERE l.id = ss.listing_id AND l.owner_id = $1
        AND ss.listing_id = $2 AND ss.request_id = $3`, [req.user.id, req.params.listingId, req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Could not withdraw offer.' }); }
});

export default router;
