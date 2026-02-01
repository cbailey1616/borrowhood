import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';

const router = Router();

// ============================================
// GET /api/listings/:listingId/availability
// Get availability calendar for a listing
// ============================================
router.get('/:listingId/availability', authenticate, async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    // Default to next 60 days if not specified
    const start = startDate || new Date().toISOString().split('T')[0];
    const end = endDate || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
      `SELECT scheduled_pickup_date as start_date, scheduled_return_date as end_date,
              u.first_name as borrower_name
       FROM borrow_transactions bt
       JOIN users u ON bt.borrower_id = u.id
       WHERE bt.listing_id = $1
         AND bt.status IN ('approved', 'paid', 'picked_up')
         AND bt.scheduled_return_date >= $2
         AND bt.scheduled_pickup_date <= $3
       ORDER BY bt.scheduled_pickup_date`,
      [req.params.listingId, start, end]
    );

    res.json({
      blocked: blockedDates.rows.map(d => ({
        startDate: d.start_date,
        endDate: d.end_date,
        note: d.note,
      })),
      booked: bookedDates.rows.map(d => ({
        startDate: d.start_date,
        endDate: d.end_date,
        borrowerName: d.borrower_name,
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
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
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
      const result = await query(
        `INSERT INTO listing_availability (listing_id, start_date, end_date, is_available, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [req.params.listingId, startDate, endDate, isAvailable, note]
      );

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
router.get('/:listingId/check-availability', authenticate, async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate required' });
  }

  try {
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
         AND status IN ('approved', 'paid', 'picked_up')
         AND scheduled_pickup_date <= $3
         AND scheduled_return_date >= $2
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
