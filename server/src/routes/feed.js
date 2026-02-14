import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/feed
// Get combined feed of listings and requests
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { page = 1, limit = 20, search, type, categoryId, visibility } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Get user info for visibility filtering
    const userResult = await query(
      'SELECT city, subscription_tier, is_verified, verification_grace_until FROM users WHERE id = $1',
      [req.user.id]
    );
    const userCity = userResult.rows[0]?.city;
    const userTier = userResult.rows[0]?.subscription_tier || 'free';
    const graceActive = userResult.rows[0]?.verification_grace_until && new Date(userResult.rows[0].verification_grace_until) > new Date();
    const isVerified = userResult.rows[0]?.is_verified || graceActive;
    const canAccessTown = userTier === 'plus' && isVerified && userCity;
    const canBrowseTown = userTier === 'plus' && userCity; // Plus + has city, regardless of verification

    // Parse visibility filter
    const visibilityFilters = visibility ? visibility.split(',') : [];
    const wantsTown = visibilityFilters.includes('town');

    // If town visibility requested but user can't browse it, return 403
    if (wantsTown && !canBrowseTown) {
      return res.status(403).json({
        error: 'Plus subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
      });
    }

    // Get user's friends for visibility filtering
    const friendsResult = await query(
      'SELECT friend_id FROM friendships WHERE user_id = $1',
      [req.user.id]
    );
    const friendIds = friendsResult.rows.map(f => f.friend_id);

    // Get user's communities for neighborhood visibility filtering
    const communityResult = await query(
      'SELECT community_id FROM community_memberships WHERE user_id = $1',
      [req.user.id]
    );
    const communityIds = communityResult.rows.map(c => c.community_id);

    let listingsResult = { rows: [] };
    let requestsResult = { rows: [] };

    // Get listings if not filtered to requests only
    if (type !== 'requests') {
      let listingQuery = `
        SELECT
          l.id,
          'listing' as type,
          l.title,
          l.description,
          l.condition,
          l.is_free,
          l.price_per_day,
          l.created_at,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.profile_photo_url,
          u.rating,
          u.rating_count,
          u.status,
          u.total_transactions,
          l.owner_id,
          l.visibility as listing_visibility,
          u.city as owner_city,
          cat.name as category_name,
          cat.icon as category_icon,
          (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url
        FROM listings l
        JOIN users u ON l.owner_id = u.id
        LEFT JOIN categories cat ON l.category_id = cat.id
        WHERE l.status = 'active'`;

      const listingParams = [];

      if (search) {
        listingQuery += ` AND (l.title ILIKE $${listingParams.length + 1} OR l.description ILIKE $${listingParams.length + 1})`;
        listingParams.push(`%${search}%`);
      }

      if (categoryId) {
        listingQuery += ` AND l.category_id = $${listingParams.length + 1}`;
        listingParams.push(categoryId);
      }

      // Visibility filtering
      if (visibilityFilters.length > 0) {
        const visConds = [];
        // Always show own listings
        visConds.push(`l.owner_id = $${listingParams.length + 1}`);
        listingParams.push(req.user.id);

        if (visibilityFilters.includes('close_friends')) {
          visConds.push(`(l.visibility = 'close_friends' AND l.owner_id = ANY($${listingParams.length + 1}))`);
          listingParams.push(friendIds.length > 0 ? friendIds : [null]);
        }
        if (visibilityFilters.includes('neighborhood')) {
          visConds.push(`(l.visibility = 'neighborhood' AND l.community_id = ANY($${listingParams.length + 1}))`);
          listingParams.push(communityIds.length > 0 ? communityIds : [null]);
        }
        if (wantsTown && canBrowseTown) {
          visConds.push(`(l.visibility = 'town' AND u.city = $${listingParams.length + 1} AND u.city IS NOT NULL)`);
          listingParams.push(userCity);
        }
        listingQuery += ` AND (${visConds.join(' OR ')})`;
      } else {
        // No visibility filter — show everything user has access to
        const visConds = [];
        visConds.push(`l.owner_id = $${listingParams.length + 1}`);
        listingParams.push(req.user.id);
        visConds.push(`(l.visibility = 'close_friends' AND l.owner_id = ANY($${listingParams.length + 1}))`);
        listingParams.push(friendIds.length > 0 ? friendIds : [null]);
        visConds.push(`(l.visibility = 'neighborhood' AND l.community_id = ANY($${listingParams.length + 1}))`);
        listingParams.push(communityIds.length > 0 ? communityIds : [null]);
        if (canAccessTown) {
          visConds.push(`(l.visibility = 'town' AND u.city = $${listingParams.length + 1} AND u.city IS NOT NULL)`);
          listingParams.push(userCity);
        }
        listingQuery += ` AND (${visConds.join(' OR ')})`;
      }

      listingQuery += ` ORDER BY l.created_at DESC LIMIT $${listingParams.length + 1}`;
      listingParams.push(parseInt(limit) * 2);

      listingsResult = await query(listingQuery, listingParams);
    }

    // Get requests if not filtered to listings only
    if (type !== 'listings') {
      let requestQuery = `
        SELECT
          r.id,
          'request' as type,
          r.title,
          r.description,
          r.needed_from,
          r.needed_until,
          r.created_at,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.profile_photo_url
        FROM item_requests r
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 'open'`;

      const requestParams = [];

      if (search) {
        requestQuery += ` AND (r.title ILIKE $1 OR r.description ILIKE $1)`;
        requestParams.push(`%${search}%`);
      }

      requestQuery += ` ORDER BY r.created_at DESC LIMIT $${requestParams.length + 1}`;
      requestParams.push(parseInt(limit) * 2);

      requestsResult = await query(requestQuery, requestParams);
    }

    // Determine if we need to mask owner info on town listings
    const needsMasking = canBrowseTown && !canAccessTown;

    const maskedUser = {
      id: null,
      firstName: 'Verified',
      lastName: 'Lender',
      profilePhotoUrl: null,
      rating: 0,
      ratingCount: 0,
      isVerified: true,
      totalTransactions: 0,
    };

    // Combine and sort by created_at
    const listings = listingsResult.rows.map(l => {
      const isTownListing = l.listing_visibility === 'town' && l.owner_id !== req.user.id;
      const ownerMasked = needsMasking && isTownListing;

      return {
        id: l.id,
        type: 'listing',
        title: l.title,
        description: l.description,
        condition: l.condition,
        isFree: l.is_free,
        pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
        photoUrl: l.photo_url,
        category: l.category_name || null,
        categoryIcon: l.category_icon || null,
        createdAt: l.created_at,
        user: ownerMasked ? maskedUser : {
          id: l.user_id,
          firstName: l.first_name,
          lastName: l.last_name,
          profilePhotoUrl: l.profile_photo_url,
          rating: parseFloat(l.rating) || 0,
          ratingCount: l.rating_count,
          isVerified: l.status === 'verified',
          totalTransactions: l.total_transactions,
        },
        owner: {
          id: ownerMasked ? null : l.owner_id,
        },
        ...(ownerMasked && { ownerMasked: true }),
      };
    });

    const requests = requestsResult.rows.map(r => ({
      id: r.id,
      type: 'request',
      title: r.title,
      description: r.description,
      neededFrom: r.needed_from,
      neededUntil: r.needed_until,
      createdAt: r.created_at,
      user: {
        id: r.user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        profilePhotoUrl: r.profile_photo_url,
      },
    }));

    // Combine and sort
    const feed = [...listings, ...requests]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(offset, offset + parseInt(limit));

    res.json({
      items: feed,
      page: parseInt(page),
      limit: parseInt(limit),
      hasMore: feed.length === parseInt(limit),
    });
  } catch (err) {
    console.error('Get feed error:', err);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

export default router;
