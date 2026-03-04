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

      // Verify within 7-day window (use actual_return_at or requested_end_date)
      const returnDate = t.actual_return_at || t.requested_end_date;
      if (returnDate) {
        const hoursSinceReturn = (Date.now() - new Date(returnDate).getTime()) / (1000 * 60 * 60);
        if (hoursSinceReturn > 168) {
          return res.status(400).json({ error: 'Disputes must be filed within 7 days of rental end' });
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

      // Cap requestedAmount at full transaction amount (rental fee + deposit)
      const depositAmount = parseFloat(t.deposit_amount) || 0;
      const rentalFee = parseFloat(t.rental_fee) || 0;
      const maxAmount = rentalFee + depositAmount;
      const cappedAmount = requestedAmount ? Math.min(requestedAmount, maxAmount) : null;

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
  body('counterAmount').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { responseDescription, responsePhotoUrls = [], counterAmount } = req.body;

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

      const hasCounter = counterAmount != null && counterAmount >= 0;
      const newStatus = hasCounter ? 'counterPending' : 'underReview';

      await query(
        `UPDATE disputes SET
          response_description = $1, response_photo_urls = $2,
          counter_amount = $3,
          responded_at = NOW(), status = $4
         WHERE id = $5`,
        [responseDescription, responsePhotoUrls, counterAmount ?? null, newStatus, req.params.id]
      );

      // Notify claimant
      await sendNotification(d.claimant_user_id, hasCounter ? 'dispute_counter_received' : 'dispute_response_received', {
        disputeId: req.params.id,
        transactionId: d.transaction_id,
        respondentName: `${req.user.first_name} ${req.user.last_name}`,
        ...(hasCounter ? { counterAmount } : {}),
      });

      // Only notify organizers for declines (no counter) — counter goes to claimant first
      if (!hasCounter && d.community_id) {
        await notifyOrganizers(d.community_id, 'dispute_ready_for_review', {
          disputeId: req.params.id,
          transactionId: d.transaction_id,
          itemTitle: d.listing_title,
        });
      }

      res.json({ success: true, status: newStatus });
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
              d.response_description, d.response_photo_urls, d.responded_at, d.counter_amount,
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
        counterAmount: d.counter_amount ? parseFloat(d.counter_amount) : null,
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
// Shared resolution helper
// ============================================
async function resolveDisputeInternally({ dispute, outcome, resolvedAmount, notes, resolvedById }) {
  const depositAmount = parseFloat(dispute.deposit_amount);
  const rentalFee = parseFloat(dispute.rental_fee) || 0;
  const totalAmount = rentalFee + depositAmount;
  let finalResolvedAmount = 0;
  let status = '';
  let holdExpired = false;

  if (outcome === 'claimant') {
    const maxAmount = Math.min(
      resolvedAmount || totalAmount,
      dispute.requested_amount ? parseFloat(dispute.requested_amount) : totalAmount,
      totalAmount
    );
    finalResolvedAmount = maxAmount;
    status = 'resolvedInFavorOfClaimant';

    if (dispute.stripe_payment_intent_id && dispute.payment_status === 'authorized') {
      try {
        const amountCents = Math.round(finalResolvedAmount * 100);
        await capturePaymentIntent(dispute.stripe_payment_intent_id, amountCents);
      } catch (stripeErr) {
        holdExpired = true;
        status = 'expired';
        console.error('Stripe capture failed (hold likely expired):', stripeErr.message);
      }
    }
  } else {
    status = outcome === 'respondent' ? 'resolvedInFavorOfRespondent' : 'dismissed';
    finalResolvedAmount = 0;

    if (dispute.stripe_payment_intent_id && dispute.payment_status === 'authorized') {
      try {
        const pi = await getPaymentIntent(dispute.stripe_payment_intent_id);
        if (pi.status === 'requires_capture') {
          await cancelPaymentIntent(dispute.stripe_payment_intent_id);
        }
      } catch (stripeErr) {
        console.error('Stripe release error (may be already expired):', stripeErr.message);
      }
    }
  }

  const organizerFee = finalResolvedAmount * ORGANIZER_FEE_PERCENT;

  // Determine deposit direction based on winner's role
  const claimantIsBorrower = dispute.claimant_user_id === dispute.borrower_id;
  let depositToLender = 0;
  let depositToBorrower = 0;

  if (outcome === 'claimant') {
    if (claimantIsBorrower) {
      depositToBorrower = finalResolvedAmount;
    } else {
      depositToLender = finalResolvedAmount;
    }
  } else if (outcome === 'respondent') {
    // Deposit returns to borrower (they posted it)
    depositToBorrower = depositAmount;
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE disputes SET
        status = $1, resolved_by_id = $2, resolution_notes = $3,
        resolved_amount = $4, hold_expired = $5,
        deposit_to_lender = $6, deposit_to_borrower = $7, organizer_fee = $8,
        resolved_at = NOW()
       WHERE id = $9`,
      [
        status, resolvedById, notes, finalResolvedAmount, holdExpired,
        depositToLender,
        depositToBorrower,
        organizerFee,
        dispute.id,
      ]
    );

    await client.query(
      `UPDATE borrow_transactions SET status = 'completed' WHERE id = $1`,
      [dispute.transaction_id]
    );

    await client.query(
      `UPDATE listings SET is_available = true
       FROM borrow_transactions t
       WHERE listings.id = t.listing_id AND t.id = $1`,
      [dispute.transaction_id]
    );
  });

  // Notify both parties
  await sendNotification(dispute.claimant_user_id, 'dispute_resolved', {
    disputeId: dispute.id,
    transactionId: dispute.transaction_id,
    outcome,
    resolvedAmount: finalResolvedAmount,
  });

  await sendNotification(dispute.respondent_user_id, 'dispute_resolved', {
    disputeId: dispute.id,
    transactionId: dispute.transaction_id,
    outcome,
    resolvedAmount: finalResolvedAmount,
  });

  return { status, finalResolvedAmount, holdExpired, organizerFee };
}

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
      const dispute = await query(
        `SELECT d.*, t.deposit_amount, t.rental_fee, t.lender_id, t.borrower_id,
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

      const result = await resolveDisputeInternally({
        dispute: d,
        outcome,
        resolvedAmount,
        notes,
        resolvedById: req.user.id,
      });

      res.json({
        success: true,
        resolution: {
          status: result.status,
          resolvedAmount: result.finalResolvedAmount,
          holdExpired: result.holdExpired,
          organizerFee: result.organizerFee,
        },
      });
    } catch (err) {
      console.error('Resolve dispute error:', err);
      res.status(500).json({ error: 'Failed to resolve dispute' });
    }
  }
);

// ============================================
// POST /api/disputes/:id/accept
// Respondent accepts the claim — resolves automatically
// ============================================
router.post('/:id/accept', authenticate, async (req, res) => {
  try {
    const dispute = await query(
      `SELECT d.*, t.deposit_amount, t.rental_fee, t.lender_id, t.borrower_id,
              t.stripe_payment_intent_id, t.payment_status,
              l.community_id
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

    // Only respondent can accept
    if (d.respondent_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the respondent can accept a claim' });
    }

    // Must be awaitingResponse
    if (d.status !== 'awaitingResponse') {
      return res.status(400).json({ error: 'This dispute can no longer be accepted' });
    }

    // Cannot have already responded
    if (d.responded_at) {
      return res.status(400).json({ error: 'You have already responded to this dispute' });
    }

    // 48-hour window check
    const hoursSinceFiled = (Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceFiled > 48) {
      return res.status(400).json({ error: 'The 48-hour response window has passed' });
    }

    // Full refund: rental fee + deposit
    const resolvedAmount = (parseFloat(d.rental_fee) || 0) + parseFloat(d.deposit_amount);

    const result = await resolveDisputeInternally({
      dispute: d,
      outcome: 'claimant',
      resolvedAmount,
      notes: 'Full refund accepted by respondent — resolved automatically.',
      resolvedById: null,
    });

    res.json({
      success: true,
      resolution: {
        status: result.status,
        resolvedAmount: result.finalResolvedAmount,
        holdExpired: result.holdExpired,
        organizerFee: result.organizerFee,
      },
    });
  } catch (err) {
    console.error('Accept dispute error:', err);
    res.status(500).json({ error: 'Failed to accept dispute' });
  }
});

// ============================================
// POST /api/disputes/:id/accept-counter
// Claimant accepts the respondent's counter offer — resolves automatically
// ============================================
router.post('/:id/accept-counter', authenticate, async (req, res) => {
  try {
    const dispute = await query(
      `SELECT d.*, t.deposit_amount, t.rental_fee, t.lender_id, t.borrower_id,
              t.stripe_payment_intent_id, t.payment_status,
              l.community_id
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

    // Only claimant can accept a counter
    if (d.claimant_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the claimant can accept a counter offer' });
    }

    // Must be counterPending
    if (d.status !== 'counterPending') {
      return res.status(400).json({ error: 'This dispute is not in a state to accept a counter offer' });
    }

    // Must have a counter amount
    if (d.counter_amount == null) {
      return res.status(400).json({ error: 'No counter offer exists for this dispute' });
    }

    const counterAmount = parseFloat(d.counter_amount);

    const result = await resolveDisputeInternally({
      dispute: d,
      outcome: 'claimant',
      resolvedAmount: counterAmount,
      notes: `Counter offer of $${counterAmount.toFixed(2)} accepted by claimant — resolved automatically.`,
      resolvedById: null,
    });

    res.json({
      success: true,
      resolution: {
        status: result.status,
        resolvedAmount: result.finalResolvedAmount,
        holdExpired: result.holdExpired,
        organizerFee: result.organizerFee,
      },
    });
  } catch (err) {
    console.error('Accept counter error:', err);
    res.status(500).json({ error: 'Failed to accept counter offer' });
  }
});

// ============================================
// POST /api/disputes/:id/decline-counter
// Claimant declines counter — escalates to organizer review
// ============================================
router.post('/:id/decline-counter', authenticate, async (req, res) => {
  try {
    const dispute = await query(
      `SELECT d.*, l.community_id
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

    if (d.claimant_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the claimant can decline a counter offer' });
    }

    if (d.status !== 'counterPending') {
      return res.status(400).json({ error: 'This dispute is not in a state to decline a counter offer' });
    }

    await query(
      `UPDATE disputes SET status = 'underReview' WHERE id = $1`,
      [req.params.id]
    );

    // Now notify organizers for arbitration
    if (d.community_id) {
      await notifyOrganizers(d.community_id, 'dispute_ready_for_review', {
        disputeId: req.params.id,
        transactionId: d.transaction_id,
        itemTitle: d.listing_title,
      });
    }

    res.json({ success: true, status: 'underReview' });
  } catch (err) {
    console.error('Decline counter error:', err);
    res.status(500).json({ error: 'Failed to decline counter offer' });
  }
});

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
