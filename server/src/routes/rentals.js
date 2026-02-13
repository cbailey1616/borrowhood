import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import {
  stripe,
  createPaymentIntent,
  getPaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
  createTransfer,
  createEphemeralKey,
  refundPayment,
} from '../services/stripe.js';
import { sendNotification } from '../services/notifications.js';
import logger from '../utils/logger.js';

const router = Router();

const PLATFORM_FEE_PERCENT = 0.02; // 2%

// ============================================
// POST /api/rentals/request
// Borrower requests a rental — creates auth hold via PaymentSheet
// Returns PaymentSheet credentials for the full amount (rental + deposit)
// ============================================
router.post('/request', authenticate,
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
      // Get listing details
      const listing = await query(
        `SELECT l.*, u.stripe_connect_account_id as lender_connect_id
         FROM listings l
         JOIN users u ON l.owner_id = u.id
         WHERE l.id = $1 AND l.status = 'active'`,
        [listingId]
      );

      if (listing.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      const item = listing.rows[0];

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
          error: `Duration must be between ${item.min_duration} and ${item.max_duration} days`,
        });
      }

      // Calculate pricing
      const dailyRate = parseFloat(item.price_per_day) || 0;
      const rentalFee = dailyRate * rentalDays;
      const depositAmount = parseFloat(item.deposit_amount) || 0;
      const totalAmountCents = Math.round((rentalFee + depositAmount) * 100);
      const platformFee = rentalFee * PLATFORM_FEE_PERCENT;
      const lenderPayout = rentalFee - platformFee;
      const lateFeePerDay = parseFloat(item.late_fee_per_day) || 0;

      if (totalAmountCents < 50) {
        return res.status(400).json({ error: 'Total amount too small for payment processing' });
      }

      // Get borrower's Stripe customer ID
      const borrower = await query(
        'SELECT stripe_customer_id, email FROM users WHERE id = $1',
        [req.user.id]
      );

      let customerId = borrower.rows[0]?.stripe_customer_id;

      // Create Stripe customer if needed
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: borrower.rows[0].email,
          metadata: { userId: req.user.id },
        });
        customerId = customer.id;
        await query(
          'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
          [customerId, req.user.id]
        );
      }

      // Create transaction record
      const txnResult = await query(
        `INSERT INTO borrow_transactions (
          listing_id, borrower_id, lender_id,
          requested_start_date, requested_end_date,
          rental_days, daily_rate, rental_fee, deposit_amount,
          platform_fee, lender_payout, borrower_message, payment_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'none')
        RETURNING id`,
        [
          listingId, req.user.id, item.owner_id,
          startDate, endDate,
          rentalDays, dailyRate, rentalFee, depositAmount,
          platformFee, lenderPayout, message,
        ]
      );

      const transactionId = txnResult.rows[0].id;

      // Notify lender of new request
      await sendNotification(item.owner_id, 'borrow_request', {
        borrowerName: req.user.first_name,
        itemTitle: item.title,
        transactionId,
        listingId,
        fromUserId: req.user.id,
      });

      res.status(201).json({
        transactionId,
        rentalFee,
        depositAmount,
        totalAmount: rentalFee + depositAmount,
        platformFee,
        lenderPayout,
        lateFeePerDay,
        rentalDays,
      });
    } catch (err) {
      logger.error('Create rental request error:', err);
      res.status(500).json({ error: 'Failed to create rental request' });
    }
  }
);

// ============================================
// POST /api/rentals/:id/approve
// Owner approves — creates manual-capture PaymentIntent
// Returns PaymentSheet credentials for borrower to authorize
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
          [response, t.id]
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

      // Paid rental — capture the existing authorization hold
      await capturePaymentIntent(t.stripe_payment_intent_id);

      await query(
        `UPDATE borrow_transactions
         SET status = 'paid', lender_response = $1, payment_status = 'captured'
         WHERE id = $2`,
        [response, t.id]
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
      logger.error('Approve rental error:', {
        message: err.message,
        type: err.type,
        code: err.code,
        statusCode: err.statusCode,
        transactionId: req.params.id,
      });
      const detail = err.message || 'Unknown error';
      res.status(500).json({ error: `Failed to approve rental: ${detail}` });
    }
  }
);

