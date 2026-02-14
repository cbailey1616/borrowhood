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
      'SELECT location, city, state, subscription_tier, is_verified, verification_grace_until FROM users WHERE id = $1',
      [req.user.id]
    );
    const userLocation = userResult.rows[0]?.location;
    const userCity = userResult.rows[0]?.city;
    const userTier = userResult.rows[0]?.subscription_tier || 'free';
    const graceActive = userResult.rows[0]?.verification_grace_until && new Date(userResult.rows[0].verification_grace_until) > new Date();
    const isVerified = userResult.rows[0]?.is_verified || graceActive;
    const isPlusOrVerified = userTier === 'plus' || isVerified;
    const canAccessTown = isVerified && userCity;
    const canBrowseTown = isPlusOrVerified && userCity; // Paid or verified + has city

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
    } else if (canBrowseTown) {
      // Plus but unverified — include town listings for window shopping (will be masked)
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

    const needsMasking = canBrowseTown && !canAccessTown;

    res.json(result.rows.map(l => {
      const isTownListing = l.visibility === 'town' && l.owner_id !== req.user.id;
      const ownerMasked = needsMasking && isTownListing;

      return {
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
        owner: ownerMasked ? {
          id: null,
          firstName: 'Verified',
          lastName: 'Lender',
          profilePhotoUrl: null,
          rating: 0,
          ratingCount: 0,
          city: null,
          totalTransactions: 0,
          isVerified: true,
        } : {
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
        ...(ownerMasked && { ownerMasked: true }),
      };
    }));
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
       WHERE l.id = $1 AND l.status != 'deleted'`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const l = result.rows[0];

    // Town listing visibility check for non-owner viewers
    let ownerMasked = false;
    if (l.visibility === 'town' && l.owner_id !== req.user.id) {
      const viewerResult = await query(
        'SELECT subscription_tier, is_verified, city, verification_grace_until FROM users WHERE id = $1',
        [req.user.id]
      );
      const viewer = viewerResult.rows[0];
      const viewerTier = viewer?.subscription_tier || 'free';
      const viewerCity = viewer?.city;
      const viewerGraceActive = viewer?.verification_grace_until && new Date(viewer.verification_grace_until) > new Date();
      const viewerVerified = viewer?.is_verified || viewerGraceActive;

      if (viewerTier !== 'plus' || !viewerCity) {
        // Non-Plus user — should not be able to access
        return res.status(404).json({ error: 'Listing not found' });
      }
      if (!viewerVerified) {
        // Plus but unverified — mask owner info
        ownerMasked = true;
      }
    }

    // Visibility check: close_friends listings only visible to owner and friends
    if (l.visibility === 'close_friends' && l.owner_id !== req.user.id) {
      const friendship = await query(
        `SELECT 1 FROM friendships
         WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
         AND status = 'accepted'`,
        [req.user.id, l.owner_id]
      );
      if (friendship.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }
    }

    // Get photos
    const photos = await query(
      'SELECT url FROM listing_photos WHERE listing_id = $1 ORDER BY sort_order',
      [l.id]
    );

    // Check if the current user has an active transaction for this listing
    const activeTransaction = await query(
      `SELECT id, status, payment_status, borrower_id, lender_id,
              requested_start_date, requested_end_date
       FROM borrow_transactions
       WHERE listing_id = $1
         AND (borrower_id = $2 OR lender_id = $2)
         AND status IN ('pending', 'approved', 'paid', 'picked_up', 'return_pending')
       ORDER BY created_at DESC
       LIMIT 1`,
      [l.id, req.user.id]
    );

    const txn = activeTransaction.rows[0] || null;

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
      owner: ownerMasked ? {
        id: null,
        firstName: 'Verified',
        lastName: 'Lender',
        profilePhotoUrl: null,
        rating: 0,
        ratingCount: 0,
        totalTransactions: 0,
        isVerified: true,
      } : {
        id: l.owner_id,
        firstName: l.first_name,
        lastName: l.last_name,
        profilePhotoUrl: l.profile_photo_url,
        rating: parseFloat(l.rating) || 0,
        ratingCount: l.rating_count,
        totalTransactions: l.total_transactions || 0,
        isVerified: l.owner_status === 'verified',
      },
      ownerMasked,
      isOwner: l.owner_id === req.user.id,
      activeTransaction: txn ? {
        id: txn.id,
        status: txn.status,
        paymentStatus: txn.payment_status,
        isBorrower: txn.borrower_id === req.user.id,
        startDate: txn.requested_start_date,
        endDate: txn.requested_end_date,
      } : null,
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
  body('requestMatchId').optional().isUUID(),
  body('photos').isArray({ min: 1, max: 10 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title, description, condition, communityId, categoryId,
      isFree: _isFree, pricePerDay: _pricePerDay, depositAmount, minDuration, maxDuration,
      visibility, photos, requestMatchId
    } = req.body;
    let isFree = _isFree;
    let pricePerDay = _pricePerDay;

    // Normalize visibility to array
    let visibilityArray = Array.isArray(visibility) ? [...visibility] : [visibility];

    try {
      // Check subscription/verification for paid rentals and town visibility
      let pricingDowngraded = false;
      const needsPaidCheck = !isFree && pricePerDay > 0;
      const needsTownCheck = visibilityArray.includes('town');

      if (needsPaidCheck || needsTownCheck) {
        const subCheck = await query(
          'SELECT subscription_tier, is_verified, verification_grace_until FROM users WHERE id = $1',
          [req.user.id]
        );
        const tier = subCheck.rows[0]?.subscription_tier || 'free';
        const graceActive = subCheck.rows[0]?.verification_grace_until && new Date(subCheck.rows[0].verification_grace_until) > new Date();
        const verified = subCheck.rows[0]?.is_verified || graceActive;

        // Silently downgrade paid rental to free if not plus
        if (needsPaidCheck && tier !== 'plus') {
          isFree = true;
          pricePerDay = null;
          pricingDowngraded = true;
        }

        // Silently drop town if not plus/verified
        if (needsTownCheck && (tier !== 'plus' || !verified)) {
          const idx = visibilityArray.indexOf('town');
          visibilityArray.splice(idx, 1);
          if (visibilityArray.length === 0) visibilityArray.push('close_friends');
        }
      }
      // If neighborhood selected but no community, silently drop it from visibility
      if (visibilityArray.includes('neighborhood') && !communityId) {
        const idx = visibilityArray.indexOf('neighborhood');
        visibilityArray.splice(idx, 1);
        if (visibilityArray.length === 0) visibilityArray.push('close_friends');
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

      // Direct request match notification (from "I Have This" flow)
      if (requestMatchId) {
        try {
          const matchedRequest = await query(
            'SELECT user_id, title FROM item_requests WHERE id = $1 AND status = $2',
            [requestMatchId, 'open']
          );
          if (matchedRequest.rows.length > 0 && matchedRequest.rows[0].user_id !== req.user.id) {
            await sendNotification(
              matchedRequest.rows[0].user_id,
              'item_match',
              { itemTitle: title, requestTitle: matchedRequest.rows[0].title },
              { listingId, requestId: requestMatchId, fromUserId: req.user.id }
            );
          }
        } catch (matchErr) {
          console.error('Error sending request match notification:', matchErr);
        }
      } else {
        // Fuzzy text match — find matching open requests and notify their owners
        try {
          const matchingRequests = communityId ? await query(
            `SELECT r.id, r.user_id, r.title as request_title
             FROM item_requests r
             WHERE r.status = 'open'
               AND r.community_id = $1
               AND r.user_id != $2
               AND to_tsvector('english', r.title || ' ' || COALESCE(r.description, '')) @@ plainto_tsquery($3)`,
            [communityId, req.user.id, title]
          ) : { rows: [] };

          for (const match of matchingRequests.rows) {
            await sendNotification(
              match.user_id,
              'item_match',
              { itemTitle: title, requestTitle: match.request_title },
              { listingId, fromUserId: req.user.id }
            );
          }
        } catch (matchErr) {
          console.error('Error finding matching requests:', matchErr);
        }
      }

      res.status(201).json({
        id: listingId,
        ...(pricingDowngraded && { pricingDowngraded: true }),
      });
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
      const validStatuses = ['active', 'paused'];
      const validVisibilities = ['close_friends', 'neighborhood', 'town'];

      // Silently drop town from visibility if user isn't plus/verified
      if (req.body.visibility) {
        let visArray = Array.isArray(req.body.visibility) ? [...req.body.visibility] : [req.body.visibility];
        if (visArray.includes('town')) {
          const subCheck = await query(
            'SELECT subscription_tier, is_verified, verification_grace_until FROM users WHERE id = $1',
            [req.user.id]
          );
          const u = subCheck.rows[0];
          const graceActive = u?.verification_grace_until && new Date(u.verification_grace_until) > new Date();
          const verified = u?.is_verified || graceActive;
          if (u?.subscription_tier !== 'plus' || !verified) {
            visArray = visArray.filter(v => v !== 'town');
            if (visArray.length === 0) visArray.push('close_friends');
          }
        }
        req.body.visibility = visArray;
      }

      // Validate status
      if (req.body.status && !validStatuses.includes(req.body.status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      // Validate price is not negative
      if (req.body.pricePerDay !== undefined && parseFloat(req.body.pricePerDay) < 0) {
        return res.status(400).json({ error: 'Price cannot be negative' });
      }

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
            if (!validVisibilities.includes(value)) continue;
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
