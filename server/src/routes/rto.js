import { Router } from 'express';
import { query, withTransaction } from '../utils/db.js';
import { authenticate, requireVerified } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import {
  createPaymentIntent,
  capturePaymentIntent,
  createTransfer,
} from '../services/stripe.js';
import { sendNotification } from '../services/notifications.js';

const router = Router();

const PLATFORM_FEE_PERCENT = 0.02; // 2%

// ============================================
// GET /api/rto/contracts
// Get user's RTO contracts
// ============================================
router.get('/contracts', authenticate, async (req, res) => {
  const { role, status } = req.query;

  try {
    let whereClause = '';
    if (role === 'borrower') {
      whereClause = 'c.borrower_id = $1';
    } else if (role === 'lender') {
      whereClause = 'c.lender_id = $1';
    } else {
      whereClause = '(c.borrower_id = $1 OR c.lender_id = $1)';
    }

    if (status) {
      whereClause += ` AND c.status = '${status}'`;
    }

    const result = await query(
      `SELECT c.*,
              l.title as listing_title,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url,
              b.first_name as borrower_first_name, b.last_name as borrower_last_name,
              b.profile_photo_url as borrower_photo,
              lnd.first_name as lender_first_name, lnd.last_name as lender_last_name,
              lnd.profile_photo_url as lender_photo
       FROM rto_contracts c
       JOIN listings l ON c.listing_id = l.id
       JOIN users b ON c.borrower_id = b.id
       JOIN users lnd ON c.lender_id = lnd.id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(c => ({
      id: c.id,
      status: c.status,
      listing: {
        id: c.listing_id,
        title: c.listing_title,
        photoUrl: c.photo_url,
      },
      borrower: {
        id: c.borrower_id,
        firstName: c.borrower_first_name,
        lastName: c.borrower_last_name,
        profilePhotoUrl: c.borrower_photo,
      },
      lender: {
        id: c.lender_id,
        firstName: c.lender_first_name,
        lastName: c.lender_last_name,
        profilePhotoUrl: c.lender_photo,
      },
      purchasePrice: parseFloat(c.purchase_price),
      totalPayments: c.total_payments,
      paymentsCompleted: c.payments_completed,
      paymentAmount: parseFloat(c.payment_amount),
      equityAccumulated: parseFloat(c.equity_accumulated),
      nextPaymentDate: c.next_payment_date,
      isBorrower: c.borrower_id === req.user.id,
      createdAt: c.created_at,
    })));
  } catch (err) {
    console.error('Get RTO contracts error:', err);
    res.status(500).json({ error: 'Failed to get contracts' });
  }
});

// ============================================
// GET /api/rto/contracts/:id
// Get RTO contract details
// ============================================
router.get('/contracts/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*,
              l.title as listing_title, l.description as listing_description,
              (SELECT array_agg(url ORDER BY sort_order) FROM listing_photos WHERE listing_id = l.id) as photos,
              b.first_name as borrower_first_name, b.last_name as borrower_last_name,
              b.profile_photo_url as borrower_photo, b.borrower_rating,
              lnd.first_name as lender_first_name, lnd.last_name as lender_last_name,
              lnd.profile_photo_url as lender_photo
       FROM rto_contracts c
       JOIN listings l ON c.listing_id = l.id
       JOIN users b ON c.borrower_id = b.id
       JOIN users lnd ON c.lender_id = lnd.id
       WHERE c.id = $1 AND (c.borrower_id = $2 OR c.lender_id = $2)`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const c = result.rows[0];

    // Get payment history
    const payments = await query(
      `SELECT * FROM rto_payments
       WHERE contract_id = $1
       ORDER BY payment_number`,
      [c.id]
    );

    res.json({
      id: c.id,
      status: c.status,
      listing: {
        id: c.listing_id,
        title: c.listing_title,
        description: c.listing_description,
        photos: c.photos || [],
      },
      borrower: {
        id: c.borrower_id,
        firstName: c.borrower_first_name,
        lastName: c.borrower_last_name,
        profilePhotoUrl: c.borrower_photo,
        rating: parseFloat(c.borrower_rating) || 0,
      },
      lender: {
        id: c.lender_id,
        firstName: c.lender_first_name,
        lastName: c.lender_last_name,
        profilePhotoUrl: c.lender_photo,
      },
      purchasePrice: parseFloat(c.purchase_price),
      totalPayments: c.total_payments,
      paymentsCompleted: c.payments_completed,
      paymentAmount: parseFloat(c.payment_amount),
      rentalCreditPercent: parseFloat(c.rental_credit_percent),
      paymentFrequency: c.payment_frequency,
      firstPaymentDate: c.first_payment_date,
      nextPaymentDate: c.next_payment_date,
      equityAccumulated: parseFloat(c.equity_accumulated),
      rentalPaid: parseFloat(c.rental_paid),
      remainingEquity: parseFloat(c.purchase_price) - parseFloat(c.equity_accumulated),
      progressPercent: (parseFloat(c.equity_accumulated) / parseFloat(c.purchase_price)) * 100,
      payments: payments.rows.map(p => ({
        id: p.id,
        paymentNumber: p.payment_number,
        totalAmount: parseFloat(p.total_amount),
        equityPortion: parseFloat(p.equity_portion),
        rentalPortion: parseFloat(p.rental_portion),
        dueDate: p.due_date,
        paidAt: p.paid_at,
        status: p.status,
      })),
      termsAcceptedAt: c.terms_accepted_at,
      approvedAt: c.approved_at,
      completedAt: c.completed_at,
      isBorrower: c.borrower_id === req.user.id,
      isLender: c.lender_id === req.user.id,
      createdAt: c.created_at,
    });
  } catch (err) {
    console.error('Get RTO contract error:', err);
    res.status(500).json({ error: 'Failed to get contract' });
  }
});

// ============================================
// POST /api/rto/contracts
// Create RTO contract request
// ============================================
router.post('/contracts', authenticate, requireVerified,
  body('listingId').isUUID(),
  body('totalPayments').isInt({ min: 1, max: 36 }),
  body('paymentFrequency').optional().isIn(['weekly', 'biweekly', 'monthly']),
  body('firstPaymentDate').isISO8601(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { listingId, totalPayments, paymentFrequency = 'monthly', firstPaymentDate } = req.body;

    try {
      // Get listing details
      const listing = await query(
        `SELECT l.*, u.stripe_connect_account_id as lender_stripe_id
         FROM listings l
         JOIN users u ON l.owner_id = u.id
         WHERE l.id = $1 AND l.rto_available = true AND l.status = 'active'`,
        [listingId]
      );

      if (listing.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found or RTO not available' });
      }

      const item = listing.rows[0];

      if (item.owner_id === req.user.id) {
        return res.status(400).json({ error: 'Cannot create RTO contract for your own item' });
      }

      // Calculate payment schedule
      const purchasePrice = parseFloat(item.rto_purchase_price);
      const rentalCreditPercent = parseFloat(item.rto_rental_credit_percent) || 50;

      // Each payment contributes rental_credit_percent toward equity
      const equityPerPayment = purchasePrice / totalPayments;
      const paymentAmount = equityPerPayment / (rentalCreditPercent / 100);
      const rentalPerPayment = paymentAmount - equityPerPayment;

      const platformFee = paymentAmount * PLATFORM_FEE_PERCENT;
      const lenderPayout = paymentAmount - platformFee;

      // Create contract
      const result = await query(
        `INSERT INTO rto_contracts (
          listing_id, borrower_id, lender_id,
          purchase_price, total_payments, payment_amount,
          rental_credit_percent, payment_frequency, first_payment_date, next_payment_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        RETURNING id`,
        [
          listingId, req.user.id, item.owner_id,
          purchasePrice, totalPayments, paymentAmount,
          rentalCreditPercent, paymentFrequency, firstPaymentDate
        ]
      );

      const contractId = result.rows[0].id;

      // Create payment schedule
      let paymentDate = new Date(firstPaymentDate);
      for (let i = 1; i <= totalPayments; i++) {
        await query(
          `INSERT INTO rto_payments (
            contract_id, payment_number, total_amount, equity_portion,
            rental_portion, platform_fee, lender_payout, due_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            contractId, i, paymentAmount, equityPerPayment,
            rentalPerPayment, platformFee, lenderPayout, paymentDate
          ]
        );

        // Increment date based on frequency
        if (paymentFrequency === 'weekly') {
          paymentDate.setDate(paymentDate.getDate() + 7);
        } else if (paymentFrequency === 'biweekly') {
          paymentDate.setDate(paymentDate.getDate() + 14);
        } else {
          paymentDate.setMonth(paymentDate.getMonth() + 1);
        }
      }

      // Notify lender
      await sendNotification(item.owner_id, 'rto_request', {
        contractId,
        listingId,
        fromUserId: req.user.id,
      });

      res.status(201).json({ id: contractId });
    } catch (err) {
      console.error('Create RTO contract error:', err);
      res.status(500).json({ error: 'Failed to create contract' });
    }
  }
);

// ============================================
// POST /api/rto/contracts/:id/approve
// Lender approves RTO contract
// ============================================
router.post('/contracts/:id/approve', authenticate, async (req, res) => {
  try {
    const contract = await query(
      `SELECT * FROM rto_contracts
       WHERE id = $1 AND lender_id = $2 AND status = 'pending'`,
      [req.params.id, req.user.id]
    );

    if (contract.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found or not pending' });
    }

    const c = contract.rows[0];

    await query(
      `UPDATE rto_contracts
       SET status = 'active', approved_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    // Mark listing as unavailable
    await query(
      'UPDATE listings SET is_available = false WHERE id = $1',
      [c.listing_id]
    );

    // Notify borrower
    await sendNotification(c.borrower_id, 'rto_approved', {
      contractId: c.id,
      listingId: c.listing_id,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Approve RTO contract error:', err);
    res.status(500).json({ error: 'Failed to approve contract' });
  }
});

// ============================================
// POST /api/rto/contracts/:id/decline
// Lender declines RTO contract
// ============================================
router.post('/contracts/:id/decline', authenticate,
  body('reason').optional().isLength({ max: 500 }),
  async (req, res) => {
    const { reason } = req.body;

    try {
      const result = await query(
        `UPDATE rto_contracts
         SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $1
         WHERE id = $2 AND lender_id = $3 AND status = 'pending'
         RETURNING borrower_id, listing_id`,
        [reason || 'Declined by lender', req.params.id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found or not pending' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Decline RTO contract error:', err);
      res.status(500).json({ error: 'Failed to decline contract' });
    }
  }
);

// ============================================
// POST /api/rto/contracts/:id/cancel
// Cancel an active RTO contract
// ============================================
router.post('/contracts/:id/cancel', authenticate,
  body('reason').isLength({ min: 1, max: 500 }),
  async (req, res) => {
    const { reason } = req.body;

    try {
      const contract = await query(
        `SELECT * FROM rto_contracts
         WHERE id = $1 AND (borrower_id = $2 OR lender_id = $2) AND status = 'active'`,
        [req.params.id, req.user.id]
      );

      if (contract.rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found or not active' });
      }

      const c = contract.rows[0];
      const isBorrower = c.borrower_id === req.user.id;

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE rto_contracts
           SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $1
           WHERE id = $2`,
          [`${isBorrower ? 'Borrower' : 'Lender'}: ${reason}`, req.params.id]
        );

        // Mark listing as available again
        await client.query(
          'UPDATE listings SET is_available = true WHERE id = $1',
          [c.listing_id]
        );
      });

      // Notify other party
      const notifyUserId = isBorrower ? c.lender_id : c.borrower_id;
      await sendNotification(notifyUserId, 'rto_defaulted', {
        contractId: c.id,
        reason: 'Contract cancelled',
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Cancel RTO contract error:', err);
      res.status(500).json({ error: 'Failed to cancel contract' });
    }
  }
);

// ============================================
// GET /api/rto/contracts/:id/payments
// Get payment history for a contract
// ============================================
router.get('/contracts/:id/payments', authenticate, async (req, res) => {
  try {
    const contract = await query(
      `SELECT * FROM rto_contracts
       WHERE id = $1 AND (borrower_id = $2 OR lender_id = $2)`,
      [req.params.id, req.user.id]
    );

    if (contract.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const payments = await query(
      `SELECT * FROM rto_payments
       WHERE contract_id = $1
       ORDER BY payment_number`,
      [req.params.id]
    );

    res.json(payments.rows.map(p => ({
      id: p.id,
      paymentNumber: p.payment_number,
      totalAmount: parseFloat(p.total_amount),
      equityPortion: parseFloat(p.equity_portion),
      rentalPortion: parseFloat(p.rental_portion),
      dueDate: p.due_date,
      paidAt: p.paid_at,
      status: p.status,
    })));
  } catch (err) {
    console.error('Get RTO payments error:', err);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

// ============================================
// POST /api/rto/contracts/:id/pay
// Make a payment on the RTO contract
// ============================================
router.post('/contracts/:id/pay', authenticate, async (req, res) => {
  try {
    const contract = await query(
      `SELECT c.*, u.stripe_customer_id, l.stripe_connect_account_id as lender_stripe_id
       FROM rto_contracts c
       JOIN users u ON c.borrower_id = u.id
       JOIN users l ON c.lender_id = l.id
       WHERE c.id = $1 AND c.borrower_id = $2 AND c.status = 'active'`,
      [req.params.id, req.user.id]
    );

    if (contract.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found or not active' });
    }

    const c = contract.rows[0];

    // Find the next pending payment
    const payment = await query(
      `SELECT * FROM rto_payments
       WHERE contract_id = $1 AND status = 'pending'
       ORDER BY payment_number
       LIMIT 1`,
      [req.params.id]
    );

    if (payment.rows.length === 0) {
      return res.status(400).json({ error: 'No pending payments' });
    }

    const p = payment.rows[0];

    // Create and capture payment
    const paymentIntent = await createPaymentIntent({
      amount: Math.round(parseFloat(p.total_amount) * 100),
      customerId: c.stripe_customer_id,
      captureMethod: 'automatic',
      metadata: {
        contractId: c.id,
        paymentId: p.id,
        type: 'rto_payment',
      },
    });

    await withTransaction(async (client) => {
      // Update payment record
      await client.query(
        `UPDATE rto_payments
         SET status = 'completed', paid_at = NOW(), stripe_payment_intent_id = $1
         WHERE id = $2`,
        [paymentIntent.id, p.id]
      );

      // Update contract progress
      await client.query(
        `UPDATE rto_contracts
         SET payments_completed = payments_completed + 1,
             equity_accumulated = equity_accumulated + $1,
             rental_paid = rental_paid + $2,
             next_payment_date = (
               SELECT due_date FROM rto_payments
               WHERE contract_id = $3 AND status = 'pending'
               ORDER BY payment_number LIMIT 1
             )
         WHERE id = $3`,
        [parseFloat(p.equity_portion), parseFloat(p.rental_portion), c.id]
      );

      // Transfer to lender if they have Connect account
      if (c.lender_stripe_id) {
        const transfer = await createTransfer({
          amount: Math.round(parseFloat(p.lender_payout) * 100),
          destinationAccountId: c.lender_stripe_id,
          metadata: {
            contractId: c.id,
            paymentId: p.id,
            type: 'rto_payout',
          },
        });

        await client.query(
          'UPDATE rto_payments SET stripe_transfer_id = $1 WHERE id = $2',
          [transfer.id, p.id]
        );
      }

      // Check if contract is complete
      const updatedContract = await client.query(
        'SELECT payments_completed, total_payments, listing_id FROM rto_contracts WHERE id = $1',
        [c.id]
      );

      if (updatedContract.rows[0].payments_completed >= updatedContract.rows[0].total_payments) {
        // Contract complete - transfer ownership
        await client.query(
          `UPDATE rto_contracts
           SET status = 'completed', completed_at = NOW()
           WHERE id = $1`,
          [c.id]
        );

        // Transfer listing ownership
        await client.query(
          `UPDATE listings
           SET owner_id = $1, is_available = true
           WHERE id = $2`,
          [req.user.id, updatedContract.rows[0].listing_id]
        );

        // Notify lender of ownership transfer
        await sendNotification(c.lender_id, 'rto_completed', {
          contractId: c.id,
        });
      }
    });

    // Notify lender of payment received
    await sendNotification(c.lender_id, 'rto_payment_received', {
      contractId: c.id,
      amount: parseFloat(p.total_amount),
      paymentNumber: p.payment_number,
    });

    res.json({
      success: true,
      paymentId: p.id,
      paymentNumber: p.payment_number,
    });
  } catch (err) {
    console.error('Make RTO payment error:', err);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

export default router;