// ============================================
// POST /api/rentals/:id/decline
// Owner declines the rental request
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

      // Cancel PaymentIntent if one exists
      if (t.stripe_payment_intent_id) {
        try {
          await cancelPaymentIntent(t.stripe_payment_intent_id);
        } catch (e) {
          logger.warn('Could not cancel PI on decline:', e.message);
        }
      }

      await sendNotification(t.borrower_id, 'request_declined', {
        transactionId: req.params.id,
        listingId: t.listing_id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('Decline rental error:', err);
      res.status(500).json({ error: 'Failed to decline rental' });
    }
  }
);

// ============================================
// POST /api/rentals/:id/confirm-payment
// Borrower confirms PaymentSheet completed — verifies authorization hold
// Now called at request time (upfront payment), keeps status pending for lender review
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
      return res.json({ success: true }); // Free rental
    }

    const pi = await getPaymentIntent(t.stripe_payment_intent_id);

    if (pi.status === 'requires_capture') {
      // Hold is in place — mark payment as authorized, keep status pending for lender review
      await query(
        `UPDATE borrow_transactions SET payment_status = 'authorized' WHERE id = $1`,
        [t.id]
      );
      return res.json({ success: true, status: 'authorized' });
    }

    if (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation') {
      const borrower = await query(
        'SELECT stripe_customer_id FROM users WHERE id = $1',
        [t.borrower_id]
      );
      const customerId = borrower.rows[0].stripe_customer_id;
      const ephemeralKey = await createEphemeralKey(customerId, '2024-06-20');

      return res.json({
        requiresPayment: true,
        clientSecret: pi.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customerId,
      });
    }

    await query(
      `UPDATE borrow_transactions SET payment_status = $1 WHERE id = $2`,
      [pi.status, t.id]
    );

    res.json({ success: true, status: pi.status });
  } catch (err) {
    logger.error('Confirm rental payment error:', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// ============================================
// POST /api/rentals/:id/cancel
// Borrower cancels request — immediate refund
// ============================================
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const txn = await query(
      `SELECT * FROM borrow_transactions
       WHERE id = $1 AND borrower_id = $2 AND status IN ('pending', 'paid')`,
      [req.params.id, req.user.id]
    );

    if (txn.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or cannot be cancelled' });
    }

    const t = txn.rows[0];

    if (t.stripe_payment_intent_id) {
      const pi = await getPaymentIntent(t.stripe_payment_intent_id);

      if (pi.status === 'requires_capture') {
        // Hold not yet captured — cancel it (releases hold instantly)
        await cancelPaymentIntent(t.stripe_payment_intent_id);
      } else if (pi.status === 'succeeded') {
        // Payment was captured — issue full refund
        await refundPayment(t.stripe_payment_intent_id);
      }
    }

    await query(
      `UPDATE borrow_transactions
       SET status = 'cancelled', payment_status = 'refunded'
       WHERE id = $1`,
      [t.id]
    );

    // Make listing available again
    await query(
      'UPDATE listings SET is_available = true WHERE id = $1',
      [t.listing_id]
    );

    await sendNotification(t.lender_id, 'request_declined', {
      transactionId: t.id,
      listingId: t.listing_id,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Cancel rental error:', err);
    res.status(500).json({ error: `Failed to cancel request: ${err.message}` });
  }
});

// ============================================
// POST /api/rentals/:id/pickup
// Lender confirms pickup
// ============================================
router.post('/:id/pickup', authenticate,
  body('condition').optional().isIn(['like_new', 'good', 'fair', 'worn']),
  async (req, res) => {
    const { condition } = req.body;

    try {
      const txn = await query(
        `SELECT * FROM borrow_transactions WHERE id = $1 AND status = 'paid'`,
        [req.params.id]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found or not ready for pickup' });
      }

      const t = txn.rows[0];

      if (t.lender_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the lender can confirm pickup' });
      }

      // Payment is already captured at approve time — no capture needed here

      await query(
        `UPDATE borrow_transactions
         SET status = 'picked_up', actual_pickup_at = NOW(),
             condition_at_pickup = $1
         WHERE id = $2`,
        [condition || 'good', t.id]
      );

      await sendNotification(t.borrower_id, 'pickup_confirmed', {
        transactionId: t.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('Confirm pickup error:', err);
      res.status(500).json({ error: 'Failed to confirm pickup' });
    }
  }
);

// ============================================
// POST /api/rentals/:id/return
// Lender confirms clean return — refund deposit to borrower
// Triggers payout to lender via Connect transfer
// ============================================
router.post('/:id/return', authenticate,
  body('condition').isIn(['like_new', 'good', 'fair', 'worn']),
  body('notes').optional().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { condition, notes } = req.body;

    try {
      const txn = await query(
        `SELECT * FROM borrow_transactions WHERE id = $1`,
        [req.params.id]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const t = txn.rows[0];

      if (t.lender_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the lender can confirm return' });
      }

      if (t.status !== 'picked_up' && t.status !== 'return_pending') {
        return res.status(400).json({ error: 'Item not currently borrowed' });
      }

      // Check for condition degradation
      const conditionOrder = ['like_new', 'good', 'fair', 'worn'];
      const pickupIdx = conditionOrder.indexOf(t.condition_at_pickup);
      const returnIdx = conditionOrder.indexOf(condition);

      if (returnIdx > pickupIdx) {
        // Condition worse — flag for damage claim instead of auto-completing
        await query(
          `UPDATE borrow_transactions
           SET condition_at_return = $1, condition_notes = $2
           WHERE id = $3`,
          [condition, notes, t.id]
        );

        return res.json({
          success: true,
          conditionDegraded: true,
          message: 'Condition degraded. You can file a damage claim.',
        });
      }

      // Clean return — process payout and refund deposit
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE borrow_transactions
           SET status = 'returned', condition_at_return = $1,
               condition_notes = $2, actual_return_at = NOW(),
               payment_status = 'completed'
           WHERE id = $3`,
          [condition, notes, t.id]
        );

        // Transfer rental fee to lender (minus platform fee)
        const lenderResult = await client.query(
          'SELECT stripe_connect_account_id FROM users WHERE id = $1',
          [t.lender_id]
        );
        const lenderConnectId = lenderResult.rows[0]?.stripe_connect_account_id;

        if (lenderConnectId) {
          const payoutCents = Math.round(parseFloat(t.lender_payout) * 100);
          if (payoutCents > 0) {
            const transfer = await createTransfer({
              amount: payoutCents,
              destinationAccountId: lenderConnectId,
              metadata: { transactionId: t.id, type: 'rental_payout' },
            });

            await client.query(
              'UPDATE borrow_transactions SET stripe_transfer_id = $1 WHERE id = $2',
              [transfer.id, t.id]
            );
          }
        }

        // Refund deposit to borrower
        const depositCents = Math.round(parseFloat(t.deposit_amount) * 100);
        if (depositCents > 0 && t.stripe_payment_intent_id) {
          await stripe.refunds.create({
            payment_intent: t.stripe_payment_intent_id,
            amount: depositCents,
          });
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

      res.json({ success: true, conditionDegraded: false });
    } catch (err) {
      logger.error('Confirm return error:', err);
      res.status(500).json({ error: 'Failed to confirm return' });
    }
  }
);

// ============================================
// POST /api/rentals/:id/damage-claim
// Owner claims damage — captures portion of deposit
// ============================================
router.post('/:id/damage-claim', authenticate,
  body('amountCents').isInt({ min: 1 }),
  body('notes').isLength({ min: 10, max: 1000 }),
  body('evidenceUrls').optional().isArray(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amountCents, notes, evidenceUrls = [] } = req.body;

    try {
      const txn = await query(
        `SELECT * FROM borrow_transactions WHERE id = $1`,
        [req.params.id]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const t = txn.rows[0];

      if (t.lender_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the lender can file a damage claim' });
      }

      if (t.status !== 'picked_up' && t.status !== 'return_pending') {
        return res.status(400).json({ error: 'Cannot file damage claim in current status' });
      }

      // Cap damage claim at deposit amount
      const depositCents = Math.round(parseFloat(t.deposit_amount) * 100);
      const claimAmount = Math.min(amountCents, depositCents);

      if (claimAmount <= 0) {
        return res.status(400).json({ error: 'No deposit to claim against' });
      }

      await withTransaction(async (client) => {
        // Record the damage claim
        await client.query(
          `UPDATE borrow_transactions
           SET status = 'returned', actual_return_at = NOW(),
               damage_claim_amount_cents = $1, damage_claim_notes = $2,
               damage_evidence_urls = $3, payment_status = 'damage_claimed'
           WHERE id = $4`,
          [claimAmount, notes, evidenceUrls, t.id]
        );

        // Refund only the remaining deposit (deposit - claim)
        const refundAmount = depositCents - claimAmount;
        if (refundAmount > 0 && t.stripe_payment_intent_id) {
          await stripe.refunds.create({
            payment_intent: t.stripe_payment_intent_id,
            amount: refundAmount,
          });
        }

        // Transfer rental fee + claim amount to lender
        const lenderResult = await client.query(
          'SELECT stripe_connect_account_id FROM users WHERE id = $1',
          [t.lender_id]
        );
        const lenderConnectId = lenderResult.rows[0]?.stripe_connect_account_id;

        if (lenderConnectId) {
          const payoutCents = Math.round(parseFloat(t.lender_payout) * 100) + claimAmount;
          if (payoutCents > 0) {
            const transfer = await createTransfer({
              amount: payoutCents,
              destinationAccountId: lenderConnectId,
              metadata: {
                transactionId: t.id,
                type: 'rental_payout_with_damage',
                damageClaimCents: claimAmount,
              },
            });

            await client.query(
              'UPDATE borrow_transactions SET stripe_transfer_id = $1 WHERE id = $2',
              [transfer.id, t.id]
            );
          }
        }

        // Mark listing available again
        await client.query(
          `UPDATE listings
           SET is_available = true,
               times_borrowed = times_borrowed + 1,
               total_earnings = total_earnings + $1
           WHERE id = $2`,
          [parseFloat(t.lender_payout), t.listing_id]
        );
      });

      // Notify borrower
      await sendNotification(t.borrower_id, 'dispute_opened', {
        transactionId: t.id,
        message: `Damage claim filed: $${(claimAmount / 100).toFixed(2)} deducted from deposit.`,
      });

      res.json({
        success: true,
        claimAmount: claimAmount,
        depositRefunded: depositCents - claimAmount,
      });
    } catch (err) {
      logger.error('Damage claim error:', err);
      res.status(500).json({ error: 'Failed to process damage claim' });
    }
  }
);

// ============================================
// POST /api/rentals/:id/late-fee
// Create a separate PaymentIntent for late fees
// ============================================
router.post('/:id/late-fee', authenticate, async (req, res) => {
  try {
    const txn = await query(
      `SELECT t.*, l.late_fee_per_day
       FROM borrow_transactions t
       JOIN listings l ON t.listing_id = l.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (txn.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const t = txn.rows[0];

    if (t.lender_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the lender can charge late fees' });
    }

    if (t.status !== 'picked_up') {
      return res.status(400).json({ error: 'Item must be currently borrowed to charge late fee' });
    }

    // Calculate days overdue
    const now = new Date();
    const endDate = new Date(t.requested_end_date);
    const daysOverdue = Math.ceil((now - endDate) / (1000 * 60 * 60 * 24));

    if (daysOverdue <= 0) {
      return res.status(400).json({ error: 'Rental is not overdue yet' });
    }

    const lateFeePerDay = parseFloat(t.late_fee_per_day) || 0;
    if (lateFeePerDay <= 0) {
      return res.status(400).json({ error: 'No late fee configured for this listing' });
    }

    const lateFeeCents = Math.round(lateFeePerDay * daysOverdue * 100);

    if (lateFeeCents < 50) {
      return res.status(400).json({ error: 'Late fee too small for payment processing' });
    }

    // Get borrower's Stripe customer ID
    const borrower = await query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [t.borrower_id]
    );

    const customerId = borrower.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'Borrower has no payment method on file' });
    }

    // Create a separate PaymentIntent for the late fee (auto-capture)
    const lateFeePI = await createPaymentIntent({
      amount: lateFeeCents,
      customerId,
      metadata: {
        transactionId: t.id,
        type: 'late_fee',
        daysOverdue: daysOverdue.toString(),
      },
      captureMethod: 'automatic',
    });

    // Generate ephemeral key for PaymentSheet
    const ephemeralKey = await createEphemeralKey(customerId, '2024-06-20');

    // Store late fee details
    await query(
      `UPDATE borrow_transactions
       SET stripe_late_fee_payment_intent_id = $1,
           late_fee_amount_cents = $2
       WHERE id = $3`,
      [lateFeePI.id, lateFeeCents, t.id]
    );

    // Notify borrower
    await sendNotification(t.borrower_id, 'return_reminder', {
      transactionId: t.id,
      dueDate: t.requested_end_date,
      message: `Your rental is ${daysOverdue} day(s) overdue. A late fee of $${(lateFeeCents / 100).toFixed(2)} has been charged.`,
    });

    res.json({
      clientSecret: lateFeePI.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId,
      paymentIntentId: lateFeePI.id,
      daysOverdue,
      lateFeeCents,
      lateFeePerDay,
    });
  } catch (err) {
    logger.error('Late fee error:', err);
    res.status(500).json({ error: 'Failed to create late fee charge' });
  }
});

