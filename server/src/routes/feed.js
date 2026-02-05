import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/feed
// Get combined feed of listings and requests
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { page = 1, limit = 20, search, type } = req.query;
  const offset = (page - 1) * limit;

  try {
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
          u.lender_rating,
          u.lender_rating_count,
          u.is_verified,
          u.total_transactions,
          l.owner_id,
          (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url
        FROM listings l
        JOIN users u ON l.owner_id = u.id
        WHERE l.status = 'active'`;

      const listingParams = [];

      if (search) {
        listingQuery += ` AND (l.title ILIKE $1 OR l.description ILIKE $1)`;
        listingParams.push(`%${search}%`);
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

    // Combine and sort by created_at
    const listings = listingsResult.rows.map(l => ({
      id: l.id,
      type: 'listing',
      title: l.title,
      description: l.description,
      condition: l.condition,
      isFree: l.is_free,
      pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
      photoUrl: l.photo_url,
      createdAt: l.created_at,
      user: {
        id: l.user_id,
        firstName: l.first_name,
        lastName: l.last_name,
        profilePhotoUrl: l.profile_photo_url,
        rating: parseFloat(l.lender_rating) || 0,
        ratingCount: l.lender_rating_count,
        isVerified: l.is_verified,
        totalTransactions: l.total_transactions,
      },
      owner: {
        id: l.owner_id,
      },
    }));

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
