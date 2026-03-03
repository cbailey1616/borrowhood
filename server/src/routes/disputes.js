import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { sendNotification } from '../services/notifications.js';
import { notifyOrganizers } from '../services/notifications.js';
import { capturePaymentIntent, cancelPaymentIntent, getPaymentIntent } from '../services/stripe.js';

const router = Router();

const ORGANIZER_FEE_PERCENT = 0.02; // 2% of disputed amount

const VALID_TYPES = ['damagesClaim', 'nonReturn', 'lateReturn', 'itemNotAsDescribed', 'paymentIssue', 'noShow'];

const TYPE_LABELS = {
  damagesClaim: 'Damages Claim',
  nonReturn: 'Non-Return',
  lateReturn: 'Late Return',
  itemNotAsDescribed: 'Item Not As Described',
  paymentIssue: 'Payment Issue',
  noShow: 'No Show',
};

// ============================================
// POST /api/disputes
// File a new dispute
// ============================================
router.post('/', authenticate,
  body('transactionId').isUUID(),
  body('type').isIn(VALID_TYPES),
  body('description').isLength({ min: 10, max: 2000 }),
  body('photoUrls').optional().isArray({ max: 4 }),
  body('requestedAmount').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { transactionId, type, description, photoUrls = [], requestedAmount } = req.body;

    try {
      // Get transaction and verify user is a party
      const txn = await query(
        `SELECT t.*, l.title as listing_title, l.community_id
         FROM borrow_transactions t
         JOIN listings l ON t.listing_id = l.id
         WHERE t.id = $1`,
        [transactionId]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const t = txn.rows[0];

      // Verify user is a party
      if (t.borrower_id !== req.user.id && t.lender_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to file a dispute on this transaction' });
      }

      // Verify transaction is in a completed/returned state
      if (!['returned', 'completed'].includes(t.status)) {
        return res.status(400).json({ error: 'Can only file disputes on returned or completed rentals' });
      }

      // Verify within 72-hour window (use actual_return_at or requested_end_date)
      const returnDate = t.actual_return_at || t.requested_end_date;
      if (returnDate) {
        const hoursSinceReturn = (Date.now() - new Date(returnDate).getTime()) / (1000 * 60 * 60);
        if (hoursSinceReturn > 72) {
          return res.status(400).json({ error: 'Disputes must be filed within 72 hours of rental end' });
        }
      }

      // Verify no existing dispute
      const existing = await query(
        'SELECT id FROM disputes WHERE transaction_id = $1',
        [transactionId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'A dispute already exists for this transaction' });
      }

      // Validate requestedAmount for damagesClaim
      if (type === 'damagesClaim' && (!requestedAmount || requestedAmount <= 0)) {
        return res.status(400).json({ error: 'Damage claims require a requested amount' });
      }

      // Cap requestedAmount at deposit
      const depositAmount = parseFloat(t.deposit_amount) || 0;
      const cappedAmount = requestedAmount ? Math.min(requestedAmount, depositAmount) : null;

      // Determine claimant and respondent
      const claimantUserId = req.user.id;
      const respondentUserId = t.borrower_id === req.user.id ? t.lender_id : t.borrower_id;

      const result = await query(
        `INSERT INTO disputes (
          transaction_id, claimant_user_id, respondent_user_id, opened_by_id,
          type, description, reason, photo_urls, evidence_urls,
          requested_amount, status
        ) VALUES ($1, $2, $3, $2, $4, $5, $5, $6, $6, $7, 'awaitingResponse')
        RETURNING id, created_at`,
        [transactionId, claimantUserId, respondentUserId, type, description, photoUrls, cappedAmount]
      );

      // Update transaction status to disputed
      await query(
        `UPDATE borrow_transactions SET status = 'disputed' WHERE id = $1`,
        [transactionId]
      );

      // Notify respondent
      await sendNotification(respondentUserId, 'dispute_filed_against_you', {
        disputeId: result.rows[0].id,
        transactionId,
        itemTitle: t.listing_title,
        typeLabel: TYPE_LABELS[type],
      });

      res.status(201).json({
        id: result.rows[0].id,
        status: 'awaitingResponse',
        createdAt: result.rows[0].created_at,
      });
    } catch (err) {
      console.error('File dispute error:', err);
      res.status(500).json({ error: 'Failed to file dispute' });
    }
  }
);