// ============================================
// GET /api/rentals/:id/payment-status
// Get detailed payment status for a rental
// ============================================
router.get('/:id/payment-status', authenticate, async (req, res) => {
  try {
    const txn = await query(
      `SELECT t.*, l.title as listing_title, l.late_fee_per_day
       FROM borrow_transactions t
       JOIN listings l ON t.listing_id = l.id
       WHERE t.id = $1 AND (t.borrower_id = $2 OR t.lender_id = $2)`,
      [req.params.id, req.user.id]
    );

    if (txn.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const t = txn.rows[0];

    // Calculate overdue info
    const now = new Date();
    const endDate = new Date(t.requested_end_date);
    const daysOverdue = t.status === 'picked_up'
      ? Math.max(0, Math.ceil((now - endDate) / (1000 * 60 * 60 * 24)))
      : 0;

    const result = {
      transactionId: t.id,
      status: t.status,
      paymentStatus: t.payment_status,
      rentalFee: parseFloat(t.rental_fee),
      depositAmount: parseFloat(t.deposit_amount),
      platformFee: parseFloat(t.platform_fee),
      lenderPayout: parseFloat(t.lender_payout),
      lateFeePerDay: parseFloat(t.late_fee_per_day) || 0,
      lateFeeCharged: t.late_fee_amount_cents / 100,
      damageClaimAmount: t.damage_claim_amount_cents / 100,
      damageClaimNotes: t.damage_claim_notes,
      damageEvidenceUrls: t.damage_evidence_urls,
      isOverdue: daysOverdue > 0,
      daysOverdue,
      isBorrower: t.borrower_id === req.user.id,
      isLender: t.lender_id === req.user.id,
    };

    // Get live PI status if available
    if (t.stripe_payment_intent_id) {
      try {
        const pi = await getPaymentIntent(t.stripe_payment_intent_id);
        result.stripeStatus = pi.status;
        result.amountAuthorized = pi.amount / 100;
        result.amountCaptured = (pi.amount_received || 0) / 100;
      } catch (e) {
        logger.warn('Could not fetch PI status:', e.message);
      }
    }

    res.json(result);
  } catch (err) {
    logger.error('Get payment status error:', err);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

export default router;
