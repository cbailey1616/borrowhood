import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, requireVerified, ENABLE_PAID_TIERS } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import {
  stripe,
  createPaymentIntent,
  getPaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
  createEphemeralKey,
  refundPayment,
} from '../services/stripe.js';
import { sendNotification } from '../services/notifications.js';
import { PLATFORM_FEE_PERCENT } from '../utils/constants.js';

const router = Router();

// ============================================
// POST /api/transactions
// Request to borrow an item
// ============================================
router.post('/', authenticate,
  body('listingId').isUUID(),
  body('startDate').optional().isISO8601(),
  body('endDate').optional().isISO8601(),
  body('message').optional().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { listingId, startDate, endDate, message } = req.body;

    try {
      // Get listing details with lender's city
      const listing = await query(
        `SELECT l.*, u.stripe_connect_account_id as lender_stripe_id, u.city as lender_city
         FROM listings l
         JOIN users u ON l.owner_id = u.id
         WHERE l.id = $1`,
        [listingId]
      );

      if (listing.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      const item = listing.rows[0];
      const isGiveaway = item.listing_type === 'giveaway';

      // Giveaways don't need dates
      if (!isGiveaway && (!startDate || !endDate)) {
        return res.status(400).json({ error: 'Start and end dates are required for borrow requests' });
      }

      const isPaidRental = !isGiveaway && parseFloat(item.price_per_day) > 0;

      // Verification always required for town-level borrowing
      if (isPaidRental || item.visibility === 'town') {
        const borrowerInfo = await query(
          'SELECT is_verified, city, subscription_tier, verification_grace_until FROM users WHERE id = $1',
          [req.user.id]
        );
        const borrower = borrowerInfo.rows[0];
        const tier = borrower?.subscription_tier || 'free';

        // Verification required for paid rentals and town-level items
        const borrowerGraceActive = borrower?.verification_grace_until && new Date(borrower.verification_grace_until) > new Date();
        const borrowerVerified = borrower?.is_verified || borrowerGraceActive;

        // Tier enforcement only when paid tiers enabled
        if (ENABLE_PAID_TIERS) {
          const borrowerPlusOrVerified = tier === 'plus' || borrowerVerified;
          if (!borrowerPlusOrVerified) {
            return res.status(403).json({
              error: isPaidRental
                ? 'Plus subscription required for paid rentals'
                : 'Plus subscription required to borrow from town listings',
              code: 'PLUS_REQUIRED',
              requiredTier: 'plus',
            });
          }
        }

        if (!borrowerVerified) {
          return res.status(403).json({
            error: isPaidRental
              ? 'Identity verification required for paid rentals'
              : 'Identity verification required to borrow from town listings',
            code: 'VERIFICATION_REQUIRED',
          });
        }

        // City matching for town-level listings
        if (item.visibility === 'town') {
          if (!borrower.city || !item.lender_city || borrower.city.toLowerCase() !== item.lender_city.toLowerCase()) {
            return res.status(403).json({
              error: 'This item is only available to verified users in the same town',
              code: 'TOWN_MISMATCH',
            });
          }
        }
      }

      // Neighborhood listings require the borrower to be in the same city
      if (item.visibility === 'neighborhood') {
        const borrowerCity = await query('SELECT city FROM users WHERE id = $1', [req.user.id]);
        const bCity = borrowerCity.rows[0]?.city;
        if (!bCity || !item.lender_city || bCity.toLowerCase() !== item.lender_city.toLowerCase()) {
          return res.status(403).json({
            error: 'This item is only available to neighbors',
            code: 'NEIGHBORHOOD_MISMATCH',
          });
        }
      }

      // Close friends listings require an accepted friendship
      if (item.visibility === 'close_friends') {
        const friendship = await query(
          `SELECT 1 FROM friendships
           WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
           AND status = 'accepted'`,
          [req.user.id, item.owner_id]
        );
        if (friendship.rows.length === 0) {
          return res.status(403).json({
            error: 'This item is only available to close friends',
            code: 'FRIENDSHIP_REQUIRED',
          });
        }
      }

      if (item.owner_id === req.user.id) {
        return res.status(400).json({ error: 'Cannot borrow your own item' });
      }

      if (!item.is_available) {
        return res.status(400).json({ error: 'Item not available' });
      }

      // Atomically mark item unavailable to prevent race conditions
      // Giveaways stay available until the lender approves a claim
      if (!isGiveaway) {
        const lockResult = await query(
          `UPDATE listings SET is_available = false WHERE id = $1 AND is_available = true RETURNING id`,
          [item.id]
        );
        if (lockResult.rows.length === 0) {
          return res.status(400).json({ error: 'Item was just borrowed by someone else' });
        }
      }

      // Giveaways: no dates, no pricing
      let rentalDays = 0;
      let dailyRate = 0;
      let rentalFee = 0;
      let depositAmount = 0;
      let platformFee = 0;
      let lenderPayout = 0;
      let totalChargeCents = 0;

      if (!isGiveaway) {
        // Calculate rental days
        const start = new Date(startDate);
        const end = new Date(endDate);
        rentalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

        if (rentalDays < item.min_duration || rentalDays > item.max_duration) {
          return res.status(400).json({
            error: `Duration must be between ${item.min_duration} and ${item.max_duration} days`
          });
        }

        // Calculate pricing
        dailyRate = parseFloat(item.price_per_day) || 0;
        rentalFee = dailyRate * rentalDays;
        depositAmount = parseFloat(item.deposit_amount) || 0;
        platformFee = rentalFee * PLATFORM_FEE_PERCENT;
        lenderPayout = rentalFee - platformFee;

        // Calculate total charge in cents
        totalChargeCents = Math.round((rentalFee + depositAmount) * 100);
      }

      // Create transaction
      const result = await query(
        `INSERT INTO borrow_transactions (
          listing_id, borrower_id, lender_id,
          requested_start_date, requested_end_date,
          rental_days, daily_rate, rental_fee, deposit_amount,
          platform_fee, lender_payout, borrower_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          listingId, req.user.id, item.owner_id,
          isGiveaway ? null : startDate, isGiveaway ? null : endDate,
          rentalDays, dailyRate, rentalFee, depositAmount,
          platformFee, lenderPayout, message
        ]
      );

      const transactionId = result.rows[0].id;

      // Free rental / giveaway (no fee + no deposit, or below Stripe minimum) — no payment needed
      if (totalChargeCents < 50) {
        // Notify owner immediately — no payment step to wait for
        await sendNotification(item.owner_id, isGiveaway ? 'giveaway_claim' : 'borrow_request', {
          borrowerName: req.user.display_name || req.user.first_name,
          itemTitle: item.title,
          transactionId,
          listingId,
          fromUserId: req.user.id,
        });
        return res.status(201).json({ id: transactionId, freeRental: true, isGiveaway });
      }

      // Paid rental — don't notify lender yet, wait until payment is confirmed via webhook

      // Paid rental — create PaymentIntent upfront with manual capture (authorization hold)
      const borrowerInfo = await query(
        'SELECT stripe_customer_id, email FROM users WHERE id = $1',
        [req.user.id]
      );

      let customerId = borrowerInfo.rows[0]?.stripe_customer_id;

      // Create Stripe customer if needed
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: borrowerInfo.rows[0].email,
          metadata: { userId: req.user.id },
        });
        customerId = customer.id;
        await query(
          'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
          [customerId, req.user.id]
        );
      }

      let paymentIntent;
      try {
        paymentIntent = await createPaymentIntent({
          amount: totalChargeCents,
          customerId,
          metadata: { transaction_id: transactionId },
        });
      } catch (stripeErr) {
        // Release item lock and delete orphaned transaction
        await query('UPDATE listings SET is_available = true WHERE id = $1', [listingId]);
        await query('DELETE FROM borrow_transactions WHERE id = $1', [transactionId]);
        console.error('Stripe PaymentIntent creation failed:', stripeErr);
        return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
      }

      // Store PI on the transaction
      await query(
        'UPDATE borrow_transactions SET stripe_payment_intent_id = $1 WHERE id = $2',
        [paymentIntent.id, transactionId]
      );

      let ephemeralKey;
      try {
        ephemeralKey = await createEphemeralKey(customerId, '2024-06-20');
      } catch (keyErr) {
        await query('UPDATE listings SET is_available = true WHERE id = $1', [listingId]);
        await query('DELETE FROM borrow_transactions WHERE id = $1', [transactionId]);
        console.error('Ephemeral key creation failed:', keyErr);
        return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
      }

      res.status(201).json({
        id: transactionId,
        clientSecret: paymentIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customerId,
      });
    } catch (err) {
      console.error('Create transaction error:', err);
      // Release item lock on any unhandled error
      if (req.body.listingId) {
        await query('UPDATE listings SET is_available = true WHERE id = $1', [req.body.listingId]).catch(() => {});
      }
      res.status(500).json({ error: 'Failed to create borrow request' });
    }
  }
);

// ============================================
// GET /api/transactions
// Get user's transactions
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { role, status } = req.query; // role: 'borrower' or 'lender'

  try {
    let whereClause = '';
    const params = [req.user.id];

    if (role === 'borrower') {
      whereClause = 't.borrower_id = $1';
    } else if (role === 'lender') {
      whereClause = 't.lender_id = $1';
    } else {
      whereClause = '(t.borrower_id = $1 OR t.lender_id = $1)';
    }

    if (status && status !== 'all') {
      params.push(status);
      whereClause += ` AND t.status = $${params.length}`;
    }

    const result = await query(
      `SELECT t.*,
              l.title as listing_title, l.listing_type,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url,
              COALESCE(b.display_name, b.first_name) as borrower_first_name,
              CASE WHEN b.display_name IS NOT NULL THEN '' ELSE b.last_name END as borrower_last_name,
              b.profile_photo_url as borrower_photo,
              COALESCE(lnd.display_name, lnd.first_name) as lender_first_name,
              CASE WHEN lnd.display_name IS NOT NULL THEN '' ELSE lnd.last_name END as lender_last_name,
              lnd.profile_photo_url as lender_photo
       FROM borrow_transactions t
       JOIN listings l ON t.listing_id = l.id
       JOIN users b ON t.borrower_id = b.id
       JOIN users lnd ON t.lender_id = lnd.id
       WHERE ${whereClause}
       ORDER BY t.created_at DESC`,
      params
    );

    res.json(result.rows.map(t => ({
      id: t.id,
      status: t.status,
      listingType: t.listing_type || 'lend',
      listing: {
        id: t.listing_id,
        title: t.listing_title,
        photoUrl: t.photo_url,
      },
      borrower: {
        id: t.borrower_id,
        firstName: t.borrower_first_name,
        lastName: t.borrower_last_name,
        profilePhotoUrl: t.borrower_photo,
      },
      lender: {
        id: t.lender_id,
        firstName: t.lender_first_name,
        lastName: t.lender_last_name,
        profilePhotoUrl: t.lender_photo,
      },
      startDate: t.requested_start_date,
      endDate: t.requested_end_date,
      rentalDays: t.rental_days,
      rentalFee: parseFloat(t.rental_fee),
      depositAmount: parseFloat(t.deposit_amount),
      isBorrower: t.borrower_id === req.user.id,
      createdAt: t.created_at,
    })));
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// ============================================
// GET /api/transactions/:id
// Get transaction details
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*,
              l.title as listing_title, l.description as listing_description,
              l.condition as listing_condition, l.listing_type,
              (SELECT array_agg(url ORDER BY sort_order) FROM listing_photos WHERE listing_id = l.id) as photos,
              (SELECT EXISTS(SELECT 1 FROM disputes WHERE transaction_id = t.id)) as has_dispute,
              (SELECT id FROM disputes WHERE transaction_id = t.id ORDER BY created_at DESC LIMIT 1) as dispute_id,
              (SELECT status FROM disputes WHERE transaction_id = t.id ORDER BY created_at DESC LIMIT 1) as dispute_status,
              COALESCE(b.display_name, b.first_name) as borrower_first_name,
              CASE WHEN b.display_name IS NOT NULL THEN '' ELSE b.last_name END as borrower_last_name,
              b.profile_photo_url as borrower_photo, b.rating as borrower_rating, b.rating_count as borrower_rating_count,
              COALESCE(lnd.display_name, lnd.first_name) as lender_first_name,
              CASE WHEN lnd.display_name IS NOT NULL THEN '' ELSE lnd.last_name END as lender_last_name,
              lnd.profile_photo_url as lender_photo
       FROM borrow_transactions t
       JOIN listings l ON t.listing_id = l.id
       JOIN users b ON t.borrower_id = b.id
       JOIN users lnd ON t.lender_id = lnd.id
       WHERE t.id = $1 AND (t.borrower_id = $2 OR t.lender_id = $2)`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const t = result.rows[0];

    // Fetch current user's rating for this transaction
    const myRatingResult = await query(
      'SELECT rating, comment FROM ratings WHERE transaction_id = $1 AND rater_id = $2',
      [req.params.id, req.user.id]
    );
    const myRatingRow = myRatingResult.rows[0] || null;

    res.json({
      id: t.id,
      status: t.status,
      listingType: t.listing_type || 'lend',
      listing: {
        id: t.listing_id,
        title: t.listing_title,
        description: t.listing_description,
        condition: t.listing_condition,
        photos: t.photos || [],
      },
      borrower: {
        id: t.borrower_id,
        firstName: t.borrower_first_name,
        lastName: t.borrower_last_name,
        profilePhotoUrl: t.borrower_photo,
        rating: parseFloat(t.borrower_rating) || 0,
        ratingCount: t.borrower_rating_count,
      },
      lender: {
        id: t.lender_id,
        firstName: t.lender_first_name,
        lastName: t.lender_last_name,
        profilePhotoUrl: t.lender_photo,
      },
      startDate: t.requested_start_date,
      endDate: t.requested_end_date,
      actualPickupAt: t.actual_pickup_at,
      actualReturnAt: t.actual_return_at,
      rentalDays: t.rental_days,
      dailyRate: parseFloat(t.daily_rate),
      rentalFee: parseFloat(t.rental_fee),
      depositAmount: parseFloat(t.deposit_amount),
      platformFee: parseFloat(t.platform_fee),
      lenderPayout: parseFloat(t.lender_payout),
      conditionAtPickup: t.condition_at_pickup,
      conditionAtReturn: t.condition_at_return,
      conditionNotes: t.condition_notes,
      borrowerMessage: t.borrower_message,
      lenderResponse: t.lender_response,
      paymentStatus: t.payment_status || null,
      isBorrower: t.borrower_id === req.user.id,
      isLender: t.lender_id === req.user.id,
      myRating: myRatingRow ? { rating: myRatingRow.rating, comment: myRatingRow.comment } : null,
      hasDispute: t.has_dispute || false,
      disputeId: t.dispute_id || null,
      disputeStatus: t.dispute_status || null,
      createdAt: t.created_at,
    });
  } catch (err) {
    console.error('Get transaction error:', err);
    res.status(500).json({ error: 'Failed to get transaction' });
  }
});

// ============================================
// POST /api/transactions/:id/approve
// Lender approves borrow request — captures the borrower's existing payment hold
// ============================================
router.post('/:id/approve', authenticate,
  body('response').optional().isLength({ max: 500 }),
  async (req, res) => {
    const { response } = req.body;

    try {
      const txn = await query(
        `SELECT * FROM borrow_transactions
         WHERE id = $1 AND lender_id = $2 AND status = 'pending'`,
        [req.params.id, req.user.id]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found or not pending' });
      }

      const t = txn.rows[0];

      // Free rental — no payment to capture
      if (!t.stripe_payment_intent_id) {
        await query(
          `UPDATE borrow_transactions
           SET status = 'paid', lender_response = $1, payment_status = 'none'
           WHERE id = $2`,
          [response, req.params.id]
        );

        await query(
          'UPDATE listings SET is_available = false WHERE id = $1',
          [t.listing_id]
        );

        await sendNotification(t.borrower_id, 'request_approved', {
          transactionId: t.id,
          listingId: t.listing_id,
        });

        return res.json({ success: true, freeRental: true });
      }

      // Paid rental — verify payment was authorized before capturing
      const pi = await getPaymentIntent(t.stripe_payment_intent_id);
      if (pi.status !== 'requires_capture') {
        return res.status(400).json({
          error: 'The borrower hasn\'t completed their payment yet. They need to finish checkout before you can approve.',
        });
      }

      // Stripe authorization holds expire after 7 days — warn before it's too late
      const piAgeDays = (Date.now() - pi.created * 1000) / (1000 * 60 * 60 * 24);
      if (piAgeDays > 6) {
        return res.status(400).json({
          error: 'This request has nearly expired. The borrower must resubmit their payment.',
          code: 'AUTHORIZATION_EXPIRING',
        });
      }

      try {
        await capturePaymentIntent(t.stripe_payment_intent_id);
      } catch (captureErr) {
        console.error('Payment capture failed:', captureErr.message);
        await query('UPDATE listings SET is_available = true WHERE id = $1', [t.listing_id]);
        return res.status(500).json({
          error: 'Payment capture failed. The authorization may have expired. Please ask the borrower to resubmit.',
        });
      }

      await query(
        `UPDATE borrow_transactions
         SET status = 'paid', lender_response = $1, payment_status = 'captured'
         WHERE id = $2`,
        [response, req.params.id]
      );

      await query(
        'UPDATE listings SET is_available = false WHERE id = $1',
        [t.listing_id]
      );

      await sendNotification(t.borrower_id, 'request_approved', {
        transactionId: t.id,
        listingId: t.listing_id,
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Approve transaction error:', err);
      res.status(500).json({ error: `Failed to approve request: ${err.message}` });
    }
  }
);

// ============================================
// POST /api/transactions/:id/decline
// Lender declines borrow request — cancels payment hold
// ============================================
router.post('/:id/decline', authenticate,
  body('reason').optional().isLength({ max: 500 }),
  async (req, res) => {
    const { reason } = req.body;

    try {
      const result = await query(
        `UPDATE borrow_transactions
         SET status = 'cancelled', lender_response = $1, payment_status = 'cancelled'
         WHERE id = $2 AND lender_id = $3 AND status = 'pending'
         RETURNING borrower_id, listing_id, stripe_payment_intent_id`,
        [reason, req.params.id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found or not pending' });
      }

      const t = result.rows[0];

      // Cancel PaymentIntent if one exists — releases the hold immediately
      if (t.stripe_payment_intent_id) {
        try {
          await cancelPaymentIntent(t.stripe_payment_intent_id);
        } catch (e) {
          console.error('Could not cancel PI on decline:', e.message);
        }
      }

      // Re-enable the listing so it can be requested again
      await query('UPDATE listings SET is_available = true WHERE id = $1', [t.listing_id]);

      await sendNotification(t.borrower_id, 'request_declined', {
        transactionId: req.params.id,
        listingId: t.listing_id,
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Decline transaction error:', err);
      res.status(500).json({ error: 'Failed to decline request' });
    }
  }
);

// ============================================
// POST /api/transactions/:id/confirm-payment
// Borrower confirms PaymentSheet completed — verifies authorization hold
// Called after borrower submits request and completes payment upfront
// ============================================
router.post('/:id/confirm-payment', authenticate, async (req, res) => {
  try {
    const txn = await query(
      `SELECT * FROM borrow_transactions
       WHERE id = $1 AND borrower_id = $2 AND status = 'pending'`,
      [req.params.id, req.user.id]
    );

    if (txn.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or not pending' });
    }

    const t = txn.rows[0];

    if (!t.stripe_payment_intent_id) {
      return res.json({ success: true }); // Free rental, no payment needed
    }

    // Verify the PaymentIntent has an authorization hold
    const pi = await getPaymentIntent(t.stripe_payment_intent_id);

    if (pi.status === 'requires_capture') {
      // Hold is in place — mark payment as authorized, keep status pending for lender review
      await query(
        `UPDATE borrow_transactions SET payment_status = 'authorized' WHERE id = $1`,
        [req.params.id]
      );

      // Now that payment is authorized, notify the lender of the borrow request
      const listing = await query(
        'SELECT title FROM listings WHERE id = $1',
        [t.listing_id]
      );
      const borrower = await query(
        'SELECT first_name, display_name FROM users WHERE id = $1',
        [t.borrower_id]
      );
      await sendNotification(t.lender_id, 'borrow_request', {
        borrowerName: borrower.rows[0]?.display_name || borrower.rows[0]?.first_name,
        itemTitle: listing.rows[0]?.title,
        transactionId: t.id,
        listingId: t.listing_id,
        fromUserId: t.borrower_id,
      });

      return res.json({ success: true });
    }

    if (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation') {
      return res.json({
        requiresPayment: true,
        clientSecret: pi.client_secret,
      });
    }

    // PI already captured or in another terminal state
    await query(
      `UPDATE borrow_transactions SET payment_status = $1 WHERE id = $2`,
      [pi.status, req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Confirm payment error:', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// ============================================
// POST /api/transactions/:id/cancel
// Borrower cancels request — immediate refund
// ============================================
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const txn = await query(
      `SELECT * FROM borrow_transactions
       WHERE id = $1 AND (borrower_id = $2 OR lender_id = $2) AND status IN ('pending', 'approved', 'paid')`,
      [req.params.id, req.user.id]
    );

    if (txn.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or cannot be cancelled' });
    }

    const t = txn.rows[0];

    if (t.stripe_payment_intent_id) {
      const pi = await getPaymentIntent(t.stripe_payment_intent_id);

      if (pi.status === 'requires_capture') {
        // Hold not yet captured — just cancel it (releases hold instantly)
        await cancelPaymentIntent(t.stripe_payment_intent_id);
      } else if (pi.status === 'succeeded') {
        // Payment was captured (lender approved) — issue full refund
        await refundPayment(t.stripe_payment_intent_id);
      }
    }

    await query(
      `UPDATE borrow_transactions
       SET status = 'cancelled', payment_status = 'refunded'
       WHERE id = $1`,
      [req.params.id]
    );

    // Make listing available again if it was marked unavailable
    await query(
      'UPDATE listings SET is_available = true WHERE id = $1',
      [t.listing_id]
    );

    // Notify lender
    await sendNotification(t.lender_id, 'request_declined', {
      transactionId: t.id,
      listingId: t.listing_id,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Cancel transaction error:', err);
    res.status(500).json({ error: `Failed to cancel request: ${err.message}` });
  }
});

// ============================================
// POST /api/transactions/:id/pickup
// Confirm pickup (both parties must confirm)
// ============================================
router.post('/:id/pickup', authenticate,
  body('condition').optional().isIn(['like_new', 'good', 'fair', 'worn']),
  async (req, res) => {
    const { condition } = req.body;

    try {
      const txn = await query(
        `SELECT bt.*, l.title as item_title
         FROM borrow_transactions bt
         JOIN listings l ON bt.listing_id = l.id
         WHERE bt.id = $1 AND bt.status IN ('paid', 'approved')`,
        [req.params.id]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found or not ready for pickup' });
      }

      const t = txn.rows[0];
      const isBorrower = t.borrower_id === req.user.id;
      const isLender = t.lender_id === req.user.id;

      if (!isBorrower && !isLender) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Check if this is a giveaway
      const listingCheck = await query(
        'SELECT listing_type FROM listings WHERE id = $1',
        [t.listing_id]
      );
      const isGiveaway = listingCheck.rows[0]?.listing_type === 'giveaway';

      // Payment is already captured at approve time — no capture needed at pickup
      if (isLender) {
        if (isGiveaway) {
          // Giveaway: pickup = complete. No return step needed.
          await query(
            `UPDATE borrow_transactions
             SET status = 'returned', actual_pickup_at = NOW(), actual_return_at = NOW(), condition_at_pickup = $1
             WHERE id = $2`,
            [condition || t.condition_at_pickup, req.params.id]
          );

          // Permanently delist the item (given away)
          await query(
            `UPDATE listings SET status = 'given_away', is_available = false WHERE id = $1`,
            [t.listing_id]
          );

          await sendNotification(t.borrower_id, 'giveaway_complete', {
            itemTitle: t.item_title,
            transactionId: t.id,
          });
        } else {
          await query(
            `UPDATE borrow_transactions
             SET status = 'picked_up', actual_pickup_at = NOW(), condition_at_pickup = $1
             WHERE id = $2`,
            [condition || t.condition_at_pickup, req.params.id]
          );

          await sendNotification(t.borrower_id, 'pickup_confirmed', {
            itemTitle: t.item_title,
            returnDate: t.requested_end_date,
            transactionId: t.id,
          });
        }
      }

      res.json({ success: true, isGiveaway });
    } catch (err) {
      console.error('Confirm pickup error:', err);
      res.status(500).json({ error: 'Failed to confirm pickup' });
    }
  }
);

// ============================================
// POST /api/transactions/:id/rate
// Rate the other party
// ============================================
router.post('/:id/rate', authenticate,
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { rating, comment } = req.body;

    try {
      const txn = await query(
        'SELECT * FROM borrow_transactions WHERE id = $1',
        [req.params.id]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const t = txn.rows[0];

      if (!['returned', 'completed'].includes(t.status)) {
        return res.status(400).json({ error: 'Cannot rate until transaction is complete' });
      }

      const isBorrower = t.borrower_id === req.user.id;
      const isLender = t.lender_id === req.user.id;

      if (!isBorrower && !isLender) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const rateeId = isBorrower ? t.lender_id : t.borrower_id;
      const isLenderRating = isBorrower; // Borrower rates the lender

      await query(
        `INSERT INTO ratings (transaction_id, rater_id, ratee_id, rating, comment, is_lender_rating)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (transaction_id, rater_id) DO UPDATE
         SET rating = $4, comment = $5`,
        [t.id, req.user.id, rateeId, rating, comment, isLenderRating]
      );

      // Check if both parties have rated
      const ratings = await query(
        'SELECT COUNT(*) FROM ratings WHERE transaction_id = $1',
        [t.id]
      );

      if (parseInt(ratings.rows[0].count) >= 2) {
        await query(
          'UPDATE borrow_transactions SET status = $1 WHERE id = $2',
          ['completed', t.id]
        );
      }

      await sendNotification(rateeId, 'rating_received', {
        transactionId: t.id,
        rating,
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Rate transaction error:', err);
      res.status(500).json({ error: 'Failed to submit rating' });
    }
  }
);

export default router;
