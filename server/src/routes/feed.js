import { townPreviewSql, canPreviewTownPost, townListingPreview, townRequestPreview } from '../services/townPreview.js';
import { listingAccessSql, requestAccessSql } from '../utils/sharingPolicy.js';
import { ENABLE_PAYMENTS, REQUIRE_IDENTITY_VERIFICATION } from '../utils/constants.js';
import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, ENABLE_PAID_TIERS } from '../middleware/auth.js';
import { rankFeed } from '../utils/feedRanking.js';
import { canViewListing, canViewRequest } from '../services/listingAccess.js';
import { requestActiveSql } from '../utils/requestState.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = Router();
router.post('/events', authenticate, async (req, res) => {
  const events = req.body.events;
  if (!Array.isArray(events) || events.length > 30 || events.some(e => !e || !UUID.test(e.id) || !['listing', 'request'].includes(e.type) || !['seen', 'click'].includes(e.event))) {
    return res.status(400).json({ error: 'Invalid feed events' });
  }
  try {
    for (const event of events) {
      let allowed = event.type === 'listing' ? await canViewListing(event.id, req.user.id, { discovery: true }) : await canViewRequest(event.id, req.user.id);
      if (!allowed) allowed = await canPreviewTownPost(event.id, req.user.id, event.type);
      if (!allowed) continue;
      const owner = await query(event.type === 'listing' ? 'SELECT owner_id AS id FROM listings WHERE id=$1' : 'SELECT user_id AS id FROM item_requests WHERE id=$1', [event.id]);
      const countClick = event.event === 'click' && owner.rows[0]?.id !== req.user.id;
      await query(`INSERT INTO feed_events(user_id,item_type,item_id,seen_at,clicked_at)
        VALUES($1,$2,$3,NOW(),CASE WHEN $4 THEN NOW() ELSE NULL END)
        ON CONFLICT(user_id,item_type,item_id) DO UPDATE SET seen_at=NOW(),
        clicked_at=CASE WHEN $4 THEN NOW() ELSE feed_events.clicked_at END`, [req.user.id,event.type,event.id,countClick]);
    }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Could not record feed events' }); }
});

// ============================================
// GET /api/feed
// Get combined feed of listings and requests
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { page = 1, limit = 20, search, type, categoryId, visibility } = req.query;
  const offset = (page - 1) * limit;
  if (!Number.isInteger(Number(page)) || Number(page) < 1 || !Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 100) return res.status(400).json({ error: 'Invalid page' });
  const token = req.query.session;
  if (token && !UUID.test(token)) return res.status(400).json({ error: 'Invalid session' });

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
          l.direct_fee,
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
        listingQuery += ` AND l.is_free = true AND l.direct_fee IS NULL`;
      } else if (wantGiveawayOnly) {
        listingQuery += ` AND l.listing_type = 'giveaway'`;
      } else if (wantBorrowOnly) {
        listingQuery += ` AND l.listing_type = 'lend'`;
      }

      if (categoryId) {
        listingQuery += ` AND l.category_id = $${listingParams.length + 1}`;
        listingParams.push(categoryId);
      }

      const fullAccess = listingAccessSql('l', '$' + (listingParams.length + 1), { discovery: true });
      listingQuery = listingQuery.replace('SELECT', `SELECT ${fullAccess} AS full_access,`);
      listingQuery += ' AND (' + fullAccess + ' OR ' + townPreviewSql('l', 'owner_id', '$' + (listingParams.length + 1), { listing: true }) + ')';
      listingParams.push(req.user.id);
      if (visibilityFilters.length) {
        listingQuery += " AND string_to_array(l.visibility::text, ',') && $" + (listingParams.length + 1) + '::text[]';
        listingParams.push(visibilityFilters);
      }
      // Private inventory belongs in My Items, not the discovery feed.
      listingQuery += " AND l.privacy_version = 1 AND l.visibility != 'private'";

      listingQuery += ` ORDER BY l.created_at DESC`;

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
          ${requestActiveSql('r')} AS accepting_offers,
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
            OR ${requestActiveSql('r')}
          )`;

      const requestParams = [req.user.id];

      const fullAccess = requestAccessSql('r', '$1');
      requestQuery = requestQuery.replace('SELECT', `SELECT ${fullAccess} AS full_access,`);
      requestQuery += ' AND (' + fullAccess + ' OR ' + townPreviewSql('r', 'user_id', '$1') + ')';
      if (visibilityFilters.length) {
        requestQuery += " AND string_to_array(r.visibility::text, ',') && $" + (requestParams.length + 1) + '::text[]';
        requestParams.push(visibilityFilters);
      }

      if (search) {
        requestQuery += ` AND (r.title ILIKE $${requestParams.length + 1} OR r.description ILIKE $${requestParams.length + 1})`;
        requestParams.push(`%${search}%`);
      }

      requestQuery += ` ORDER BY r.created_at DESC`;

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
      if (l.full_access === false) return townListingPreview(l);
      const isTownListing = (l.listing_visibility || '').split(',').includes('town') && l.owner_id !== req.user.id;
      const ownerMasked = needsMasking && isTownListing;

      return {
        id: l.id,
        type: 'listing',
        title: l.title,
        description: l.description,
        condition: l.condition,
        isFree: l.is_free,
      directFee: l.direct_fee || null,
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

    const requests = requestsResult.rows.map(r => r.full_access === false ? townRequestPreview(r, true) : ({
      id: r.id,
      type: 'request',
      title: r.title,
      description: r.description,
      neededFrom: r.needed_from,
      neededUntil: r.needed_until,
      isExpired: !r.accepting_offers,
      createdAt: r.created_at,
      user: {
        id: r.user_id,
        firstName: r.display_name || r.first_name,
        lastName: r.display_name ? '' : (r.last_name ? r.last_name.charAt(0) + '.' : ''),
        profilePhotoUrl: r.profile_photo_url,
        isVerified: r.is_verified === true,
      },
    }));

    const candidates = [...listings, ...requests];
    const filterKey = JSON.stringify([search || '', type || '', categoryId || '', visibility || '']);
    let keys;
    if (token) {
      const stored = await query('SELECT item_keys FROM feed_sessions WHERE user_id=$1 AND token=$2 AND filter_key=$3 AND created_at > NOW() - INTERVAL \'1 day\'', [req.user.id, token, filterKey]);
      keys = stored.rows[0]?.item_keys;
    }
    if (!keys) {
      const events = await query(`SELECT item_type, item_id,
        BOOL_OR(user_id=$1 AND seen_at > NOW()-INTERVAL '30 days') AS seen,
        COUNT(*) FILTER(WHERE user_id != $1 AND clicked_at > NOW()-INTERVAL '14 days') AS clicks
        FROM feed_events GROUP BY item_type,item_id`, [req.user.id]);
      const signals = new Map(events.rows.map(e => [e.item_type + ':' + e.item_id, e]));
      keys = rankFeed(candidates, signals, Date.now(), token || 'default').map(item => item.type + ':' + item.id);
      if (token) {
        await query('DELETE FROM feed_sessions WHERE user_id=$1 AND created_at < NOW()-INTERVAL \'1 day\'', [req.user.id]);
        const stored = await query(`INSERT INTO feed_sessions(user_id,token,filter_key,item_keys) VALUES($1,$2,$3,$4)
          ON CONFLICT(user_id,token) DO UPDATE SET token=EXCLUDED.token RETURNING item_keys`, [req.user.id,token,filterKey,JSON.stringify(keys)]);
        keys = stored.rows[0].item_keys;
      }
    }
    // Reapply current access rules on every page; snapshots never grant access.
    const permitted = new Map(candidates.map(item => [item.type + ':' + item.id, item]));
    const pageKeys = keys.slice(offset, offset + Number(limit));
    const feed = pageKeys.map(key => permitted.get(key)).filter(Boolean);
    res.json({
      items: feed,
      page: parseInt(page),
      limit: parseInt(limit),
      hasMore: keys.length > offset + Number(limit),
    });
  } catch (err) {
    console.error('Get feed error:', err);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

export default router;
