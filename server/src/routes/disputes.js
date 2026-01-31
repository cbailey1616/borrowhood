import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { authenticate, requireOrganizer } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { sendNotification } from '../services/notifications.js';

const router = Router();

const ORGANIZER_FEE_PERCENT = 0.02; // 2% of disputed amount

// ============================================
// GET /api/disputes
// Get disputes (organizer sees community disputes, users see their own)
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { status, communityId } = req.query;

  try {
    // Check if user is organizer of any community
    const organized = await query(
      `SELECT community_id FROM community_memberships
       WHERE user_id = $1 AND role = 'organizer'`,
      [req.user.id]
    );

    const organizedCommunityIds = organized.rows.map(r => r.community_id);

    let whereConditions = [];
    let params = [req.user.id];
    let paramIndex = 2;

    // User sees disputes they're involved in, or organizers see their communities
    if (organizedCommunityIds.length > 0) {
      whereConditions.push(`(
        d.opened_by_id = $1 OR
        t.borrower_id = $1 OR
        t.lender_id = $1 OR
        l.community_id = ANY($${paramIndex++})
      )`);
      params.push(organizedCommunityIds);
    } else {
      whereConditions.push(`(d.opened_by_id = $1 OR t.borrower_id = $1 OR t.lender_id = $1)`);
    }

    if (status) {
      whereConditions.push(`d.status = $${paramIndex++}`);
      params.push(status);
    }

    if (communityId) {
      whereConditions.push(`l.community_id = $${paramIndex++}`);
      params.push(communityId);
    }

    const result = await query(
      `SELECT d.*,
              t.listing_id, l.title as listing_title,
              t.deposit_amount, t.rental_fee,
              b.id as borrower_id, b.first_name as borrower_first_name, b.last_name as borrower_last_name,
              lnd.id as lender_id, lnd.first_name as lender_first_name, lnd.last_name as lender_last_name,
              l.community_id
       FROM disputes d
       JOIN borrow_transactions t ON d.transaction_id = t.id
       JOIN listings l ON t.listing_id = l.id
       JOIN users b ON t.borrower_id = b.id
       JOIN users lnd ON t.lender_id = lnd.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY d.created_at DESC`,
      params
    );

    res.json(result.rows.map(d => ({
      id: d.id,
      transactionId: d.transaction_id,
      status: d.status,
      reason: d.reason,
      evidenceUrls: d.evidence_urls,
      listing: {
        id: d.listing_id,
        title: d.listing_title,
      },
      borrower: {
        id: d.borrower_id,
        firstName: d.borrower_first_name,
        lastName: d.borrower_last_name,
      },
      lender: {
        id: d.lender_id,
        firstName: d.lender_first_name,
        lastName: d.lender_last_name,
      },
      depositAmount: parseFloat(d.deposit_amount),
      rentalFee: parseFloat(d.rental_fee),
      communityId: d.community_id,
      resolutionNotes: d.resolution_notes,
      depositToLender: d.deposit_to_lender ? parseFloat(d.deposit_to_lender) : null,
      depositToBorrower: d.deposit_to_borrower ? parseFloat(d.deposit_to_borrower) : null,
      createdAt: d.created_at,
      resolvedAt: d.resolved_at,
    })));
  } catch (err) {
    console.error('Get disputes error:', err);
    res.status(500).json({ error: 'Failed to get disputes' });
  }
});

// ============================================
// GET /api/disputes/:id
// Get dispute details
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*,
              t.*, l.title as listing_title,
              (SELECT array_agg(url ORDER BY sort_order) FROM listing_photos WHERE listing_id = l.id) as listing_photos,
              b.id as borrower_id, b.first_name as borrower_first_name, b.last_name as borrower_last_name,
              b.profile_photo_url as borrower_photo,
              lnd.id as lender_id, lnd.first_name as lender_first_name, lnd.last_name as lender_last_name,
              lnd.profile_photo_url as lender_photo,
              r.first_name as resolver_first_name, r.last_name as resolver_last_name
       FROM disputes d
       JOIN borrow_transactions t ON d.transaction_id = t.id
       JOIN listings l ON t.listing_id = l.id
       JOIN users b ON t.borrower_id = b.id
       JOIN users lnd ON t.lender_id = lnd.id
       LEFT JOIN users r ON d.resolved_by_id = r.id
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const d = result.rows[0];

    // Check access
    const isParty = d.borrower_id === req.user.id || d.lender_id === req.user.id;
    const isOrganizer = await query(
      `SELECT 1 FROM community_memberships m
       JOIN listings l ON l.community_id = m.community_id
       WHERE m.user_id = $1 AND m.role = 'organizer' AND l.id = $2`,
      [req.user.id, d.listing_id]
    );

    if (!isParty && isOrganizer.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized to view this dispute' });
    }

    res.json({
      id: d.id,
      transactionId: d.transaction_id,
      status: d.status,
      reason: d.reason,
      evidenceUrls: d.evidence_urls || [],
      listing: {
        id: d.listing_id,
        title: d.listing_title,
        photos: d.listing_photos || [],
      },
      transaction: {
        conditionAtPickup: d.condition_at_pickup,
        conditionAtReturn: d.condition_at_return,
        conditionNotes: d.condition_notes,
        rentalFee: parseFloat(d.rental_fee),
        depositAmount: parseFloat(d.deposit_amount),
      },
      borrower: {
        id: d.borrower_id,
        firstName: d.borrower_first_name,
        lastName: d.borrower_last_name,
        profilePhotoUrl: d.borrower_photo,
      },
      lender: {
        id: d.lender_id,
        firstName: d.lender_first_name,
        lastName: d.lender_last_name,
        profilePhotoUrl: d.lender_photo,
      },
      resolution: d.resolved_at ? {
        status: d.status,
        notes: d.resolution_notes,
        depositToLender: parseFloat(d.deposit_to_lender),
        depositToBorrower: parseFloat(d.deposit_to_borrower),
        organizerFee: parseFloat(d.organizer_fee),
        resolvedBy: d.resolver_first_name ? `${d.resolver_first_name} ${d.resolver_last_name}` : null,
        resolvedAt: d.resolved_at,
      } : null,
      isOrganizer: isOrganizer.rows.length > 0,
      createdAt: d.created_at,
    });
  } catch (err) {
    console.error('Get dispute error:', err);
    res.status(500).json({ error: 'Failed to get dispute' });
  }
});

