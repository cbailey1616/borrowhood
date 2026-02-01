import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';

const router = Router();

// ============================================
// GET /api/bundles
// Get available bundles
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT b.*, u.first_name, u.last_name, u.profile_photo_url,
              (SELECT COUNT(*) FROM bundle_items WHERE bundle_id = b.id) as item_count
       FROM bundles b
       JOIN users u ON b.owner_id = u.id
       WHERE b.status = 'active' AND b.owner_id != $1
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );

    const bundles = await Promise.all(result.rows.map(async (b) => {
      // Get bundle items
      const items = await query(
        `SELECT l.id, l.title,
                (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url
         FROM bundle_items bi
         JOIN listings l ON bi.listing_id = l.id
         WHERE bi.bundle_id = $1
         ORDER BY bi.sort_order`,
        [b.id]
      );

      return {
        id: b.id,
        name: b.name,
        description: b.description,
        photoUrl: b.photo_url,
        isFree: b.is_free,
        pricePerDay: b.price_per_day ? parseFloat(b.price_per_day) : null,
        depositAmount: parseFloat(b.deposit_amount),
        itemCount: parseInt(b.item_count),
        timesBorrowed: b.times_borrowed,
        owner: {
          id: b.owner_id,
          firstName: b.first_name,
          lastName: b.last_name,
          profilePhotoUrl: b.profile_photo_url,
        },
        items: items.rows.map(i => ({
          id: i.id,
          title: i.title,
          photoUrl: i.photo_url,
        })),
        createdAt: b.created_at,
      };
    }));

    res.json(bundles);
  } catch (err) {
    console.error('Get bundles error:', err);
    res.status(500).json({ error: 'Failed to get bundles' });
  }
});

// ============================================
// GET /api/bundles/mine
// Get user's bundles
// ============================================
router.get('/mine', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM bundle_items WHERE bundle_id = b.id) as item_count
       FROM bundles b
       WHERE b.owner_id = $1 AND b.status != 'deleted'
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      photoUrl: b.photo_url,
      isFree: b.is_free,
      pricePerDay: b.price_per_day ? parseFloat(b.price_per_day) : null,
      depositAmount: parseFloat(b.deposit_amount),
      itemCount: parseInt(b.item_count),
      timesBorrowed: b.times_borrowed,
      status: b.status,
      createdAt: b.created_at,
    })));
  } catch (err) {
    console.error('Get my bundles error:', err);
    res.status(500).json({ error: 'Failed to get bundles' });
  }
});

// ============================================
// POST /api/bundles
// Create a new bundle
// ============================================
router.post('/', authenticate,
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('description').optional().isLength({ max: 500 }),
  body('listingIds').isArray({ min: 2, max: 10 }),
  body('isFree').isBoolean(),
  body('pricePerDay').optional().isFloat({ min: 0 }),
  body('depositAmount').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, listingIds, isFree, pricePerDay, depositAmount, photoUrl } = req.body;

    try {
      // Verify all listings belong to user
      const listingsCheck = await query(
        `SELECT id FROM listings WHERE id = ANY($1) AND owner_id = $2`,
        [listingIds, req.user.id]
      );

      if (listingsCheck.rows.length !== listingIds.length) {
        return res.status(400).json({ error: 'All items must belong to you' });
      }

      // Create bundle
      const result = await query(
        `INSERT INTO bundles (owner_id, name, description, photo_url, is_free, price_per_day, deposit_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [req.user.id, name, description, photoUrl, isFree, isFree ? null : pricePerDay, depositAmount || 0]
      );

      const bundleId = result.rows[0].id;

      // Add items to bundle
      for (let i = 0; i < listingIds.length; i++) {
        await query(
          `INSERT INTO bundle_items (bundle_id, listing_id, sort_order) VALUES ($1, $2, $3)`,
          [bundleId, listingIds[i], i]
        );
      }

      res.status(201).json({ id: bundleId });
    } catch (err) {
      console.error('Create bundle error:', err);
      res.status(500).json({ error: 'Failed to create bundle' });
    }
  }
);

// ============================================
// DELETE /api/bundles/:id
// Delete a bundle
// ============================================
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `UPDATE bundles SET status = 'deleted' WHERE id = $1 AND owner_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete bundle error:', err);
    res.status(500).json({ error: 'Failed to delete bundle' });
  }
});

export default router;
