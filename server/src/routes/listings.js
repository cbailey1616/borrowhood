import { endorsementSummary } from '../services/endorsements.js';
import { listingAvailabilitySql } from '../utils/listingAvailability.js';
import { townPreviewSql, canPreviewTownPost, townListingPreview } from '../services/townPreview.js';
import { ownedPhotoReferences, readOwnedPhoto } from '../services/privatePhotos.js';
import { normalizeDirectFee } from '../utils/directFee.js';
import { listingAccessSql } from '../utils/sharingPolicy.js';
import { canViewListing, canViewRequest, validateSharing, offerListing } from '../services/listingAccess.js';
import { freeListingOnly } from '../middleware/freeLaunch.js';
import { ENABLE_PAYMENTS, REQUIRE_IDENTITY_VERIFICATION } from '../utils/constants.js';
import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { authenticate, requireVerified, ENABLE_PAID_TIERS } from '../middleware/auth.js';
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
    let whereConditions = [`l.status = 'active'`, `l.is_available = true`];
    if (!ENABLE_PAYMENTS) whereConditions.push('l.is_free = true AND COALESCE(l.price_per_day, 0) = 0 AND COALESCE(l.deposit_amount, 0) = 0');
    let selectExtra = '';
    let params = [];
    let paramIndex = 1;

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

    const fullAccess = listingAccessSql('l', '$' + paramIndex, { discovery: true });
    selectExtra = `, ${fullAccess} AS full_access`;
    whereConditions.push('(' + fullAccess + ' OR ' + townPreviewSql('l', 'owner_id', '$' + paramIndex++, { listing: true }) + ')');
    params.push(req.user.id);

    // Don't show user's own listings in browse
    whereConditions.push(`l.owner_id != $${paramIndex++}`);
    params.push(req.user.id);

    params.push(limit, offset);

    // Order by distance if available, otherwise by date
    const orderBy = 'l.created_at DESC';

    const result = await query(
      `SELECT l.*, ${listingAvailabilitySql()} as availability_status, u.first_name, u.last_name, u.display_name, u.profile_photo_url,
              u.lender_rating as rating, u.lender_rating_count as rating_count, u.city as owner_city,
              u.total_transactions, u.is_verified as owner_verified,
              cat.name as category_name,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url
              ${selectExtra}
       FROM listings l
       JOIN users u ON l.owner_id = u.id
       LEFT JOIN categories cat ON l.category_id = cat.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    const needsMasking = false;

    res.json(result.rows.map(l => {
      if (l.full_access === false) return townListingPreview(l);
      const isTownListing = l.visibility === 'town' && l.owner_id !== req.user.id;
      const ownerMasked = needsMasking && isTownListing;

      return {
        id: l.id,
        title: l.title,
        description: l.description,
        condition: l.condition,
        isFree: l.is_free,
      directFee: l.direct_fee || null,
        pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
        depositAmount: parseFloat(l.deposit_amount),
        minDuration: l.min_duration,
        maxDuration: l.max_duration,
        listingType: l.listing_type || 'lend',
        visibility: l.privacy_version === 1 ? l.visibility : 'private',
        sharingReviewRequired: l.privacy_version !== 1,
        circleId: l.circle_id,
        photoUrl: l.photo_url,
        category: l.category_name,
        distanceMiles: l.distance_miles ? parseFloat(l.distance_miles).toFixed(1) : null,
        owner: ownerMasked ? {
          id: null,
          firstName: 'Verified',
          lastName: 'Owner',
          profilePhotoUrl: null,
          rating: 0,
          ratingCount: 0,
          city: null,
          totalTransactions: 0,
          isVerified: true,
        } : {
          id: l.owner_id,
          firstName: l.display_name || l.first_name,
          lastName: l.display_name ? '' : (l.last_name ? l.last_name.charAt(0) + '.' : ''),
          profilePhotoUrl: l.profile_photo_url,
          rating: parseFloat(l.rating) || 0,
          ratingCount: l.rating_count,
          city: l.owner_city,
          totalTransactions: l.total_transactions || 0,
          isVerified: l.owner_verified === true,
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
      `SELECT l.*, ${listingAvailabilitySql()} as availability_status,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url,
              (SELECT COUNT(*) FROM borrow_transactions WHERE listing_id = l.id AND status = 'pending') as pending_requests,
              (SELECT COUNT(*) FROM listing_shares ss JOIN item_requests sr ON sr.id = ss.request_id
                WHERE ss.listing_id = l.id AND ss.revoked_at IS NULL AND ss.expires_at > NOW()
                  AND sr.status = 'open' AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
                  AND (sr.needed_until IS NULL OR sr.needed_until >= CURRENT_DATE)) as active_offers
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
      directFee: l.direct_fee || null,
      listingType: l.listing_type || 'lend',
      pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
      depositAmount: parseFloat(l.deposit_amount),
      isAvailable: l.is_available,
      availabilityStatus: l.availability_status,
      status: l.status,
      photoUrl: l.photo_url,
      timesBorrowed: l.times_borrowed,
      totalEarnings: parseFloat(l.total_earnings),
      pendingRequests: parseInt(l.pending_requests),
      activeOffers: parseInt(l.active_offers) || 0,
      visibility: l.privacy_version === 1 ? l.visibility : 'private',
      sharingReviewRequired: l.privacy_version !== 1,
      circleId: l.circle_id,
      communityId: l.community_id,
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
// Only the item owner can see the people in its request queue.
router.get('/:id/requests', authenticate, async (req, res) => {
  try {
    const { rows: [listing] } = await query(`SELECT l.id,l.title,l.is_available,l.status,l.listing_type,
      ${listingAvailabilitySql()} AS availability_status FROM listings l WHERE l.id=$1 AND l.owner_id=$2`, [req.params.id,req.user.id]);
    if (!listing) return res.status(404).json({ error: 'Item not found.' });
    const { rows } = await query(`SELECT t.id,t.created_at,t.requested_start_date,t.requested_end_date,t.borrower_message,t.stripe_payment_intent_id,
      b.id AS borrower_id,COALESCE(NULLIF(b.display_name,''),b.first_name) AS name,b.profile_photo_url,b.is_verified,b.total_transactions
      FROM borrow_transactions t JOIN users b ON b.id=t.borrower_id
      WHERE t.listing_id=$1 AND t.lender_id=$2 AND t.status='pending'
      ORDER BY t.created_at ASC,t.id ASC`, [listing.id,req.user.id]);
    const { rows: [active] } = await query(`SELECT id FROM borrow_transactions WHERE listing_id=$1
      AND status IN ('approved','paid','picked_up','return_pending') ORDER BY created_at DESC LIMIT 1`, [listing.id]);
    return res.json({ listing: { id:listing.id,title:listing.title,listingType:listing.listing_type,
      availabilityStatus:listing.availability_status,isAvailable:listing.is_available,status:listing.status },
      activeTransactionId:active?.id || null,
      requests:await Promise.all(rows.map(async (t,index) => ({ id:t.id,position:index+1,createdAt:t.created_at,
        canChoose:listing.status === 'active' && (listing.is_available || !!t.stripe_payment_intent_id),
        startDate:t.requested_start_date,endDate:t.requested_end_date,message:t.borrower_message,
        borrower:{ id:t.borrower_id,firstName:t.name,profilePhotoUrl:t.profile_photo_url,isVerified:t.is_verified,totalTransactions:t.total_transactions,
          endorsement:await endorsementSummary(t.borrower_id) } }))) });
  } catch { res.status(500).json({ error: 'Could not load the request queue.' }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const fullAccess = await canViewListing(req.params.id, req.user.id);
    if (!fullAccess && !await canPreviewTownPost(req.params.id, req.user.id)) return res.status(404).json({ error: 'Listing not found' });
    const result = await query(
      `SELECT l.*, ${listingAvailabilitySql()} as availability_status, u.id as owner_id, u.first_name, u.last_name, u.display_name, u.profile_photo_url,
              u.lender_rating as rating, u.lender_rating_count as rating_count, u.total_transactions,
              u.is_verified as owner_verified, u.city as owner_city, c.name as category_name
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

    const ownerMasked = false;

    // Get photos
    const photos = await query(
      'SELECT url FROM listing_photos WHERE listing_id = $1 ORDER BY sort_order',
      [l.id]
    );

    if (!fullAccess) return res.json(townListingPreview(l, photos.rows.map(p => p.url)));

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
      directFee: l.direct_fee || null,
      listingType: l.listing_type || 'lend',
      pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
      depositAmount: parseFloat(l.deposit_amount),
      minDuration: l.min_duration,
      maxDuration: l.max_duration,
      visibility: l.privacy_version === 1 ? l.visibility : 'private',
        sharingReviewRequired: l.privacy_version !== 1,
        circleId: l.circle_id,
      communityId: l.community_id,
      isAvailable: l.is_available,
      availabilityStatus: l.availability_status,
      status: l.status,
      photos: photos.rows.map(p => p.url),
      category: l.category_name,
      categoryId: l.category_id,
      timesBorrowed: l.times_borrowed,
      owner: ownerMasked ? {
        id: null,
        firstName: 'Verified',
        lastName: 'Owner',
        profilePhotoUrl: null,
        rating: 0,
        ratingCount: 0,
        totalTransactions: 0,
        isVerified: true,
      } : {
        id: l.owner_id,
        firstName: l.display_name || l.first_name,
        lastName: l.display_name ? '' : (l.last_name ? l.last_name.charAt(0) + '.' : ''),
        profilePhotoUrl: l.profile_photo_url,
        rating: parseFloat(l.rating) || 0,
        ratingCount: l.rating_count,
        totalTransactions: l.total_transactions || 0,
        isVerified: l.owner_verified === true,
      },
      ownerMasked,
      pendingRequests: l.owner_id === req.user.id ? Number((await query("SELECT COUNT(*) FROM borrow_transactions WHERE listing_id=$1 AND status='pending'", [l.id])).rows[0].count) : undefined,
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
      const image = await readOwnedPhoto(imageUrl, req.user.id);
      const result = await analyzeItemImage(image);

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
router.post('/', authenticate, freeListingOnly,
  body('title').trim().isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ max: 2000 }),
  body('condition').isIn(['like_new', 'good', 'fair', 'worn']),
  body('communityId').optional().isUUID(),
  body('categoryId').optional({ nullable: true }).isUUID(),
  body('isFree').isBoolean(),
  body('pricePerDay').optional().isFloat({ min: 5 }).withMessage('Minimum borrow fee is $5/day'),
  body('depositAmount').optional().isFloat({ min: 0 }),
  body('minDuration').optional().isInt({ min: 1, max: 365 }),
  body('maxDuration').optional().isInt({ min: 1, max: 365 }),
  body('visibility').optional().isArray({ min: 1 }),
  body('visibility.*').isIn(['private', 'close_friends', 'neighborhood', 'circle', 'town']),
  body('circleId').optional({ nullable: true }).isUUID(),
  body('requestMatchId').optional({ nullable: true }).isUUID(),
  body('photos').isArray({ min: 1, max: 10 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title, description, condition, communityId, categoryId,
      isFree: _isFree, pricePerDay: _pricePerDay, depositAmount, minDuration, maxDuration,
      visibility, photos, requestMatchId, listingType: _listingType
    } = req.body;
    if (_listingType && !['lend', 'giveaway', 'sell'].includes(_listingType)) return res.status(400).json({ error: 'Choose Lend, Giveaway, or Sell.' });
    const listingType = _listingType || 'lend';
    let isFree = ['giveaway', 'sell'].includes(listingType) ? true : _isFree;
    let pricePerDay = ['giveaway', 'sell'].includes(listingType) ? null : _pricePerDay;
    let directFee;
    try { directFee = normalizeDirectFee(req.body.directFee, listingType); }
    catch (error) { return res.status(400).json({ error: error.message }); }

    // Normalize visibility to array
    let visibilityArray;

    try {
      const sharing = await validateSharing(req.body, req.user.id);
      if (sharing.error) return res.status(400).json({ error: sharing.error });
      visibilityArray = sharing.scopes;
      if (requestMatchId && !await canViewRequest(requestMatchId, req.user.id)) return res.status(404).json({ error: 'Request not found' });
      let storedPhotos = photos || [];
      try { storedPhotos = await ownedPhotoReferences(storedPhotos, req.user.id); }
      catch { return res.status(400).json({ error: 'Use photos uploaded for your own items.' }); }
      // Require Stripe Connect for listings with rental fees or deposits
      const hasPaidComponent = (!isFree && pricePerDay > 0) || (depositAmount && depositAmount > 0);
      if (hasPaidComponent) {
        const connectCheck = await query(
          'SELECT stripe_connect_account_id FROM users WHERE id = $1',
          [req.user.id]
        );
        if (!connectCheck.rows[0]?.stripe_connect_account_id) {
          return res.status(400).json({
            error: 'Please set up payouts before listing items with rental fees or deposits.',
            code: 'PAYOUT_SETUP_REQUIRED'
          });
        }
      }

      // Check subscription/verification for paid rentals
      let pricingDowngraded = false;
      const needsPaidCheck = !isFree && pricePerDay > 0;

      // TODO: Restore tier enforcement when re-enabling paid tiers (ENABLE_PAID_TIERS)
      if (ENABLE_PAID_TIERS && needsPaidCheck) {
        const subCheck = await query(
          'SELECT subscription_tier FROM users WHERE id = $1',
          [req.user.id]
        );
        const tier = subCheck.rows[0]?.subscription_tier || 'free';

        // Silently downgrade paid rental to free if not plus
        if (tier !== 'plus') {
          isFree = true;
          pricePerDay = null;
          pricingDowngraded = true;
        }
      }
      // Store visibility as comma-separated (e.g. 'close_friends,town')
      const primaryVisibility = visibilityArray.join(',');

      const listingId = await withTransaction(async client => {
        // Create listing
        const isGiveaway = ['giveaway', 'sell'].includes(listingType);
        const result = await client.query(
          `INSERT INTO listings (
            owner_id, community_id, category_id, title, description, condition,
            is_free, price_per_day, deposit_amount, min_duration, max_duration, visibility, listing_type, privacy_version, circle_id, direct_fee
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, $14, $15)
          RETURNING id`,
          [
            req.user.id, communityId || null, categoryId || null, title, description, condition,
            isFree, isFree ? null : pricePerDay, isGiveaway ? 0 : (depositAmount || 0),
            isGiveaway ? null : (minDuration || 1), isGiveaway ? null : (maxDuration || 14),
            primaryVisibility, listingType, sharing.circleId, directFee
          ]
        );

        const listingId = result.rows[0].id;
        if (req.body.townPreviewEnabled === true && visibilityArray.includes('town')) {
          await client.query('UPDATE listings SET town_preview_enabled=true WHERE id=$1', [listingId]);
        }

        // Add photos (if any)
        if (photos && photos.length > 0) {
          for (let i = 0; i < photos.length; i++) {
            await client.query(
              'INSERT INTO listing_photos (listing_id, url, sort_order) VALUES ($1, $2, $3)',
              [listingId, storedPhotos[i], i]
            );
          }
        }

        if (requestMatchId) await offerListing(requestMatchId, listingId, req.user.id, client);

        return listingId;
      });

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
            if (!await canViewListing(listingId, match.user_id, { discovery: true })) continue;
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
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to create listing' });
    }
  }
);

// ============================================
// PATCH /api/listings/:id
// Update listing
// ============================================
router.patch('/:id', authenticate, freeListingOnly,
  async (req, res) => {
    try {
      if (Array.isArray(req.body.photos)) {
        try { req.body.photos = await ownedPhotoReferences(req.body.photos, req.user.id); }
        catch { return res.status(400).json({ error: 'Use photos uploaded for your own items.' }); }
      }
      // Verify ownership
      const listing = await query(
        'SELECT owner_id, community_id, listing_type, direct_fee FROM listings WHERE id = $1',
        [req.params.id]
      );

      if (listing.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      if (listing.rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (req.body.directFee !== undefined) {
        try { req.body.directFee = normalizeDirectFee(req.body.directFee, listing.rows[0].listing_type); }
        catch (error) { return res.status(400).json({ error: error.message }); }
      }
      const allowedFields = [
        'direct_fee',
        'title', 'description', 'condition', 'category_id', 'is_free', 'price_per_day',
        'deposit_amount', 'min_duration', 'max_duration', 'visibility', 'status'
      ];
      const validStatuses = ['active', 'paused'];
      const validVisibilities = ['private', 'close_friends', 'neighborhood', 'circle', 'town'];

      let sharing;
      if (req.body.visibility !== undefined) {
        // Editing uses the item's stored neighborhood, never an unvalidated replacement.
        sharing = await validateSharing({
          ...req.body,
          communityId: req.body.communityId || listing.rows[0].community_id,
        }, req.user.id);
        if (sharing.error) return res.status(400).json({ error: sharing.error });
        req.body.visibility = sharing.scopes;
      }

      // Enforce minimum price of $5/day
      const updatedPrice = req.body.pricePerDay ?? req.body.price_per_day;
      const updatedIsFree = req.body.isFree ?? req.body.is_free;
      if (updatedIsFree === false && updatedPrice && parseFloat(updatedPrice) < 5) {
        return res.status(400).json({ error: 'Minimum borrow fee is $5/day' });
      }

      // Require Stripe Connect for deposit or rental fee
      const updatedDeposit = req.body.depositAmount ?? req.body.deposit_amount;
      const hasPaidUpdate = (updatedDeposit && parseFloat(updatedDeposit) > 0) ||
        (updatedIsFree === false && updatedPrice && parseFloat(updatedPrice) > 0);
      if (hasPaidUpdate) {
        const connectCheck = await query(
          'SELECT stripe_connect_account_id FROM users WHERE id = $1',
          [req.user.id]
        );
        if (!connectCheck.rows[0]?.stripe_connect_account_id) {
          return res.status(400).json({
            error: 'Please set up payouts before adding rental fees or deposits.',
            code: 'PAYOUT_SETUP_REQUIRED'
          });
        }
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

          // Store visibility as comma-separated
          if (field === 'visibility' && Array.isArray(value)) {
            value = value.filter(v => validVisibilities.includes(v)).join(',');
            if (!value) continue;
          }

          updates.push(`${field} = $${paramIndex++}`);
          values.push(value);
        }
      }

      if (sharing) {
        updates.push('town_preview_enabled = $' + paramIndex++);
        values.push(sharing.scopes.includes('town') && req.body.townPreviewEnabled === true);
        updates.push('privacy_version = 1');
        updates.push('circle_id = $' + paramIndex++);
        values.push(sharing.circleId);
        updates.push('community_id = $' + paramIndex++);
        values.push(sharing.communityId);
      }

      // Handle photo updates separately (not a column on listings table)
      const hasPhotoUpdate = Array.isArray(req.body.photos);

      if (updates.length === 0 && !hasPhotoUpdate) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      await withTransaction(async client => {
        await client.query('SELECT id FROM listings WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (updates.length > 0) {
          values.push(req.params.id);
          await client.query(
            `UPDATE listings SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
          );
        }

        // Replace listing photos if provided
        if (hasPhotoUpdate) {
          await client.query('DELETE FROM listing_photos WHERE listing_id = $1', [req.params.id]);
          for (let i = 0; i < req.body.photos.length; i++) {
            await client.query(
              'INSERT INTO listing_photos (listing_id, url, sort_order) VALUES ($1, $2, $3)',
              [req.params.id, req.body.photos[i], i]
            );
          }
        }

      });

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
