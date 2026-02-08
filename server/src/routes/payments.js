import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { stripe, createEphemeralKey } from '../services/stripe.js';

const router = Router();

// Limits for server-side validation
const MIN_AMOUNT_CENTS = 50;     // $0.50 — Stripe minimum
const MAX_AMOUNT_CENTS = 999900; // $9,999.00

// ============================================
// POST /api/payments/create-payment-intent
// Create a PaymentIntent and return PaymentSheet credentials
// ============================================
router.post('/create-payment-intent', authenticate, async (req, res) => {
  const { amount, description, metadata = {} } = req.body;

  // Validate amount server-side
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT_CENTS || amount > MAX_AMOUNT_CENTS) {
    return res.status(400).json({
      error: `Amount must be an integer between ${MIN_AMOUNT_CENTS} and ${MAX_AMOUNT_CENTS} cents.`,
    });
  }

  try {
    const userResult = await query(
      'SELECT stripe_customer_id, email FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let customerId = userResult.rows[0].stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userResult.rows[0].email,
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;
      await query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, req.user.id]
      );
    }

    // Create PaymentIntent with idempotency key
    const idempotencyKey = `pi_${req.user.id}_${crypto.randomUUID()}`;
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: req.user.id,
        ...metadata,
      },
      ...(description ? { description } : {}),
    }, {
      idempotencyKey,
    });

    // Generate ephemeral key for PaymentSheet
    const ephemeralKey = await createEphemeralKey(customerId, '2024-06-20');

    res.json({
      clientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('Create payment intent error:', err);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// ============================================
// POST /api/payments/refund
// Refund a PaymentIntent (full or partial)
// ============================================
router.post('/refund', authenticate, async (req, res) => {
  const { paymentIntentId, amount } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({ error: 'paymentIntentId is required' });
  }

  // Validate partial refund amount if provided
  if (amount !== undefined) {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT_CENTS) {
      return res.status(400).json({ error: 'Invalid refund amount' });
    }
  }

  try {
    // Verify the payment intent belongs to this user
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Check ownership via customer
    const userResult = await query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );

    if (paymentIntent.customer !== userResult.rows[0]?.stripe_customer_id) {
      return res.status(403).json({ error: 'Not authorized to refund this payment' });
    }

    const refundParams = {
      payment_intent: paymentIntentId,
    };
    if (amount !== undefined) {
      refundParams.amount = amount;
    }

    const refund = await stripe.refunds.create(refundParams);

    res.json({
      refundId: refund.id,
      status: refund.status,
      amount: refund.amount,
    });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

export default router;