// ============================================
// POST /api/disputes/:id/resolve
// Organizer resolves dispute
// ============================================
router.post('/:id/resolve', authenticate,
  body('outcome').isIn(['lender', 'borrower', 'split']),
  body('lenderPercent').optional().isFloat({ min: 0, max: 100 }),
  body('notes').isLength({ min: 10, max: 1000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { outcome, lenderPercent = 50, notes } = req.body;

    try {
      // Get dispute and verify organizer access
      const dispute = await query(
        `SELECT d.*, t.deposit_amount, t.lender_id, t.borrower_id, l.community_id
         FROM disputes d
         JOIN borrow_transactions t ON d.transaction_id = t.id
         JOIN listings l ON t.listing_id = l.id
         WHERE d.id = $1 AND d.status = 'open'`,
        [req.params.id]
      );

      if (dispute.rows.length === 0) {
        return res.status(404).json({ error: 'Dispute not found or already resolved' });
      }

      const d = dispute.rows[0];

      // Verify organizer
      const orgCheck = await query(
        `SELECT 1 FROM community_memberships
         WHERE user_id = $1 AND community_id = $2 AND role = 'organizer'`,
        [req.user.id, d.community_id]
      );

      if (orgCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Only community organizers can resolve disputes' });
      }

      const depositAmount = parseFloat(d.deposit_amount);
      let depositToLender = 0;
      let depositToBorrower = 0;
      let status = '';

      switch (outcome) {
        case 'lender':
          depositToLender = depositAmount;
          status = 'resolved_lender';
          break;
        case 'borrower':
          depositToBorrower = depositAmount;
          status = 'resolved_borrower';
          break;
        case 'split':
          depositToLender = depositAmount * (lenderPercent / 100);
          depositToBorrower = depositAmount - depositToLender;
          status = 'resolved_split';
          break;
      }

      const organizerFee = depositAmount * ORGANIZER_FEE_PERCENT;

      await withTransaction(async (client) => {
        // Update dispute
        await client.query(
          `UPDATE disputes SET
            status = $1, resolved_by_id = $2, resolution_notes = $3,
            deposit_to_lender = $4, deposit_to_borrower = $5, organizer_fee = $6,
            resolved_at = NOW()
           WHERE id = $7`,
          [status, req.user.id, notes, depositToLender, depositToBorrower, organizerFee, req.params.id]
        );

        // Update transaction
        await client.query(
          `UPDATE borrow_transactions SET status = 'completed' WHERE id = $1`,
          [d.transaction_id]
        );

        // Mark listing available
        await client.query(
          `UPDATE listings SET is_available = true
           FROM borrow_transactions t
           WHERE listings.id = t.listing_id AND t.id = $1`,
          [d.transaction_id]
        );
      });

      // Notify both parties
      await sendNotification(d.lender_id, 'dispute_resolved', {
        disputeId: req.params.id,
        outcome,
        amountReceived: depositToLender,
      });

      await sendNotification(d.borrower_id, 'dispute_resolved', {
        disputeId: req.params.id,
        outcome,
        amountRefunded: depositToBorrower,
      });

      res.json({
        success: true,
        resolution: {
          status,
          depositToLender,
          depositToBorrower,
          organizerFee,
        },
      });
    } catch (err) {
      console.error('Resolve dispute error:', err);
      res.status(500).json({ error: 'Failed to resolve dispute' });
    }
  }
);

// ============================================
// POST /api/disputes/:id/evidence
// Add evidence to dispute
// ============================================
router.post('/:id/evidence', authenticate,
  body('urls').isArray({ min: 1, max: 10 }),
  async (req, res) => {
    const { urls } = req.body;

    try {
      // Verify user is party to dispute
      const dispute = await query(
        `SELECT d.*, t.borrower_id, t.lender_id
         FROM disputes d
         JOIN borrow_transactions t ON d.transaction_id = t.id
         WHERE d.id = $1 AND d.status = 'open'`,
        [req.params.id]
      );

      if (dispute.rows.length === 0) {
        return res.status(404).json({ error: 'Dispute not found or already resolved' });
      }

      const d = dispute.rows[0];

      if (d.borrower_id !== req.user.id && d.lender_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Append to evidence_urls
      const currentUrls = d.evidence_urls || [];
      const newUrls = [...currentUrls, ...urls].slice(0, 20); // Max 20

      await query(
        'UPDATE disputes SET evidence_urls = $1 WHERE id = $2',
        [newUrls, req.params.id]
      );

      res.json({ success: true, evidenceCount: newUrls.length });
    } catch (err) {
      console.error('Add evidence error:', err);
      res.status(500).json({ error: 'Failed to add evidence' });
    }
  }
);

export default router;
