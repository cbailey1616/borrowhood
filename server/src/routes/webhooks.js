import { Router } from 'express';
import { query } from '../utils/db.js';
import { constructWebhookEvent } from '../services/stripe.js';
import { sendNotification } from '../services/notifications.js';
import logger from '../utils/logger.js';

const router = Router();

// Note: Raw body parsing for Stripe webhooks is configured in index.js

// ============================================
// POST /api/webhooks/stripe
// Handle Stripe webhook events
// ============================================
router.post('/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = constructWebhookEvent(req.body, signature, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      // ============================================
      // Identity Verification Events
      // ============================================
      case 'identity.verification_session.verified':
        await handleIdentityVerified(event.data.object);
        break;

      case 'identity.verification_session.requires_input':
        await handleIdentityRequiresInput(event.data.object);
        break;

      // ============================================
      // Payment Intent Events
      // ============================================
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object);
        break;

      case 'payment_intent.amount_capturable_updated':
        // Authorization hold placed successfully
        await handleAuthorizationHeld(event.data.object);
        break;

      // ============================================
      // Connect Account Events
      // ============================================
      case 'account.updated':
        await handleConnectAccountUpdated(event.data.object);
        break;

      // ============================================
      // Refund Events
      // ============================================
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;

      default:
        logger.info(`Unhandled webhook event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    logger.error(`Webhook handler error for ${event.type}:`, err);
    res.status(500).json({ error: 'Webhook handler error' });
  }
});

// ============================================
// Identity Verification Handlers
// ============================================

async function handleIdentityVerified(session) {
  const customerId = session.metadata?.customer_id;
  if (!customerId) {
    logger.warn('Identity verification without customer_id in metadata');
    return;
  }

  // Extract verified data
  const verifiedData = session.verified_outputs || {};
  const firstName = verifiedData.first_name;
  const lastName = verifiedData.last_name;
  const dob = verifiedData.dob;
  const address = verifiedData.address;

  // Update user as verified
  await query(
    `UPDATE users SET
      is_verified = true,
      stripe_identity_session_id = $1,
      verified_at = NOW(),
      first_name = COALESCE($2, first_name),
      last_name = COALESCE($3, last_name),
      address_line1 = COALESCE($4, address_line1),
      city = COALESCE($5, city),
      state = COALESCE($6, state),
      zip_code = COALESCE($7, zip_code)
     WHERE stripe_customer_id = $8`,
    [
      session.id,
      firstName,
      lastName,
      address?.line1,
      address?.city,
      address?.state,
      address?.postal_code,
      customerId,
    ]
  );

  // Get user ID for notification
  const user = await query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (user.rows.length > 0) {
    await sendNotification(user.rows[0].id, 'join_approved', {
      communityName: 'Borrowhood',
    });
  }

  logger.info(`Identity verified for customer ${customerId}`);
}

async function handleIdentityRequiresInput(session) {
  const customerId = session.metadata?.customer_id;
  logger.info(`Identity verification requires input for customer ${customerId}`);

  // Could send notification to user to retry verification
  const user = await query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (user.rows.length > 0) {
    // You could add a 'verification_failed' notification type
    logger.info(`User ${user.rows[0].id} needs to retry identity verification`);
  }
}

// ============================================
// Payment Handlers
// ============================================

async function handlePaymentSucceeded(paymentIntent) {
  const transactionId = paymentIntent.metadata?.transaction_id;
  if (!transactionId) {
    logger.warn('Payment succeeded without transaction_id in metadata');
    return;
  }

  // Update transaction status
  await query(
    `UPDATE borrow_transactions SET
      status = 'payment_confirmed',
      payment_status = 'captured'
     WHERE id = $1`,
    [transactionId]
  );

  // Get transaction details for notification
  const transaction = await query(
    `SELECT t.*, l.title as item_title, l.owner_id as lender_id
     FROM borrow_transactions t
     JOIN listings l ON t.listing_id = l.id
     WHERE t.id = $1`,
    [transactionId]
  );

  if (transaction.rows.length > 0) {
    const t = transaction.rows[0];
    await sendNotification(t.lender_id, 'payment_confirmed', {
      itemTitle: t.item_title,
    }, {
      transactionId: t.id,
      listingId: t.listing_id,
      fromUserId: t.borrower_id,
    });
  }

  logger.info(`Payment succeeded for transaction ${transactionId}`);
}

async function handlePaymentFailed(paymentIntent) {
  const transactionId = paymentIntent.metadata?.transaction_id;
  if (!transactionId) return;

  await query(
    `UPDATE borrow_transactions SET payment_status = 'failed' WHERE id = $1`,
    [transactionId]
  );

  logger.info(`Payment failed for transaction ${transactionId}`);
}

async function handlePaymentCanceled(paymentIntent) {
  const transactionId = paymentIntent.metadata?.transaction_id;
  if (!transactionId) return;

  await query(
    `UPDATE borrow_transactions SET
      status = 'cancelled',
      payment_status = 'cancelled'
     WHERE id = $1`,
    [transactionId]
  );

  // Mark listing as available again
  await query(
    `UPDATE listings SET is_available = true
     FROM borrow_transactions t
     WHERE listings.id = t.listing_id AND t.id = $1`,
    [transactionId]
  );

  logger.info(`Payment canceled for transaction ${transactionId}`);
}

async function handleAuthorizationHeld(paymentIntent) {
  const transactionId = paymentIntent.metadata?.transaction_id;
  if (!transactionId) return;

  // Update to show authorization is ready
  await query(
    `UPDATE borrow_transactions SET payment_status = 'authorized' WHERE id = $1`,
    [transactionId]
  );

  logger.info(`Authorization held for transaction ${transactionId}`);
}

// ============================================
// Connect Account Handlers
// ============================================

async function handleConnectAccountUpdated(account) {
  // Check if account is fully onboarded
  if (account.charges_enabled && account.payouts_enabled) {
    await query(
      `UPDATE users SET stripe_connect_onboarded = true WHERE stripe_connect_id = $1`,
      [account.id]
    );
    logger.info(`Connect account ${account.id} fully onboarded`);
  }
}

// ============================================
// Refund Handlers
// ============================================

async function handleChargeRefunded(charge) {
  const paymentIntentId = charge.payment_intent;
  if (!paymentIntentId) return;

  // Find transaction by payment intent
  const transaction = await query(
    `SELECT t.*, l.community_id
     FROM borrow_transactions t
     JOIN listings l ON t.listing_id = l.id
     WHERE t.stripe_payment_intent_id = $1`,
    [paymentIntentId]
  );

  if (transaction.rows.length > 0) {
    const t = transaction.rows[0];

    // Log for audit
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'transaction', $3, $4)`,
      [
        null, // System action
        'refund_processed',
        t.id,
        JSON.stringify({ refund_amount: charge.amount_refunded }),
      ]
    );

    logger.info(`Refund processed for transaction ${t.id}`);
  }
}

export default router;
