import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';

const router = Router();

// ============================================
// GET /api/library
// Get community library items
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    // Get user's community
    const membershipResult = await query(
      `SELECT community_id FROM community_memberships
       WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [req.user.id]
    );

    if (membershipResult.rows.length === 0) {
      return res.json([]);
    }

    const communityId = membershipResult.rows[0].community_id;

    const result = await query(
      `SELECT l.id, l.title, l.description, l.condition,
              cli.checkout_limit_days, cli.is_available,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url,
              u.first_name as donated_by_first_name,
              cli.donation_date
       FROM community_library_items cli
       JOIN listings l ON cli.listing_id = l.id
       LEFT JOIN users u ON cli.donated_by = u.id
       WHERE cli.community_id = $1 AND l.status = 'active'
       ORDER BY cli.donation_date DESC`,
      [communityId]
    );

    res.json(result.rows.map(i => ({
      id: i.id,
      title: i.title,
      description: i.description,
      condition: i.condition,
      checkoutLimitDays: i.checkout_limit_days,
      isAvailable: i.is_available,
      photoUrl: i.photo_url,
      donatedBy: i.donated_by_first_name,
      donationDate: i.donation_date,
    })));
  } catch (err) {
    console.error('Get library error:', err);
    res.status(500).json({ error: 'Failed to get library items' });
  }
});

// ============================================
// POST /api/library/donate
// Donate an item to the community library
// ============================================
router.post('/donate', authenticate,
  body('listingId').isUUID(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { listingId, conditionNotes } = req.body;

    try {
      // Get user's community
      const membershipResult = await query(
        `SELECT community_id FROM community_memberships
         WHERE user_id = $1 AND status = 'active' LIMIT 1`,
        [req.user.id]
      );

      if (membershipResult.rows.length === 0) {
        return res.status(400).json({ error: 'Must be in a community to donate' });
      }

      const communityId = membershipResult.rows[0].community_id;

      // Verify listing belongs to user
      const listing = await query(
        `SELECT owner_id FROM listings WHERE id = $1`,
        [listingId]
      );

      if (listing.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      if (listing.rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Can only donate your own items' });
      }

      // Add to community library
      await query(
        `INSERT INTO community_library_items (community_id, listing_id, donated_by, condition_notes)
         VALUES ($1, $2, $3, $4)`,
        [communityId, listingId, req.user.id, conditionNotes]
      );

      // Mark listing as community-owned and free
      await query(
        `UPDATE listings SET is_community_owned = true, is_free = true, price_per_day = NULL
         WHERE id = $1`,
        [listingId]
      );

      res.status(201).json({ success: true });
    } catch (err) {
      console.error('Donate to library error:', err);
      res.status(500).json({ error: 'Failed to donate item' });
    }
  }
);

// ============================================
// POST /api/library/:itemId/checkout
// Check out a library item
// ============================================
router.post('/:itemId/checkout', authenticate,
  body('returnDate').isISO8601(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { returnDate } = req.body;

    try {
      // Get library item
      const item = await query(
        `SELECT cli.*, l.id as listing_id
         FROM community_library_items cli
         JOIN listings l ON cli.listing_id = l.id
         WHERE l.id = $1`,
        [req.params.itemId]
      );

      if (item.rows.length === 0) {
        return res.status(404).json({ error: 'Library item not found' });
      }

      if (!item.rows[0].is_available) {
        return res.status(400).json({ error: 'Item is currently checked out' });
      }

      // Check return date is within limit
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + item.rows[0].checkout_limit_days);
      if (new Date(returnDate) > maxDate) {
        return res.status(400).json({
          error: `Return date must be within ${item.rows[0].checkout_limit_days} days`
        });
      }

      // Create transaction for tracking
      const transaction = await query(
        `INSERT INTO borrow_transactions
         (listing_id, borrower_id, lender_id, status, scheduled_pickup_date, scheduled_return_date, is_free)
         VALUES ($1, $2, $3, 'approved', CURRENT_DATE, $4, true)
         RETURNING id`,
        [item.rows[0].listing_id, req.user.id, item.rows[0].donated_by, returnDate]
      );

      // Mark as unavailable
      await query(
        `UPDATE community_library_items SET is_available = false WHERE listing_id = $1`,
        [req.params.itemId]
      );

      res.json({ transactionId: transaction.rows[0].id });
    } catch (err) {
      console.error('Checkout library item error:', err);
      res.status(500).json({ error: 'Failed to checkout item' });
    }
  }
);

// ============================================
// POST /api/library/:itemId/return
// Return a library item
// ============================================
router.post('/:itemId/return', authenticate, async (req, res) => {
  try {
    // Find the active checkout
    const checkout = await query(
      `SELECT bt.id FROM borrow_transactions bt
       JOIN community_library_items cli ON bt.listing_id = cli.listing_id
       WHERE bt.listing_id = $1 AND bt.borrower_id = $2 AND bt.status IN ('approved', 'picked_up')`,
      [req.params.itemId, req.user.id]
    );

    if (checkout.rows.length === 0) {
      return res.status(404).json({ error: 'No active checkout found' });
    }

    // Complete the transaction
    await query(
      `UPDATE borrow_transactions SET status = 'completed' WHERE id = $1`,
      [checkout.rows[0].id]
    );

    // Mark item as available again
    await query(
      `UPDATE community_library_items SET is_available = true WHERE listing_id = $1`,
      [req.params.itemId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Return library item error:', err);
    res.status(500).json({ error: 'Failed to return item' });
  }
});

export default router;
