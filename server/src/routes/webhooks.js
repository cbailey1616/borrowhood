import { Router } from 'express';
import { query } from '../utils/db.js';
import { constructWebhookEvent, stripe } from '../services/stripe.js';
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
  // SWITCH TO LIVE KEYS ONLY FOR APP STORE RELEASE
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
      // Subscription Events
      // ============================================
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      // ============================================
      // Refund Events
      // ============================================
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;

      case 'charge.dispute.created':
        await handleChargeDisputeCreated(event.data.object);
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
      status = 'verified',
      is_verified = true,
      verification_status = 'verified',
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

  const user = await query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (user.rows.length > 0) {
    await query(
      `UPDATE users SET verification_status = 'requires_input' WHERE id = $1`,
      [user.rows[0].id]
    );

    await sendNotification(user.rows[0].id, 'verification_failed', {
      message: 'Your identity verification needs attention. Please try again.',
    });

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
      `UPDATE users SET status = 'verified' WHERE stripe_connect_account_id = $1`,
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

// ============================================
// Subscription Handlers
// ============================================

async function handleInvoicePaid(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  // Find user by subscription ID
  const result = await query(
    'SELECT id FROM users WHERE stripe_subscription_id = $1',
    [subscriptionId]
  );

  if (result.rows.length === 0) {
    // Might be a non-subscription invoice
    logger.info(`invoice.paid for unknown subscription ${subscriptionId}`);
    return;
  }

  const userId = result.rows[0].id;

  // Activate Plus tier
  await query(
    `UPDATE users SET
      subscription_tier = 'plus',
      subscription_started_at = COALESCE(subscription_started_at, NOW()),
      subscription_expires_at = NULL
     WHERE id = $1`,
    [userId]
  );

  // Log to subscription_history
  await query(
    `INSERT INTO subscription_history (user_id, tier, action, amount_cents, stripe_payment_id)
     VALUES ($1, 'plus', 'subscribe', $2, $3)`,
    [userId, invoice.amount_paid, invoice.payment_intent]
  );

  logger.info(`Subscription activated for user ${userId} via invoice.paid`);
}

async function handleInvoicePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const result = await query(
    'SELECT id FROM users WHERE stripe_subscription_id = $1',
    [subscriptionId]
  );

  if (result.rows.length === 0) return;

  const userId = result.rows[0].id;

  // Send push notification to update payment method
  await sendNotification(userId, 'payment_failed', {
    message: 'Your subscription payment failed. Please update your payment method to keep Plus.',
  });

  logger.info(`Subscription payment failed for user ${userId}`);
}

async function handleSubscriptionUpdated(subscription) {
  const result = await query(
    'SELECT id FROM users WHERE stripe_subscription_id = $1',
    [subscription.id]
  );

  if (result.rows.length === 0) return;

  const userId = result.rows[0].id;

  // Handle past_due status
  if (subscription.status === 'past_due') {
    await sendNotification(userId, 'payment_failed', {
      message: 'Your subscription is past due. Please update your payment method.',
    });
    logger.info(`Subscription past_due for user ${userId}`);
  }

  // Handle cancel_at_period_end — update expiration
  if (subscription.cancel_at_period_end && subscription.current_period_end) {
    await query(
      `UPDATE users SET subscription_expires_at = to_timestamp($1) WHERE id = $2`,
      [subscription.current_period_end, userId]
    );
  } else if (!subscription.cancel_at_period_end) {
    // Reactivated — clear expiration
    await query(
      `UPDATE users SET subscription_expires_at = NULL WHERE id = $1`,
      [userId]
    );
  }

  logger.info(`Subscription updated for user ${userId}: status=${subscription.status}, cancel_at_period_end=${subscription.cancel_at_period_end}`);
}

async function handleSubscriptionDeleted(subscription) {
  const result = await query(
    'SELECT id FROM users WHERE stripe_subscription_id = $1',
    [subscription.id]
  );

  if (result.rows.length === 0) return;

  const userId = result.rows[0].id;

  // Reset to free tier
  await query(
    `UPDATE users SET
      subscription_tier = 'free',
      stripe_subscription_id = NULL,
      subscription_expires_at = NULL
     WHERE id = $1`,
    [userId]
  );

  // Log to subscription_history
  await query(
    `INSERT INTO subscription_history (user_id, tier, action)
     VALUES ($1, 'free', 'cancel')`,
    [userId]
  );

  logger.info(`Subscription deleted for user ${userId}, reset to free tier`);
}

// ============================================
// Charge Dispute Handler (Stripe chargeback)
// ============================================

async function handleChargeDisputeCreated(dispute) {
  const paymentIntentId = dispute.payment_intent;
  if (!paymentIntentId) return;

  // Find the rental transaction
  const transaction = await query(
    `SELECT t.*, l.title as item_title
     FROM borrow_transactions t
     JOIN listings l ON t.listing_id = l.id
     WHERE t.stripe_payment_intent_id = $1
        OR t.stripe_late_fee_payment_intent_id = $1`,
    [paymentIntentId]
  );

  if (transaction.rows.length === 0) return;

  const t = transaction.rows[0];

  // Flag the transaction as disputed
  await query(
    `UPDATE borrow_transactions
     SET status = 'disputed', payment_status = 'disputed'
     WHERE id = $1`,
    [t.id]
  );

  // Create dispute record
  await query(
    `INSERT INTO disputes (transaction_id, opened_by_id, reason)
     VALUES ($1, $2, $3)`,
    [t.id, t.borrower_id, `Stripe chargeback filed (dispute ID: ${dispute.id})`]
  );

  // Notify both parties
  await sendNotification(t.lender_id, 'dispute_opened', {
    transactionId: t.id,
    itemTitle: t.item_title,
  });

  await sendNotification(t.borrower_id, 'dispute_opened', {
    transactionId: t.id,
    itemTitle: t.item_title,
  });

  logger.info(`Charge dispute created for transaction ${t.id}, dispute ID: ${dispute.id}`);
}

export default router;
