import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { authenticate, requireVerified } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import {
  createPaymentIntent,
  getPaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
  createTransfer,
  refundPayment,
} from '../services/stripe.js';
import { sendNotification } from '../services/notifications.js';

const router = Router();

const PLATFORM_FEE_PERCENT = 0.02; // 2%

// ============================================
// POST /api/transactions
// Request to borrow an item
// ============================================
router.post('/', authenticate,
  body('listingId').isUUID(),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
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

      const isPaidRental = parseFloat(item.price_per_day) > 0;

      // Paid rentals require Plus subscription for both renter and owner
      if (isPaidRental || item.visibility === 'town') {
        const borrowerInfo = await query(
          'SELECT is_verified, city, subscription_tier, verification_grace_until FROM users WHERE id = $1',
          [req.user.id]
        );
        const borrower = borrowerInfo.rows[0];
        const tier = borrower?.subscription_tier || 'free';

        // Plus required for paid rentals (any visibility) and town-level items
        if (tier !== 'plus') {
          return res.status(403).json({
            error: isPaidRental
              ? 'Plus subscription required for paid rentals'
              : 'Plus subscription required to borrow from town listings',
            code: 'PLUS_REQUIRED',
            requiredTier: 'plus',
          });
        }

        // Verification required for paid rentals and town-level items
        const borrowerGraceActive = borrower?.verification_grace_until && new Date(borrower.verification_grace_until) > new Date();
        if (!borrower?.is_verified && !borrowerGraceActive) {
          return res.status(403).json({
            error: isPaidRental
              ? 'Identity verification required for paid rentals'
              : 'Identity verification required to borrow from town listings',
            code: 'VERIFICATION_REQUIRED',
          });
        }

        // City matching for town-level listings
        if (item.visibility === 'town') {
          if (!borrower.city || !item.lender_city || borrower.city !== item.lender_city) {
            return res.status(403).json({
              error: 'This item is only available to verified users in the same town',
              code: 'TOWN_MISMATCH',
            });
          }
        }
      }

      if (item.owner_id === req.user.id) {
        return res.status(400).json({ error: 'Cannot borrow your own item' });
      }

      if (!item.is_available) {
        return res.status(400).json({ error: 'Item not available' });
      }

      // Calculate rental days
      const start = new Date(startDate);
      const end = new Date(endDate);
      const rentalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

      if (rentalDays < item.min_duration || rentalDays > item.max_duration) {
        return res.status(400).json({
          error: `Duration must be between ${item.min_duration} and ${item.max_duration} days`
        });
      }

      // Calculate pricing
      const dailyRate = parseFloat(item.price_per_day) || 0;
      const rentalFee = dailyRate * rentalDays;
      const depositAmount = parseFloat(item.deposit_amount) || 0;
      const platformFee = rentalFee * PLATFORM_FEE_PERCENT;
      const lenderPayout = rentalFee - platformFee;

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
          startDate, endDate,
          rentalDays, dailyRate, rentalFee, depositAmount,
          platformFee, lenderPayout, message
        ]
      );

      // Send notification to lender
      await sendNotification(item.owner_id, 'borrow_request', {
        transactionId: result.rows[0].id,
        listingId,
        fromUserId: req.user.id,
      });

      res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
      console.error('Create transaction error:', err);
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
    if (role === 'borrower') {
      whereClause = 't.borrower_id = $1';
    } else if (role === 'lender') {
      whereClause = 't.lender_id = $1';
    } else {
      whereClause = '(t.borrower_id = $1 OR t.lender_id = $1)';
    }

    if (status) {
      whereClause += ` AND t.status = '${status}'`;
    }

    const result = await query(
      `SELECT t.*,
              l.title as listing_title,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url,
              b.first_name as borrower_first_name, b.last_name as borrower_last_name,
              b.profile_photo_url as borrower_photo,
              lnd.first_name as lender_first_name, lnd.last_name as lender_last_name,
              lnd.profile_photo_url as lender_photo
       FROM borrow_transactions t
       JOIN listings l ON t.listing_id = l.id
       JOIN users b ON t.borrower_id = b.id
       JOIN users lnd ON t.lender_id = lnd.id
       WHERE ${whereClause}
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(t => ({
      id: t.id,
      status: t.status,
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
              l.condition as listing_condition,
              (SELECT array_agg(url ORDER BY sort_order) FROM listing_photos WHERE listing_id = l.id) as photos,
              b.first_name as borrower_first_name, b.last_name as borrower_last_name,
              b.profile_photo_url as borrower_photo, b.rating as borrower_rating, b.rating_count as borrower_rating_count,
              lnd.first_name as lender_first_name, lnd.last_name as lender_last_name,
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
      createdAt: t.created_at,
    });
  } catch (err) {
    console.error('Get transaction error:', err);
    res.status(500).json({ error: 'Failed to get transaction' });
  }
});

// ============================================
// POST /api/transactions/:id/approve
// Lender approves borrow request
// ============================================
router.post('/:id/approve', authenticate,
  body('response').optional().isLength({ max: 500 }),
  async (req, res) => {
    const { response } = req.body;

    try {
      const txn = await query(
        `SELECT t.*, u.stripe_customer_id
         FROM borrow_transactions t
         JOIN users u ON t.borrower_id = u.id
         WHERE t.id = $1 AND t.lender_id = $2 AND t.status = 'pending'`,
        [req.params.id, req.user.id]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found or not pending' });
      }

      const t = txn.rows[0];
      const totalCharge = parseFloat(t.rental_fee) + parseFloat(t.deposit_amount);

      // Create payment intent (authorize, don't capture yet)
      const paymentIntent = await createPaymentIntent({
        amount: Math.round(totalCharge * 100), // Stripe uses cents
        customerId: t.stripe_customer_id,
        metadata: { transactionId: t.id },
      });

      await query(
        `UPDATE borrow_transactions
         SET status = 'approved', lender_response = $1, stripe_payment_intent_id = $2
         WHERE id = $3`,
        [response, paymentIntent.id, req.params.id]
      );

      // Notify borrower
      await sendNotification(t.borrower_id, 'request_approved', {
        transactionId: t.id,
        listingId: t.listing_id,
      });

      res.json({
        success: true,
        paymentIntentClientSecret: paymentIntent.client_secret,
      });
    } catch (err) {
      console.error('Approve transaction error:', err);
      res.status(500).json({ error: 'Failed to approve request' });
    }
  }
);

// ============================================
// POST /api/transactions/:id/decline
// Lender declines borrow request
// ============================================
router.post('/:id/decline', authenticate,
  body('reason').optional().isLength({ max: 500 }),
  async (req, res) => {
    const { reason } = req.body;

    try {
      const result = await query(
        `UPDATE borrow_transactions
         SET status = 'cancelled', lender_response = $1
         WHERE id = $2 AND lender_id = $3 AND status = 'pending'
         RETURNING borrower_id, listing_id`,
        [reason, req.params.id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found or not pending' });
      }

      // Notify borrower
      await sendNotification(result.rows[0].borrower_id, 'request_declined', {
        transactionId: req.params.id,
        listingId: result.rows[0].listing_id,
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
// Borrower confirms payment was successful
// ============================================
router.post('/:id/confirm-payment', authenticate, async (req, res) => {
  try {
    const txn = await query(
      `SELECT * FROM borrow_transactions
       WHERE id = $1 AND borrower_id = $2 AND status = 'approved'`,
      [req.params.id, req.user.id]
    );

    if (txn.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const t = txn.rows[0];

    // Check PaymentIntent status if one exists
    if (t.stripe_payment_intent_id) {
      const pi = await getPaymentIntent(t.stripe_payment_intent_id);

      if (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation') {
        return res.json({
          requiresPayment: true,
          clientSecret: pi.client_secret,
        });
      }
    }

    // Payment confirmed or captured — mark as paid
    await query(
      `UPDATE borrow_transactions SET status = 'paid' WHERE id = $1`,
      [req.params.id]
    );

    // Mark listing as unavailable
    await query(
      'UPDATE listings SET is_available = false WHERE id = $1',
      [t.listing_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Confirm payment error:', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
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
        'SELECT * FROM borrow_transactions WHERE id = $1 AND status = $2',
        [req.params.id, 'paid']
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

      // For simplicity, we'll set pickup when lender confirms
      // In a full app, you might track both parties' confirmations
      if (isLender) {
        await query(
          `UPDATE borrow_transactions
           SET status = 'picked_up', actual_pickup_at = NOW(), condition_at_pickup = $1
           WHERE id = $2`,
          [condition || t.condition_at_pickup, req.params.id]
        );

        // Capture payment now that pickup is confirmed
        await capturePaymentIntent(t.stripe_payment_intent_id);

        // Notify borrower
        await sendNotification(t.borrower_id, 'pickup_confirmed', {
          transactionId: t.id,
        });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Confirm pickup error:', err);
      res.status(500).json({ error: 'Failed to confirm pickup' });
    }
  }
);

// ============================================
// POST /api/transactions/:id/return
// Confirm return
// ============================================
router.post('/:id/return', authenticate,
  body('condition').optional().isIn(['like_new', 'good', 'fair', 'worn']),
  body('notes').optional().isLength({ max: 500 }),
  async (req, res) => {
    const { condition, notes } = req.body;

    try {
      const txn = await query(
        'SELECT * FROM borrow_transactions WHERE id = $1',
        [req.params.id]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const t = txn.rows[0];
      const isLender = t.lender_id === req.user.id;

      if (!isLender) {
        return res.status(403).json({ error: 'Only lender can confirm return' });
      }

      if (t.status !== 'picked_up' && t.status !== 'return_pending') {
        return res.status(400).json({ error: 'Item not currently borrowed' });
      }

      // Check if condition is worse than at pickup
      const conditionOrder = ['like_new', 'good', 'fair', 'worn'];
      const pickupIdx = conditionOrder.indexOf(t.condition_at_pickup);
      const returnIdx = conditionOrder.indexOf(condition);

      if (returnIdx > pickupIdx) {
        // Condition is worse - open dispute automatically
        await query(
          `UPDATE borrow_transactions
           SET status = 'disputed', condition_at_return = $1, condition_notes = $2, actual_return_at = NOW()
           WHERE id = $3`,
          [condition, notes, req.params.id]
        );

        // Create dispute
        await query(
          `INSERT INTO disputes (transaction_id, opened_by_id, reason)
           VALUES ($1, $2, $3)`,
          [t.id, req.user.id, `Item returned in worse condition: ${t.condition_at_pickup} → ${condition}. ${notes || ''}`]
        );

        await sendNotification(t.borrower_id, 'dispute_opened', {
          transactionId: t.id,
        });

        res.json({ success: true, disputed: true });
      } else {
        // Good condition - complete transaction
        await withTransaction(async (client) => {
          await client.query(
            `UPDATE borrow_transactions
             SET status = 'returned', condition_at_return = $1, actual_return_at = NOW()
             WHERE id = $2`,
            [condition, req.params.id]
          );

          // Get lender's Stripe Connect account
          const lenderResult = await client.query(
            'SELECT stripe_connect_account_id FROM users WHERE id = $1',
            [t.lender_id]
          );

          const lenderConnectId = lenderResult.rows[0]?.stripe_connect_account_id;

          // Transfer rental fee to lender if they have a Connect account
          if (lenderConnectId) {
            const transfer = await createTransfer({
              amount: Math.round(parseFloat(t.lender_payout) * 100), // Convert to cents
              destinationAccountId: lenderConnectId,
              metadata: {
                transactionId: t.id,
                type: 'rental_payout',
              },
            });

            // Record the transfer ID
            await client.query(
              'UPDATE borrow_transactions SET stripe_transfer_id = $1 WHERE id = $2',
              [transfer.id, t.id]
            );
          }

          // Refund deposit to borrower
          if (parseFloat(t.deposit_amount) > 0 && t.stripe_payment_intent_id) {
            await refundPayment(
              t.stripe_payment_intent_id,
              Math.round(parseFloat(t.deposit_amount) * 100) // Convert to cents
            );
          }

          // Mark listing available again and update stats
          await client.query(
            `UPDATE listings
             SET is_available = true,
                 times_borrowed = times_borrowed + 1,
                 total_earnings = total_earnings + $1
             WHERE id = $2`,
            [parseFloat(t.lender_payout), t.listing_id]
          );
        });

        await sendNotification(t.borrower_id, 'return_confirmed', {
          transactionId: t.id,
        });

        res.json({ success: true, disputed: false });
      }
    } catch (err) {
      console.error('Confirm return error:', err);
      res.status(500).json({ error: 'Failed to confirm return' });
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
