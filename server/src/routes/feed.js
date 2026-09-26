import { listingAvailabilitySql } from '../utils/listingAvailability.js';
import { townPreviewSql, canPreviewTownPost, townListingPreview, townRequestPreview } from '../services/townPreview.js';
import { listingAccessSql, requestAccessSql } from '../utils/sharingPolicy.js';
import { ENABLE_PAYMENTS, REQUIRE_IDENTITY_VERIFICATION } from '../utils/constants.js';
import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, ENABLE_PAID_TIERS } from '../middleware/auth.js';
import { rankFeed } from '../utils/feedRanking.js';
import { canViewListing, canViewRequest } from '../services/listingAccess.js';
import { requestActiveSql } from '../utils/requestState.js';
import { WINDOW_PAGES, loadFeedWindow, saveFeedWindow, boundFeedQuery } from '../services/feedWindows.js';
import { endorsementSummaries } from '../services/endorsements.js';

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
  const { page = 1, limit = 20, search, type, categoryId, visibility, communityId } = req.query;
  const windowNumber = Math.floor((Number(page) - 1) / WINDOW_PAGES);
  const windowSize = Number(limit) * WINDOW_PAGES;
  const offset = ((Number(page) - 1) % WINDOW_PAGES) * Number(limit);
  if (!Number.isInteger(Number(page)) || Number(page) < 1 || Number(page) > 100000 || !Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 100) return res.status(400).json({ error: 'Invalid page' });
  const token = req.query.session;
  const summary = req.query.summary === 'true';
  const sections = req.query.layout === 'sections' && !type && !search;
  if (token && (typeof token !== 'string' || !UUID.test(token))) return res.status(400).json({ error: 'Invalid session' });
  if (communityId && (typeof communityId !== 'string' || !UUID.test(communityId))) return res.status(400).json({ error: 'Invalid neighborhood' });

  if ((!token && windowNumber > 0) || [search,type,visibility,categoryId].some(value => value != null && (typeof value !== 'string' || value.length > 200))) return res.status(400).json({ error: 'Invalid feed request' });
  const filterKey = JSON.stringify([search || '', type || '', categoryId || '', visibility || '', sections, communityId || '', Number(limit)]);
  if (Buffer.byteLength(filterKey) > 2000) return res.status(400).json({ error: 'Feed filters are too long' });

  try {
    const window = summary ? null : await loadFeedWindow(req.user.id, token, filterKey, windowNumber);
    if (communityId) {
      const membership = await query(`SELECT 1 FROM community_memberships cm
        JOIN communities c ON c.id = cm.community_id
        WHERE cm.user_id = $1 AND c.id = $2 AND c.is_active = true`, [req.user.id, communityId]);
      if (!membership.rows.length) return res.status(403).json({ error: 'Join this neighborhood to browse its items' });
    }
    const visibilityFilters = visibility ? visibility.split(',') : [];
    let listingsResult = { rows: [] };
    let requestsResult = { rows: [] };

    // Parse type filters (can be comma-separated: listings,free,requests)
    const typeFilters = type ? type.split(',') : [];
    const selectedListingTypes = [
      ...(typeFilters.includes('listings') ? ['lend'] : []),
      ...(typeFilters.includes('giveaway') ? ['giveaway'] : []),
      ...(typeFilters.includes('sell') ? ['sell'] : []),
    ];
    const wantListings = typeFilters.length === 0 || selectedListingTypes.length > 0 || typeFilters.includes('free');
    const wantRequests = typeFilters.length === 0 || typeFilters.includes('requests');

    // Get listings if applicable
    if (wantListings) {
      let listingQuery = `
        SELECT ${summary ? 'l.created_at AS latest_post_at' : `
          l.id,
          'listing' as type,
          l.title,
          l.description,
          l.condition,
          l.is_free,
          l.direct_fee,
          l.is_available,
          ${listingAvailabilitySql()} as availability_status,
          EXISTS (SELECT 1 FROM borrow_transactions t WHERE t.listing_id = l.id
            AND t.status IN ('picked_up', 'return_pending')) as is_borrowed,
          l.price_per_day,
          l.created_at,
          to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_exact,
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
          (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url`}
        FROM listings l
        JOIN users u ON l.owner_id = u.id
        LEFT JOIN categories cat ON l.category_id = cat.id
        WHERE l.status = 'active'
          ${!ENABLE_PAYMENTS ? 'AND l.is_free = true AND COALESCE(l.price_per_day, 0) = 0 AND COALESCE(l.deposit_amount, 0) = 0' : ''}
          AND l.is_available = true
          AND NOT EXISTS (SELECT 1 FROM borrow_transactions active_exchange
            WHERE active_exchange.listing_id = l.id
              AND active_exchange.status IN ('approved', 'paid', 'picked_up', 'return_pending'))`;

      const listingParams = [];

      if (search) {
        listingQuery += ` AND (l.title ILIKE $${listingParams.length + 1} OR l.description ILIKE $${listingParams.length + 1})`;
        listingParams.push(`%${search}%`);
      }

      if (selectedListingTypes.length > 0 || typeFilters.includes('free')) {
        const choices = [];
        if (selectedListingTypes.length > 0) {
          listingParams.push(selectedListingTypes);
          choices.push(`l.listing_type = ANY($${listingParams.length}::text[])`);
        }
        if (typeFilters.includes('free')) choices.push('(l.is_free = true AND l.direct_fee IS NULL)');
        listingQuery += ` AND (${choices.join(' OR ')})`;
      }

      if (categoryId) {
        listingQuery += ` AND l.category_id = $${listingParams.length + 1}`;
        listingParams.push(categoryId);
      }

      const fullAccess = listingAccessSql('l', '$' + (listingParams.length + 1), { discovery: true });
      if (!summary) listingQuery = listingQuery.replace('SELECT', `SELECT ${fullAccess} AS full_access,`);
      listingQuery += ' AND (' + fullAccess + ' OR ' + townPreviewSql('l', 'owner_id', '$' + (listingParams.length + 1), { listing: true }) + ')';
      listingParams.push(req.user.id);
      listingQuery += ` AND l.owner_id != $${listingParams.length}`;
      listingQuery += ` AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
        (b.user_id = $${listingParams.length} AND b.blocked_id = l.owner_id) OR
        (b.blocked_id = $${listingParams.length} AND b.user_id = l.owner_id))`;
      if (visibilityFilters.length) {
        listingQuery += " AND string_to_array(l.visibility::text, ',') && $" + (listingParams.length + 1) + '::text[]';
        listingParams.push(visibilityFilters);
      }
      if (communityId) {
        listingParams.push(communityId);
        listingQuery += ` AND l.community_id = $${listingParams.length} AND 'neighborhood' = ANY(string_to_array(l.visibility::text, ','))`;
      }
      // Private inventory belongs in My Items, not the discovery feed.
      listingQuery += " AND l.privacy_version = 1 AND l.visibility != 'private'";

      if (!summary) listingQuery = boundFeedQuery(listingQuery, listingParams, 'l', 'listing', window, windowSize);
      else listingQuery += ' ORDER BY l.created_at DESC,l.id DESC LIMIT 1';

      listingsResult = await query(listingQuery, listingParams);
    }

    // Get requests if applicable
    if (wantRequests) {
      let requestQuery = `
        SELECT ${summary ? 'r.created_at AS latest_post_at' : `
          ${sections ? 'COUNT(*) OVER()::int AS request_count,' : ''}
          r.id,
          'request' as type,
          r.type as request_type,
          r.title,
          r.description,
          r.photo_url,
          r.needed_from,
          r.needed_until,
          r.expires_at,
          ${requestActiveSql('r')} AS accepting_offers,
          r.created_at,
          to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_exact,
          r.visibility,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.display_name,
          u.profile_photo_url,
          u.is_verified`}
        FROM item_requests r
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 'open'
          AND r.user_id != $1
          AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
            (b.user_id = $1 AND b.blocked_id = r.user_id) OR
            (b.blocked_id = $1 AND b.user_id = r.user_id))
          AND ${requestActiveSql('r')}`;

      const requestParams = [req.user.id];

      const fullAccess = requestAccessSql('r', '$1');
      if (!summary) requestQuery = requestQuery.replace('SELECT', `SELECT ${fullAccess} AS full_access,`);
      requestQuery += ' AND (' + fullAccess + ' OR ' + townPreviewSql('r', 'user_id', '$1') + ')';
      if (visibilityFilters.length) {
        requestQuery += " AND string_to_array(r.visibility::text, ',') && $" + (requestParams.length + 1) + '::text[]';
        requestParams.push(visibilityFilters);
      }
      if (communityId) {
        requestParams.push(communityId);
        requestQuery += ` AND r.community_id = $${requestParams.length} AND 'neighborhood' = ANY(string_to_array(r.visibility::text, ','))`;
      }

      if (search) {
        requestQuery += ` AND (r.title ILIKE $${requestParams.length + 1} OR r.description ILIKE $${requestParams.length + 1})`;
        requestParams.push(`%${search}%`);
      }

      if (!summary) requestQuery = boundFeedQuery(requestQuery, requestParams, 'r', 'request', window, windowSize, sections);
      else requestQuery += ' ORDER BY r.created_at DESC,r.id DESC LIMIT 1';

      requestsResult = await query(requestQuery, requestParams);
    }

    // Use the same current access/status rules as the feed. The lightweight
    // summary uses an indexed newest-row lookup, skips ranking and sessions,
    // and never exposes identities.
    const latestTime = [...listingsResult.rows, ...requestsResult.rows]
      .filter(row => summary || row.user_id !== req.user.id)
      .reduce((latest, row) => Math.max(latest, new Date(summary ? row.latest_post_at : row.created_at).getTime() || 0), 0);
    const latestPostAt = latestTime ? new Date(latestTime).toISOString() : null;
    if (summary) return res.json({ latestPostAt });

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
        availabilityStatus: l.availability_status,
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
      requestType: r.request_type,
      photoUrl: r.photo_url || null,
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
    let snapshot = window;
    if (!snapshot.item_keys) {
      const exactTimes = new Map([
        ...listingsResult.rows.map(row => [`listing:${row.id}`,row.created_at_exact || new Date(row.created_at).toISOString()]),
        ...requestsResult.rows.map(row => [`request:${row.id}`,row.created_at_exact || new Date(row.created_at).toISOString()]),
      ]);
      const chronological = (sections ? listings : candidates).sort((a,b) =>
        exactTimes.get(`${b.type}:${b.id}`).localeCompare(exactTimes.get(`${a.type}:${a.id}`))
        || b.id.localeCompare(a.id) || b.type.localeCompare(a.type));
      const batch = chronological.slice(0, windowSize);
      const ribbon = sections ? requests.slice(0, windowSize) : [];
      const rankingCandidates = [...batch, ...ribbon];
      const listingIds = rankingCandidates.filter(item => item.type === 'listing').map(item => item.id);
      const requestIds = rankingCandidates.filter(item => item.type === 'request').map(item => item.id);
      const events = rankingCandidates.length ? await query(`SELECT item_type, item_id,
        BOOL_OR(user_id=$1 AND seen_at > NOW()-INTERVAL '30 days') AS seen,
        COUNT(*) FILTER(WHERE user_id != $1 AND clicked_at > NOW()-INTERVAL '14 days') AS clicks
        FROM feed_events WHERE (item_type='listing' AND item_id=ANY($2::uuid[])
          OR item_type='request' AND item_id=ANY($3::uuid[]))
        AND (seen_at>NOW()-INTERVAL '30 days' OR clicked_at>NOW()-INTERVAL '14 days')
        GROUP BY item_type,item_id`, [req.user.id,listingIds,requestIds]) : { rows: [] };
      const signals = new Map(events.rows.map(e => [e.item_type + ':' + e.item_id, e]));
      const rank = items => rankFeed(items, signals, new Date(window.snapshot_at).getTime(), token || 'default')
        .map(item => item.type + ':' + item.id);
      const last = batch.at(-1);
      const lastRaw = last && (last.type === 'listing' ? listingsResult.rows : requestsResult.rows).find(row => row.id === last.id);
      snapshot = await saveFeedWindow(req.user.id, token, filterKey, windowNumber, {
        snapshot_at: window.snapshot_at, item_keys: rank(batch), request_keys: window.ribbon_keys || rank(ribbon).slice(0,8),
        next_cursor: last ? { createdAt: lastRaw.created_at_exact || last.createdAt, id: last.id, type: last.type } : null,
        has_more: chronological.length > windowSize,
        request_count: sections ? (window.request_count ?? Number(requestsResult.rows[0]?.request_count || requests.length)) : 0,
        latest_post_at: window.latest_post_at || latestPostAt,
      });
      // Another request may have won snapshot creation with different candidates.
      // Resolve the persisted keys through current access checks on a retry.
      if (snapshot.item_keys.some(key => !candidates.some(item => key === item.type+':'+item.id))) {
        return res.status(409).json({ error: 'The feed changed. Pull down to refresh.' });
      }
    }
    const permitted = new Map(candidates.map(item => [item.type + ':' + item.id, item]));
    let nextOffset = offset;
    let resolvedPage = Number(page);
    let feed;
    do {
      feed = snapshot.item_keys.slice(nextOffset, nextOffset+Number(limit)).map(key => permitted.get(key)).filter(Boolean);
      nextOffset += Number(limit);
      if (feed.length || nextOffset >= snapshot.item_keys.length) break;
      resolvedPage += 1;
    } while (nextOffset < snapshot.item_keys.length);
    // An exhausted/revoked window advances to the next window on the next call.
    if (!feed.length && snapshot.has_more) resolvedPage = (windowNumber+1)*WINDOW_PAGES;
    const visibleRequests = snapshot.request_keys.map(key => permitted.get(key)).filter(Boolean);
    const visibleAuthors = [...feed, ...visibleRequests].filter(item => !item.ownerMasked && !item.previewOnly && item.user?.id);
    const ranks = await endorsementSummaries(visibleAuthors.map(item => item.user.id));
    for (const item of visibleAuthors) item.user.endorsement = ranks.get(item.user.id);

    res.json({
      items: feed,
      ...(sections ? { requests: visibleRequests, requestCount: snapshot.request_count } : {}),
      latestPostAt: snapshot.latest_post_at,
      page: resolvedPage,
      limit: parseInt(limit),
      hasMore: snapshot.has_more || snapshot.item_keys.slice(nextOffset).some(key => permitted.has(key)),
    });
  } catch (err) {
    console.error('Get feed error:', err);
    res.status(err.status || 500).json({ error: err.status === 409 ? err.message : 'Failed to get feed' });
  }
});

export default router;