// ============================================
// POST /api/disputes/:id/respond
// Respondent submits their response
// ============================================
router.post('/:id/respond', authenticate,
  body('responseDescription').isLength({ min: 10, max: 2000 }),
  body('responsePhotoUrls').optional().isArray({ max: 4 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { responseDescription, responsePhotoUrls = [] } = req.body;

    try {
      const dispute = await query(
        `SELECT d.*, t.listing_id, l.community_id, l.title as listing_title
         FROM disputes d
         JOIN borrow_transactions t ON d.transaction_id = t.id
         JOIN listings l ON t.listing_id = l.id
         WHERE d.id = $1`,
        [req.params.id]
      );

      if (dispute.rows.length === 0) {
        return res.status(404).json({ error: 'Dispute not found' });
      }

      const d = dispute.rows[0];

      // Verify caller is the respondent
      if (d.respondent_user_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the respondent can submit a response' });
      }

      // Verify status is awaitingResponse
      if (d.status !== 'awaitingResponse') {
        return res.status(400).json({ error: 'This dispute is no longer accepting responses' });
      }

      // Verify not already responded
      if (d.responded_at) {
        return res.status(400).json({ error: 'You have already responded to this dispute' });
      }

      // Verify within 48-hour window
      const hoursSinceFiled = (Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceFiled > 48) {
        return res.status(400).json({ error: 'The 48-hour response window has passed' });
      }

      await query(
        `UPDATE disputes SET
          response_description = $1, response_photo_urls = $2,
          responded_at = NOW(), status = 'underReview'
         WHERE id = $3`,
        [responseDescription, responsePhotoUrls, req.params.id]
      );

      // Notify claimant
      await sendNotification(d.claimant_user_id, 'dispute_response_received', {
        disputeId: req.params.id,
        transactionId: d.transaction_id,
        respondentName: `${req.user.first_name} ${req.user.last_name}`,
      });

      // Notify community organizers
      if (d.community_id) {
        await notifyOrganizers(d.community_id, 'dispute_ready_for_review', {
          disputeId: req.params.id,
          transactionId: d.transaction_id,
          itemTitle: d.listing_title,
        });
      }

      res.json({ success: true, status: 'underReview' });
    } catch (err) {
      console.error('Respond to dispute error:', err);
      res.status(500).json({ error: 'Failed to submit response' });
    }
  }
);

// ============================================
// GET /api/disputes
// List disputes (parties see their own, organizers see community, admins see all)
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { status, communityId, type } = req.query;

  try {
    let whereConditions = [];
    let params = [req.user.id];
    let paramIndex = 2;

    // Admin sees all, otherwise scoped
    if (req.user.is_admin) {
      whereConditions.push('1=1');
    } else {
      // Check if user is organizer of any community
      const organized = await query(
        `SELECT community_id FROM community_memberships
         WHERE user_id = $1 AND role = 'organizer'`,
        [req.user.id]
      );

      const organizedCommunityIds = organized.rows.map(r => r.community_id);

      if (organizedCommunityIds.length > 0) {
        whereConditions.push(`(
          d.claimant_user_id = $1 OR
          d.respondent_user_id = $1 OR
          l.community_id = ANY($${paramIndex++})
        )`);
        params.push(organizedCommunityIds);
      } else {
        whereConditions.push(`(d.claimant_user_id = $1 OR d.respondent_user_id = $1)`);
      }
    }

    if (status) {
      whereConditions.push(`d.status = $${paramIndex++}`);
      params.push(status);
    }

    if (type) {
      whereConditions.push(`d.type = $${paramIndex++}`);
      params.push(type);
    }

    if (communityId) {
      whereConditions.push(`l.community_id = $${paramIndex++}`);
      params.push(communityId);
    }

    const result = await query(
      `SELECT d.id, d.transaction_id, d.status, d.type, d.description,
              d.photo_urls, d.requested_amount, d.resolved_amount,
              d.responded_at, d.created_at, d.resolved_at,
              t.listing_id, l.title as listing_title,
              t.deposit_amount, t.rental_fee,
              c.id as claimant_id, c.first_name as claimant_first_name, c.last_name as claimant_last_name,
              r.id as respondent_id, r.first_name as respondent_first_name, r.last_name as respondent_last_name,
              l.community_id
       FROM disputes d
       JOIN borrow_transactions t ON d.transaction_id = t.id
       JOIN listings l ON t.listing_id = l.id
       LEFT JOIN users c ON d.claimant_user_id = c.id
       LEFT JOIN users r ON d.respondent_user_id = r.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY d.created_at DESC`,
      params
    );

    res.json(result.rows.map(d => ({
      id: d.id,
      transactionId: d.transaction_id,
      status: d.status,
      type: d.type,
      description: d.description,
      photoUrls: d.photo_urls || [],
      listing: {
        id: d.listing_id,
        title: d.listing_title,
      },
      claimant: d.claimant_id ? {
        id: d.claimant_id,
        firstName: d.claimant_first_name,
        lastName: d.claimant_last_name,
      } : null,
      respondent: d.respondent_id ? {
        id: d.respondent_id,
        firstName: d.respondent_first_name,
        lastName: d.respondent_last_name,
      } : null,
      depositAmount: parseFloat(d.deposit_amount),
      rentalFee: parseFloat(d.rental_fee),
      requestedAmount: d.requested_amount ? parseFloat(d.requested_amount) : null,
      resolvedAmount: d.resolved_amount ? parseFloat(d.resolved_amount) : null,
      hasResponse: !!d.responded_at,
      communityId: d.community_id,
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
      `SELECT d.id as dispute_id, d.transaction_id, d.status as dispute_status,
              d.type, d.description, d.photo_urls, d.reason, d.evidence_urls,
              d.response_description, d.response_photo_urls, d.responded_at,
              d.requested_amount, d.resolved_amount, d.hold_expired,
              d.resolution_notes, d.deposit_to_lender, d.deposit_to_borrower, d.organizer_fee,
              d.claimant_user_id, d.respondent_user_id,
              d.resolved_by_id, d.resolved_at, d.created_at as dispute_created_at,
              t.listing_id, t.condition_at_pickup, t.condition_at_return, t.condition_notes,
              t.rental_fee, t.deposit_amount,
              l.title as listing_title, l.community_id,
              (SELECT array_agg(url ORDER BY sort_order) FROM listing_photos WHERE listing_id = l.id) as listing_photos,
              c.id as claimant_id, c.first_name as claimant_first_name, c.last_name as claimant_last_name,
              c.profile_photo_url as claimant_photo,
              resp.id as respondent_id, resp.first_name as respondent_first_name, resp.last_name as respondent_last_name,
              resp.profile_photo_url as respondent_photo,
              resolver.first_name as resolver_first_name, resolver.last_name as resolver_last_name
       FROM disputes d
       JOIN borrow_transactions t ON d.transaction_id = t.id
       JOIN listings l ON t.listing_id = l.id
       LEFT JOIN users c ON d.claimant_user_id = c.id
       LEFT JOIN users resp ON d.respondent_user_id = resp.id
       LEFT JOIN users resolver ON d.resolved_by_id = resolver.id
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const d = result.rows[0];

    // Check access: party, organizer, or admin
    const isClaimant = d.claimant_id === req.user.id;
    const isRespondent = d.respondent_id === req.user.id;
    const isParty = isClaimant || isRespondent;

    const orgCheck = await query(
      `SELECT 1 FROM community_memberships
       WHERE user_id = $1 AND community_id = $2 AND role = 'organizer'`,
      [req.user.id, d.community_id]
    );
    const isOrganizer = orgCheck.rows.length > 0;
    const isAdmin = req.user.is_admin;

    if (!isParty && !isOrganizer && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to view this dispute' });
    }

    res.json({
      id: d.dispute_id,
      transactionId: d.transaction_id,
      status: d.dispute_status,
      type: d.type || 'damagesClaim',
      description: d.description || d.reason,
      photoUrls: d.photo_urls || d.evidence_urls || [],
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
      claimant: d.claimant_id ? {
        id: d.claimant_id,
        firstName: d.claimant_first_name,
        lastName: d.claimant_last_name,
        profilePhotoUrl: d.claimant_photo,
      } : null,
      respondent: d.respondent_id ? {
        id: d.respondent_id,
        firstName: d.respondent_first_name,
        lastName: d.respondent_last_name,
        profilePhotoUrl: d.respondent_photo,
      } : null,
      response: d.responded_at ? {
        description: d.response_description,
        photoUrls: d.response_photo_urls || [],
        respondedAt: d.responded_at,
      } : null,
      requestedAmount: d.requested_amount ? parseFloat(d.requested_amount) : null,
      resolvedAmount: d.resolved_amount ? parseFloat(d.resolved_amount) : null,
      holdExpired: d.hold_expired || false,
      resolution: d.resolved_at ? {
        status: d.dispute_status,
        notes: d.resolution_notes,
        resolvedAmount: d.resolved_amount ? parseFloat(d.resolved_amount) : null,
        depositToLender: d.deposit_to_lender ? parseFloat(d.deposit_to_lender) : null,
        depositToBorrower: d.deposit_to_borrower ? parseFloat(d.deposit_to_borrower) : null,
        organizerFee: d.organizer_fee ? parseFloat(d.organizer_fee) : null,
        resolvedBy: d.resolver_first_name ? `${d.resolver_first_name} ${d.resolver_last_name}` : null,
        resolvedAt: d.resolved_at,
      } : null,
      isClaimant,
      isRespondent,
      isOrganizer,
      isAdmin,
      createdAt: d.dispute_created_at,
    });
  } catch (err) {
    console.error('Get dispute error:', err);
    res.status(500).json({ error: 'Failed to get dispute' });
  }
});

// ============================================
// POST /api/disputes/:id/resolve
// Organizer or admin resolves dispute
// ============================================
router.post('/:id/resolve', authenticate,
  body('outcome').isIn(['claimant', 'respondent', 'dismissed']),
  body('resolvedAmount').optional().isFloat({ min: 0 }),
  body('notes').isLength({ min: 10, max: 1000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { outcome, resolvedAmount, notes } = req.body;

    try {
      // Get dispute with transaction and listing info
      const dispute = await query(
        `SELECT d.*, t.deposit_amount, t.lender_id, t.borrower_id,
                t.stripe_payment_intent_id, t.payment_status,
                l.community_id
         FROM disputes d
         JOIN borrow_transactions t ON d.transaction_id = t.id
         JOIN listings l ON t.listing_id = l.id
         WHERE d.id = $1 AND d.status IN ('awaitingResponse', 'underReview')`,
        [req.params.id]
      );

      if (dispute.rows.length === 0) {
        return res.status(404).json({ error: 'Dispute not found or already resolved' });
      }

      const d = dispute.rows[0];

      // Verify resolver is organizer of community OR admin
      if (!req.user.is_admin) {
        const orgCheck = await query(
          `SELECT 1 FROM community_memberships
           WHERE user_id = $1 AND community_id = $2 AND role = 'organizer'`,
          [req.user.id, d.community_id]
        );

        if (orgCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Only community organizers or admins can resolve disputes' });
        }
      }

      const depositAmount = parseFloat(d.deposit_amount);
      let finalResolvedAmount = 0;
      let status = '';
      let holdExpired = false;

      if (outcome === 'claimant') {
        // Cap at deposit and requested amount
        const maxAmount = Math.min(
          resolvedAmount || depositAmount,
          d.requested_amount ? parseFloat(d.requested_amount) : depositAmount,
          depositAmount
        );
        finalResolvedAmount = maxAmount;
        status = 'resolvedInFavorOfClaimant';

        // Attempt to capture from the authorization hold
        if (d.stripe_payment_intent_id && d.payment_status === 'authorized') {
          try {
            const amountCents = Math.round(finalResolvedAmount * 100);
            await capturePaymentIntent(d.stripe_payment_intent_id, amountCents);
          } catch (stripeErr) {
            // Auth hold likely expired
            holdExpired = true;
            status = 'expired';
            console.error('Stripe capture failed (hold likely expired):', stripeErr.message);
          }
        }
      } else {
        // respondent or dismissed — release the hold
        status = outcome === 'respondent' ? 'resolvedInFavorOfRespondent' : 'dismissed';
        finalResolvedAmount = 0;

        if (d.stripe_payment_intent_id && d.payment_status === 'authorized') {
          try {
            const pi = await getPaymentIntent(d.stripe_payment_intent_id);
            if (pi.status === 'requires_capture') {
              await cancelPaymentIntent(d.stripe_payment_intent_id);
            }
          } catch (stripeErr) {
            // Hold may have already expired, which is fine for release
            console.error('Stripe release error (may be already expired):', stripeErr.message);
          }
        }
      }

      const organizerFee = depositAmount * ORGANIZER_FEE_PERCENT;

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE disputes SET
            status = $1, resolved_by_id = $2, resolution_notes = $3,
            resolved_amount = $4, hold_expired = $5,
            deposit_to_lender = $6, deposit_to_borrower = $7, organizer_fee = $8,
            resolved_at = NOW()
           WHERE id = $9`,
          [
            status, req.user.id, notes, finalResolvedAmount, holdExpired,
            outcome === 'claimant' ? finalResolvedAmount : 0,
            outcome === 'respondent' ? depositAmount : 0,
            organizerFee,
            req.params.id,
          ]
        );

        await client.query(
          `UPDATE borrow_transactions SET status = 'completed' WHERE id = $1`,
          [d.transaction_id]
        );

        await client.query(
          `UPDATE listings SET is_available = true
           FROM borrow_transactions t
           WHERE listings.id = t.listing_id AND t.id = $1`,
          [d.transaction_id]
        );
      });

      // Notify both parties
      const claimantId = d.claimant_user_id;
      const respondentId = d.respondent_user_id;

      await sendNotification(claimantId, 'dispute_resolved', {
        disputeId: req.params.id,
        transactionId: d.transaction_id,
        outcome,
        resolvedAmount: finalResolvedAmount,
      });

      await sendNotification(respondentId, 'dispute_resolved', {
        disputeId: req.params.id,
        transactionId: d.transaction_id,
        outcome,
        resolvedAmount: finalResolvedAmount,
      });

      res.json({
        success: true,
        resolution: {
          status,
          resolvedAmount: finalResolvedAmount,
          holdExpired,
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
// Add evidence to dispute (legacy endpoint, kept for backward compat)
// ============================================
router.post('/:id/evidence', authenticate,
  body('urls').isArray({ min: 1, max: 10 }),
  async (req, res) => {
    const { urls } = req.body;

    try {
      const dispute = await query(
        `SELECT d.*, t.borrower_id, t.lender_id
         FROM disputes d
         JOIN borrow_transactions t ON d.transaction_id = t.id
         WHERE d.id = $1 AND d.status IN ('awaitingResponse', 'underReview')`,
        [req.params.id]
      );

      if (dispute.rows.length === 0) {
        return res.status(404).json({ error: 'Dispute not found or already resolved' });
      }

      const d = dispute.rows[0];
      const isClaimant = d.claimant_user_id === req.user.id;
      const isRespondent = d.respondent_user_id === req.user.id;

      if (!isClaimant && !isRespondent) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Append to the appropriate photo array
      if (isClaimant) {
        const currentUrls = d.photo_urls || [];
        const newUrls = [...currentUrls, ...urls].slice(0, 4);
        await query('UPDATE disputes SET photo_urls = $1 WHERE id = $2', [newUrls, req.params.id]);
        res.json({ success: true, evidenceCount: newUrls.length });
      } else {
        const currentUrls = d.response_photo_urls || [];
        const newUrls = [...currentUrls, ...urls].slice(0, 4);
        await query('UPDATE disputes SET response_photo_urls = $1 WHERE id = $2', [newUrls, req.params.id]);
        res.json({ success: true, evidenceCount: newUrls.length });
      }
    } catch (err) {
      console.error('Add evidence error:', err);
      res.status(500).json({ error: 'Failed to add evidence' });
    }
  }
);

export default router;
