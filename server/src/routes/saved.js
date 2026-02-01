import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/saved
// Get user's saved listings
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        l.id,
        l.title,
        l.description,
        l.condition,
        l.is_free,
        l.price_per_day,
        l.created_at,
        u.id as owner_id,
        u.first_name,
        u.last_name,
        u.profile_photo_url,
        u.lender_rating,
        u.lender_rating_count,
        (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url,
        s.created_at as saved_at
      FROM saved_listings s
      JOIN listings l ON s.listing_id = l.id
      JOIN users u ON l.owner_id = u.id
      WHERE s.user_id = $1
        AND l.status = 'active'
      ORDER BY s.created_at DESC`,
      [req.user.id]
    );

    const listings = result.rows.map(l => ({
      id: l.id,
      title: l.title,
      description: l.description,
      condition: l.condition,
      isFree: l.is_free,
      pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
      photoUrl: l.photo_url,
      createdAt: l.created_at,
      savedAt: l.saved_at,
      owner: {
        id: l.owner_id,
        firstName: l.first_name,
        lastName: l.last_name,
        profilePhotoUrl: l.profile_photo_url,
        rating: parseFloat(l.lender_rating) || 0,
        ratingCount: l.lender_rating_count,
      },
    }));

    res.json(listings);
  } catch (err) {
    console.error('Get saved listings error:', err);
    res.status(500).json({ error: 'Failed to get saved listings' });
  }
});

// ============================================
// POST /api/saved/:listingId
// Save a listing
// ============================================
router.post('/:listingId', authenticate, async (req, res) => {
  const { listingId } = req.params;

  try {
    // Check listing exists
    const listing = await query(
      'SELECT id FROM listings WHERE id = $1 AND status = $2',
      [listingId, 'active']
    );

    if (listing.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Save the listing (ignore if already saved)
    await query(
      `INSERT INTO saved_listings (user_id, listing_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, listing_id) DO NOTHING`,
      [req.user.id, listingId]
    );

    res.json({ success: true, saved: true });
  } catch (err) {
    console.error('Save listing error:', err);
    res.status(500).json({ error: 'Failed to save listing' });
  }
});

// ============================================
// DELETE /api/saved/:listingId
// Unsave a listing
// ============================================
router.delete('/:listingId', authenticate, async (req, res) => {
  const { listingId } = req.params;

  try {
    await query(
      'DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2',
      [req.user.id, listingId]
    );

    res.json({ success: true, saved: false });
  } catch (err) {
    console.error('Unsave listing error:', err);
    res.status(500).json({ error: 'Failed to unsave listing' });
  }
});

// ============================================
// GET /api/saved/check/:listingId
// Check if a listing is saved
// ============================================
router.get('/check/:listingId', authenticate, async (req, res) => {
  const { listingId } = req.params;

  try {
    const result = await query(
      'SELECT 1 FROM saved_listings WHERE user_id = $1 AND listing_id = $2',
      [req.user.id, listingId]
    );

    res.json({ saved: result.rows.length > 0 });
  } catch (err) {
    console.error('Check saved error:', err);
    res.status(500).json({ error: 'Failed to check saved status' });
  }
});

export default router;
