import { listingAccessSql, requestAccessSql } from '../utils/sharingPolicy.js';
import { ENABLE_PAYMENTS, REQUIRE_IDENTITY_VERIFICATION } from '../utils/constants.js';
import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, ENABLE_PAID_TIERS } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/feed
// Get combined feed of listings and requests
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { page = 1, limit = 20, search, type, categoryId, visibility } = req.query;
  const offset = (page - 1) * limit;

  try {
    const visibilityFilters = visibility ? visibility.split(',') : [];
    let listingsResult = { rows: [] };
    let requestsResult = { rows: [] };

    // Parse type filters (can be comma-separated: listings,free,requests)
    const typeFilters = type ? type.split(',') : [];
    const wantListings = typeFilters.length === 0 || typeFilters.includes('listings') || typeFilters.includes('free') || typeFilters.includes('giveaway');
    const wantFreeOnly = typeFilters.includes('free') && !typeFilters.includes('listings') && !typeFilters.includes('giveaway');
    const wantGiveawayOnly = typeFilters.includes('giveaway') && !typeFilters.includes('listings') && !typeFilters.includes('free');
    const wantBorrowOnly = typeFilters.includes('listings') && !typeFilters.includes('giveaway') && !typeFilters.includes('free');
    const wantRequests = typeFilters.length === 0 || typeFilters.includes('requests');

    // Get listings if applicable
    if (wantListings) {
      let listingQuery = `
        SELECT
          l.id,
          'listing' as type,
          l.title,
          l.description,
          l.condition,
          l.is_free,
          l.is_available,
          EXISTS (SELECT 1 FROM borrow_transactions t WHERE t.listing_id = l.id
            AND t.status IN ('picked_up', 'return_pending')) as is_borrowed,
          l.price_per_day,
          l.created_at,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.display_name,
          u.profile_photo_url,
          u.lender_rating as rating,
          u.lender_rating_count as rating_count,
          u.is_verified,
          u.total_transactions,
          l.owner_id,
          l.listing_type,
          l.visibility as listing_visibility,
          u.city as owner_city,
          cat.name as category_name,
          cat.icon as category_icon,
          (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url
        FROM listings l
        JOIN users u ON l.owner_id = u.id
        LEFT JOIN categories cat ON l.category_id = cat.id
        WHERE l.status = 'active'
          ${!ENABLE_PAYMENTS ? 'AND l.is_free = true AND COALESCE(l.price_per_day, 0) = 0 AND COALESCE(l.deposit_amount, 0) = 0' : ''}
          AND (l.listing_type != 'giveaway' OR l.is_available = true)`;

      const listingParams = [];

      if (search) {
        listingQuery += ` AND (l.title ILIKE $${listingParams.length + 1} OR l.description ILIKE $${listingParams.length + 1})`;
        listingParams.push(`%${search}%`);
      }

      if (wantFreeOnly) {
        listingQuery += ` AND l.is_free = true`;
      } else if (wantGiveawayOnly) {
        listingQuery += ` AND l.listing_type = 'giveaway'`;
      } else if (wantBorrowOnly) {
        listingQuery += ` AND l.listing_type = 'lend'`;
      }

      if (categoryId) {
        listingQuery += ` AND l.category_id = $${listingParams.length + 1}`;
        listingParams.push(categoryId);
      }

      listingQuery += ' AND ' + listingAccessSql('l', '$' + (listingParams.length + 1), { discovery: true });
      listingParams.push(req.user.id);
      if (visibilityFilters.length) {
        listingQuery += " AND string_to_array(l.visibility::text, ',') && $" + (listingParams.length + 1) + '::text[]';
        listingParams.push(visibilityFilters);
      }
      // Private inventory belongs in My Items, not the discovery feed.
      listingQuery += " AND l.privacy_version = 1 AND l.visibility != 'private'";

      listingQuery += ` ORDER BY l.created_at DESC LIMIT $${listingParams.length + 1}`;
      listingParams.push(parseInt(limit) * 2);

      listingsResult = await query(listingQuery, listingParams);
    }

    // Get requests if applicable
    if (wantRequests) {
      let requestQuery = `
        SELECT
          r.id,
          'request' as type,
          r.title,
          r.description,
          r.needed_from,
          r.needed_until,
          r.expires_at,
          r.created_at,
          r.visibility,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.display_name,
          u.profile_photo_url,
          u.is_verified
        FROM item_requests r
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 'open'
          AND (
            r.user_id = $1
            OR (
              (r.expires_at IS NULL OR r.expires_at > NOW())
              AND (r.needed_until IS NULL OR r.needed_until >= CURRENT_DATE)
            )
          )`;

      const requestParams = [req.user.id];

      requestQuery += ' AND ' + requestAccessSql('r', '$1');
      if (visibilityFilters.length) {
        requestQuery += " AND string_to_array(r.visibility::text, ',') && $" + (requestParams.length + 1) + '::text[]';
        requestParams.push(visibilityFilters);
      }

      if (search) {
        requestQuery += ` AND (r.title ILIKE $${requestParams.length + 1} OR r.description ILIKE $${requestParams.length + 1})`;
        requestParams.push(`%${search}%`);
      }

      requestQuery += ` ORDER BY r.created_at DESC LIMIT $${requestParams.length + 1}`;
      requestParams.push(parseInt(limit) * 2);

      requestsResult = await query(requestQuery, requestParams);
    }

    // Determine if we need to mask owner info on town listings
    const needsMasking = false;

    const maskedUser = {
      id: null,
      firstName: 'Verified',
      lastName: 'Owner',
      profilePhotoUrl: null,
      rating: 0,
      ratingCount: 0,
      isVerified: true,
      totalTransactions: 0,
    };

    // Combine and sort by created_at
    const listings = listingsResult.rows.map(l => {
      const isTownListing = (l.listing_visibility || '').split(',').includes('town') && l.owner_id !== req.user.id;
      const ownerMasked = needsMasking && isTownListing;

      return {
        id: l.id,
        type: 'listing',
        title: l.title,
        description: l.description,
        condition: l.condition,
        isFree: l.is_free,
        listingType: l.listing_type || 'lend',
        isAvailable: l.is_available,
        isBorrowed: l.is_borrowed === true,
        pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
        photoUrl: l.photo_url,
        category: l.category_name || null,
        categoryIcon: l.category_icon || null,
        createdAt: l.created_at,
        user: ownerMasked ? maskedUser : {
          id: l.user_id,
          firstName: l.display_name || l.first_name,
          lastName: l.display_name ? '' : (l.last_name ? l.last_name.charAt(0) + '.' : ''),
          profilePhotoUrl: l.profile_photo_url,
          rating: parseFloat(l.rating) || 0,
          ratingCount: l.rating_count,
          isVerified: l.is_verified === true,
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
      isExpired: r.expires_at ? new Date(r.expires_at) < new Date() : false,
      createdAt: r.created_at,
      user: {
        id: r.user_id,
        firstName: r.display_name || r.first_name,
        lastName: r.display_name ? '' : (r.last_name ? r.last_name.charAt(0) + '.' : ''),
        profilePhotoUrl: r.profile_photo_url,
        isVerified: r.is_verified === true,
      },
    }));

    // Feed algorithm: score-based with freshness tiers + randomization
    // - New listings (< 24h) get top priority
    // - Recent items (1-7 days) get medium priority
    // - Older items fill the rest
    // - Random factor within tiers keeps feed feeling fresh each load
    // - ISOs get a small boost to stay visible
    const now = Date.now();
    const HOUR = 3600000;
    const DAY = 24 * HOUR;

    const scored = [...listings, ...requests].map(item => {
      const age = now - new Date(item.createdAt).getTime();
      const isRequest = item.type === 'request';

      // Base score from recency (exponential decay)
      let score;
      if (age < DAY) {
        // Under 24h: highest tier (score 800-1000)
        score = 1000 - (age / DAY) * 200;
      } else if (age < 7 * DAY) {
        // 1-7 days: medium tier (score 400-800)
        score = 800 - ((age - DAY) / (6 * DAY)) * 400;
      } else {
        // Older: lower tier (score 0-400, decays over 30 days)
        score = Math.max(0, 400 - ((age - 7 * DAY) / (30 * DAY)) * 400);
      }

      // New listing bonus: extra push for listings < 12h old
      if (!isRequest && age < 12 * HOUR) {
        score += 150;
      }

      // ISO boost: smaller than before, keeps them visible but not dominant
      if (isRequest) {
        score += 50;
      }

      // Random factor: shuffles items within ~same freshness level
      // ±75 points keeps it interesting without breaking the tiers
      score += (Math.random() - 0.5) * 150;

      return { ...item, _score: score };
    });

    const feed = scored
      .sort((a, b) => b._score - a._score)
      .slice(offset, offset + parseInt(limit))
      .map(({ _score, ...item }) => item);

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
