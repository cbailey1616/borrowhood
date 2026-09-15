import { canViewListing } from '../services/listingAccess.js';
import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, query as queryParam, validationResult } from 'express-validator';

const router = Router();

// ============================================
// GET /api/listings/:listingId/availability
// Get availability calendar for a listing
// ============================================
router.get('/:listingId/availability', authenticate,
  queryParam('startDate').optional().isISO8601({ strict: true }),
  queryParam('endDate').optional().isISO8601({ strict: true }), async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Choose valid dates.' });
  const { startDate, endDate } = req.query;

  try {
    if (!await canViewListing(req.params.listingId, req.user.id)) return res.status(404).json({ error: 'Listing not found' });

    // Default to next 60 days if not specified
    const start = startDate || new Date().toISOString().split('T')[0];
    const end = endDate || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (new Date(end) < new Date(start)) return res.status(400).json({ error: 'The end date must follow the start date.' });

    // Get blocked dates from availability table
    const blockedDates = await query(
      `SELECT start_date, end_date, note
       FROM listing_availability
       WHERE listing_id = $1
         AND is_available = false
         AND end_date >= $2
         AND start_date <= $3
       ORDER BY start_date`,
      [req.params.listingId, start, end]
    );

    // Get booked dates from transactions
    const bookedDates = await query(
      `SELECT COALESCE(scheduled_pickup_date, requested_start_date) as start_date,
              COALESCE(scheduled_return_date, requested_end_date) as end_date
       FROM borrow_transactions bt
       WHERE bt.listing_id = $1
         AND bt.status IN ('approved', 'paid', 'picked_up', 'return_pending')
         AND COALESCE(bt.scheduled_return_date, bt.requested_end_date) >= $2
         AND COALESCE(bt.scheduled_pickup_date, bt.requested_start_date) <= $3
       ORDER BY start_date`,
      [req.params.listingId, start, end]
    );

    res.json({
      blocked: blockedDates.rows.map(d => ({
        startDate: d.start_date,
        endDate: d.end_date,
        note: null,
      })),
      booked: bookedDates.rows.map(d => ({
        startDate: d.start_date,
        endDate: d.end_date,
        borrowerName: null,
      })),
    });
  } catch (err) {
    console.error('Get availability error:', err);
    res.status(500).json({ error: 'Failed to get availability' });
  }
});

// ============================================
// POST /api/listings/:listingId/availability
// Set availability for a listing (owner only)
// ============================================
router.post('/:listingId/availability', authenticate,
  body('startDate').isISO8601({ strict: true }),
  body('endDate').isISO8601({ strict: true }).custom((value, { req }) => new Date(value) >= new Date(req.body.startDate)),
  body('isAvailable').isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { startDate, endDate, isAvailable, note } = req.body;

    try {
      // Verify ownership
      const listing = await query(
        `SELECT owner_id FROM listings WHERE id = $1`,
        [req.params.listingId]
      );

      if (listing.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      if (listing.rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Add availability entry
      const result = await withTransaction(async client => {
        await client.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE', [req.params.listingId]);
        return client.query(
          `INSERT INTO listing_availability (listing_id, start_date, end_date, is_available, note)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [req.params.listingId, startDate, endDate, isAvailable, note]
        );
      });

      res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
      console.error('Set availability error:', err);
      res.status(500).json({ error: 'Failed to set availability' });
    }
  }
);

// ============================================
// DELETE /api/listings/:listingId/availability/:id
// Remove availability entry
// ============================================
router.delete('/:listingId/availability/:id', authenticate, async (req, res) => {
  try {
    // Verify ownership
    const listing = await query(
      `SELECT owner_id FROM listings WHERE id = $1`,
      [req.params.listingId]
    );

    if (listing.rows.length === 0 || listing.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await query(
      `DELETE FROM listing_availability WHERE id = $1 AND listing_id = $2`,
      [req.params.id, req.params.listingId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Delete availability error:', err);
    res.status(500).json({ error: 'Failed to delete availability' });
  }
});

// ============================================
// GET /api/listings/:listingId/check-availability
// Check if dates are available
// ============================================
router.get('/:listingId/check-availability', authenticate,
  queryParam('startDate').isISO8601({ strict: true }),
  queryParam('endDate').isISO8601({ strict: true }).custom((value, { req }) => new Date(value) >= new Date(req.query.startDate)), async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!validationResult(req).isEmpty()) {
    return res.status(400).json({ error: 'Choose a valid start and end date.' });
  }

  try {
    if (!await canViewListing(req.params.listingId, req.user.id)) return res.status(404).json({ error: 'Listing not found' });
    // Check for blocked dates
    const blocked = await query(
      `SELECT 1 FROM listing_availability
       WHERE listing_id = $1 AND is_available = false
         AND start_date <= $3 AND end_date >= $2
       LIMIT 1`,
      [req.params.listingId, startDate, endDate]
    );

    if (blocked.rows.length > 0) {
      return res.json({ available: false, reason: 'Owner has marked these dates unavailable' });
    }

    // Check for existing bookings
    const booked = await query(
      `SELECT 1 FROM borrow_transactions
       WHERE listing_id = $1
         AND status IN ('approved', 'paid', 'picked_up', 'return_pending')
         AND COALESCE(scheduled_pickup_date, requested_start_date) <= $3
         AND COALESCE(scheduled_return_date, requested_end_date) >= $2
       LIMIT 1`,
      [req.params.listingId, startDate, endDate]
    );

    if (booked.rows.length > 0) {
      return res.json({ available: false, reason: 'Already booked for these dates' });
    }

    res.json({ available: true });
  } catch (err) {
    console.error('Check availability error:', err);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

export default router;
