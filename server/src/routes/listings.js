import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, requireVerified } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { sendNotification } from '../services/notifications.js';
import { analyzeItemImage } from '../services/imageAnalysis.js';

const router = Router();

// ============================================
// GET /api/listings
// Browse available listings
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { communityId, categoryId, search, maxDistance, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Get user's location, verified city, and subscription tier
    const userResult = await query(
      'SELECT location, city, state, subscription_tier, is_verified FROM users WHERE id = $1',
      [req.user.id]
    );
    const userLocation = userResult.rows[0]?.location;
    const userCity = userResult.rows[0]?.city;
    const userTier = userResult.rows[0]?.subscription_tier || 'free';
    const isVerified = userResult.rows[0]?.is_verified;
    const canAccessTown = userTier === 'plus' && isVerified && userCity;

    const friendsResult = await query(
      'SELECT friend_id FROM friendships WHERE user_id = $1',
      [req.user.id]
    );
    const friendIds = friendsResult.rows.map(f => f.friend_id);

    let whereConditions = [`l.status = 'active'`, `l.is_available = true`];
    let selectExtra = '';
    let params = [];
    let paramIndex = 1;

    // Add distance calculation if user has location
    if (userLocation) {
      selectExtra = `, ST_Distance(owner.location, $${paramIndex}::geography) / 1609.34 as distance_miles`;
      params.push(userLocation);
      paramIndex++;

      // Filter by max distance if specified
      if (maxDistance) {
        whereConditions.push(`ST_DWithin(owner.location, $${paramIndex}::geography, $${paramIndex + 1})`);
        params.push(userLocation, parseFloat(maxDistance) * 1609.34); // miles to meters
        paramIndex += 2;
      }
    }

    // Community filter
    if (communityId) {
      whereConditions.push(`l.community_id = $${paramIndex++}`);
      params.push(communityId);
    }

    // Category filter
    if (categoryId) {
      whereConditions.push(`l.category_id = $${paramIndex++}`);
      params.push(categoryId);
    }

    // Search
    if (search) {
      whereConditions.push(`to_tsvector('english', l.title || ' ' || COALESCE(l.description, '')) @@ plainto_tsquery($${paramIndex++})`);
      params.push(search);
    }

    // Visibility rules:
    // - Own listings: always visible
    // - close_friends: visible if owner is in user's friends list
    // - neighborhood: visible if in same community (handled elsewhere)
    // - town: visible only if user has Explorer+ subscription, is verified, and owner is in same city
    if (canAccessTown) {
      whereConditions.push(`(
        l.owner_id = $${paramIndex} OR
        (l.visibility = 'town' AND owner.city = $${paramIndex + 1} AND owner.city IS NOT NULL) OR
        l.visibility = 'neighborhood' OR
        (l.visibility = 'close_friends' AND l.owner_id = ANY($${paramIndex + 2}))
      )`);
      params.push(req.user.id, userCity, friendIds.length > 0 ? friendIds : [null]);
      paramIndex += 3;
    } else {
      // User can't access town listings - only show friends and neighborhood
      whereConditions.push(`(
        l.owner_id = $${paramIndex} OR
        l.visibility = 'neighborhood' OR
        (l.visibility = 'close_friends' AND l.owner_id = ANY($${paramIndex + 1}))
      )`);
      params.push(req.user.id, friendIds.length > 0 ? friendIds : [null]);
      paramIndex += 2;
    }

    // Don't show user's own listings in browse
    whereConditions.push(`l.owner_id != $${paramIndex++}`);
    params.push(req.user.id);

    params.push(limit, offset);

    // Order by distance if available, otherwise by date
    const orderBy = userLocation ? 'distance_miles ASC NULLS LAST, l.created_at DESC' : 'l.created_at DESC';

    const result = await query(
      `SELECT l.*, u.first_name, u.last_name, u.profile_photo_url,
              u.rating, u.rating_count, u.city as owner_city,
              u.total_transactions, u.status as owner_status,
              owner.location as owner_location,
              cat.name as category_name,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url
              ${selectExtra}
       FROM listings l
       JOIN users u ON l.owner_id = u.id
       JOIN users owner ON l.owner_id = owner.id
       LEFT JOIN categories cat ON l.category_id = cat.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    res.json(result.rows.map(l => ({
      id: l.id,
      title: l.title,
      description: l.description,
      condition: l.condition,
      isFree: l.is_free,
      pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
      depositAmount: parseFloat(l.deposit_amount),
      minDuration: l.min_duration,
      maxDuration: l.max_duration,
      visibility: l.visibility,
      photoUrl: l.photo_url,
      category: l.category_name,
      distanceMiles: l.distance_miles ? parseFloat(l.distance_miles).toFixed(1) : null,
      owner: {
        id: l.owner_id,
        firstName: l.first_name,
        lastName: l.last_name,
        profilePhotoUrl: l.profile_photo_url,
        rating: parseFloat(l.rating) || 0,
        ratingCount: l.rating_count,
        city: l.owner_city,
        totalTransactions: l.total_transactions || 0,
        isVerified: l.owner_status === 'verified',
      },
      createdAt: l.created_at,
    })));
  } catch (err) {
    console.error('Get listings error:', err);
    res.status(500).json({ error: 'Failed to get listings' });
  }
});

// ============================================
// GET /api/listings/mine
// Get current user's listings
// ============================================
router.get('/mine', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url,
              (SELECT COUNT(*) FROM borrow_transactions WHERE listing_id = l.id AND status = 'pending') as pending_requests
       FROM listings l
       WHERE l.owner_id = $1 AND l.status != 'deleted'
       ORDER BY l.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(l => ({
      id: l.id,
      title: l.title,
      condition: l.condition,
      categoryId: l.category_id,
      isFree: l.is_free,
      pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
      depositAmount: parseFloat(l.deposit_amount),
      isAvailable: l.is_available,
      status: l.status,
      photoUrl: l.photo_url,
      timesBorrowed: l.times_borrowed,
      totalEarnings: parseFloat(l.total_earnings),
      pendingRequests: parseInt(l.pending_requests),
      createdAt: l.created_at,
    })));
  } catch (err) {
    console.error('Get my listings error:', err);
    res.status(500).json({ error: 'Failed to get listings' });
  }
});

// ============================================
// GET /api/listings/:id
// Get listing details
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*, u.id as owner_id, u.first_name, u.last_name, u.profile_photo_url,
              u.rating, u.rating_count, u.total_transactions,
              u.status as owner_status, c.name as category_name
       FROM listings l
       JOIN users u ON l.owner_id = u.id
       LEFT JOIN categories c ON l.category_id = c.id
       WHERE l.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const l = result.rows[0];

    // Get photos
    const photos = await query(
      'SELECT url FROM listing_photos WHERE listing_id = $1 ORDER BY sort_order',
      [l.id]
    );

    res.json({
      id: l.id,
      title: l.title,
      description: l.description,
      condition: l.condition,
      isFree: l.is_free,
      pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
      depositAmount: parseFloat(l.deposit_amount),
      minDuration: l.min_duration,
      maxDuration: l.max_duration,
      visibility: l.visibility,
      isAvailable: l.is_available,
      status: l.status,
      photos: photos.rows.map(p => p.url),
      category: l.category_name,
      categoryId: l.category_id,
      timesBorrowed: l.times_borrowed,
      owner: {
        id: l.owner_id,
        firstName: l.first_name,
        lastName: l.last_name,
        profilePhotoUrl: l.profile_photo_url,
        rating: parseFloat(l.rating) || 0,
        ratingCount: l.rating_count,
        totalTransactions: l.total_transactions || 0,
        isVerified: l.owner_status === 'verified',
      },
      isOwner: l.owner_id === req.user.id,
      createdAt: l.created_at,
    });
  } catch (err) {
    console.error('Get listing error:', err);
    res.status(500).json({ error: 'Failed to get listing' });
  }
});

// ============================================
// POST /api/listings/analyze-image
// Analyze an image using AI to extract item details
// ============================================
router.post('/analyze-image', authenticate,
  body('imageUrl').isURL(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { imageUrl } = req.body;

    try {
      const result = await analyzeItemImage(imageUrl);

      if (result.error) {
        return res.status(422).json({ error: result.error });
      }

      res.json(result);
    } catch (err) {
      console.error('Analyze image error:', err);
      res.status(500).json({ error: 'Failed to analyze image' });
    }
  }
);

// ============================================
// POST /api/listings
// Create a new listing
// ============================================
router.post('/', authenticate,
  body('title').trim().isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ max: 2000 }),
  body('condition').isIn(['like_new', 'good', 'fair', 'worn']),
  body('communityId').optional().isUUID(),
  body('categoryId').isUUID(),
  body('isFree').isBoolean(),
  body('pricePerDay').optional().isFloat({ min: 0 }),
  body('depositAmount').optional().isFloat({ min: 0 }),
  body('minDuration').optional().isInt({ min: 1, max: 365 }),
  body('maxDuration').optional().isInt({ min: 1, max: 365 }),
  body('visibility').isArray({ min: 1 }),
  body('visibility.*').isIn(['close_friends', 'neighborhood', 'town']),
  body('photos').isArray({ min: 1, max: 10 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title, description, condition, communityId, categoryId,
      isFree, pricePerDay, depositAmount, minDuration, maxDuration,
      visibility, photos
    } = req.body;

    // Normalize visibility to array
    const visibilityArray = Array.isArray(visibility) ? visibility : [visibility];

    try {
      // Check subscription for paid rentals
      if (!isFree && pricePerDay > 0) {
        const subCheck = await query(
          'SELECT subscription_tier FROM users WHERE id = $1',
          [req.user.id]
        );
        const tier = subCheck.rows[0]?.subscription_tier || 'free';

        if (tier !== 'plus') {
          return res.status(403).json({
            error: 'Plus subscription required to charge for rentals',
            code: 'PLUS_REQUIRED',
            requiredTier: 'plus',
          });
        }
      }

      // Check subscription for town visibility
      if (visibilityArray.includes('town')) {
        const subCheck = await query(
          'SELECT subscription_tier FROM users WHERE id = $1',
          [req.user.id]
        );
        const tier = subCheck.rows[0]?.subscription_tier || 'free';

        if (tier !== 'plus') {
          return res.status(403).json({
            error: 'Plus subscription required for town-wide visibility',
            code: 'PLUS_REQUIRED',
            requiredTier: 'plus',
          });
        }
      }
      // Community is required if neighborhood is in visibility
      if (visibilityArray.includes('neighborhood')) {
        if (!communityId) {
          return res.status(400).json({ error: 'Neighborhood is required when sharing with My Neighborhood' });
        }

        // Verify user is member of community
        const memberCheck = await query(
          'SELECT 1 FROM community_memberships WHERE user_id = $1 AND community_id = $2',
          [req.user.id, communityId]
        );

        if (memberCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Must be neighborhood member to share with My Neighborhood' });
        }
      }

      // Store visibility as comma-separated for compatibility, or use first value
      // For now, use the "widest" visibility for the single column
      const primaryVisibility = visibilityArray.includes('town') ? 'town'
        : visibilityArray.includes('neighborhood') ? 'neighborhood'
        : 'close_friends';

      // Create listing
      const result = await query(
        `INSERT INTO listings (
          owner_id, community_id, category_id, title, description, condition,
          is_free, price_per_day, deposit_amount, min_duration, max_duration, visibility
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          req.user.id, communityId || null, categoryId || null, title, description, condition,
          isFree, isFree ? null : pricePerDay, depositAmount || 0,
          minDuration || 1, maxDuration || 14, primaryVisibility
        ]
      );

      const listingId = result.rows[0].id;

      // Add photos (if any)
      if (photos && photos.length > 0) {
        for (let i = 0; i < photos.length; i++) {
          await query(
            'INSERT INTO listing_photos (listing_id, url, sort_order) VALUES ($1, $2, $3)',
            [listingId, photos[i], i]
          );
        }
      }

      // Find matching open requests and notify their owners
      try {
        // Only match requests if we have a communityId
        const matchingRequests = communityId ? await query(
          `SELECT r.id, r.user_id, r.title as request_title
           FROM item_requests r
           WHERE r.status = 'open'
             AND r.community_id = $1
             AND r.user_id != $2
             AND to_tsvector('english', r.title || ' ' || COALESCE(r.description, '')) @@ plainto_tsquery($3)`,
          [communityId, req.user.id, title]
        ) : { rows: [] };

        // Send notifications to request owners
        for (const match of matchingRequests.rows) {
          await sendNotification(
            match.user_id,
            'item_match',
            { itemTitle: title, requestTitle: match.request_title },
            { listingId, fromUserId: req.user.id }
          );
        }
      } catch (matchErr) {
        // Log but don't fail the listing creation
        console.error('Error finding matching requests:', matchErr);
      }

      res.status(201).json({ id: listingId });
    } catch (err) {
      console.error('Create listing error:', err);
      res.status(500).json({ error: 'Failed to create listing' });
    }
  }
);

// ============================================
// PATCH /api/listings/:id
// Update listing
// ============================================
router.patch('/:id', authenticate,
  async (req, res) => {
    try {
      // Verify ownership
      const listing = await query(
        'SELECT owner_id FROM listings WHERE id = $1',
        [req.params.id]
      );

      if (listing.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      if (listing.rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const allowedFields = [
        'title', 'description', 'condition', 'category_id', 'is_free', 'price_per_day',
        'deposit_amount', 'min_duration', 'max_duration', 'visibility', 'status'
      ];

      const updates = [];
      const values = [];
      let paramIndex = 1;

      for (const field of allowedFields) {
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (req.body[camelField] !== undefined) {
          let value = req.body[camelField];

          // Convert visibility array to single enum value (widest scope)
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
        `UPDATE listings SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      res.json({ success: true });
    } catch (err) {
      console.error('Update listing error:', err);
      res.status(500).json({ error: 'Failed to update listing' });
    }
  }
);

// ============================================
// DELETE /api/listings/:id
// Soft delete listing
// ============================================
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `UPDATE listings SET status = 'deleted'
       WHERE id = $1 AND owner_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found or not authorized' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete listing error:', err);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

export default router;
