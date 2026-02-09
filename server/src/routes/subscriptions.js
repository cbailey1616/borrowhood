import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { stripe, createEphemeralKey } from '../services/stripe.js';

const router = Router();

// Tier structure:
// - free: Friends + Neighborhood, free listings only
// - plus ($1/mo): Town visibility + can charge for rentals

const TIER_PRICES = {
  free: 0,
  plus: 100, // $1.00/mo
};

const PLUS_PLANS = {
  monthly: { interval: 'month', amount: 100, display: '$1/mo' },
  annual: { interval: 'year', amount: 1000, display: '$10/yr' },
};

const TIER_INFO = {
  free: {
    name: 'Free',
    description: 'Share with friends and neighbors',
    features: [
      'Borrow from friends',
      'Borrow from your neighborhood',
      'List items for free',
    ],
  },
  plus: {
    name: 'Plus',
    description: 'Unlock your whole town',
    features: [
      'Everything in Free',
      'Borrow from anyone in town',
      'Charge rental fees',
    ],
  },
};

// ============================================
// GET /api/subscriptions/tiers
// Get available subscription tiers
// ============================================
router.get('/tiers', authenticate, async (req, res) => {
  try {
    const tiers = Object.entries(TIER_INFO).map(([tier, info]) => ({
      tier,
      priceCents: TIER_PRICES[tier],
      priceDisplay: TIER_PRICES[tier] === 0 ? 'Free' : `$${(TIER_PRICES[tier] / 100).toFixed(0)}/mo`,
      name: info.name,
      description: info.description,
      features: info.features,
      ...(tier === 'plus' ? {
        plans: Object.entries(PLUS_PLANS).map(([key, plan]) => ({
          key,
          interval: plan.interval,
          amountCents: plan.amount,
          display: plan.display,
        })),
      } : {}),
    }));

    res.json(tiers);
  } catch (err) {
    console.error('Get tiers error:', err);
    res.status(500).json({ error: 'Failed to get tiers' });
  }
});

// ============================================
// GET /api/subscriptions/current
// Get user's current subscription (with live Stripe status)
// ============================================
router.get('/current', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT subscription_tier, subscription_started_at, subscription_expires_at, stripe_subscription_id
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    let tier = user.subscription_tier || 'free';
    let isPlus = tier === 'plus';

    // Fetch live status from Stripe if subscription exists
    let status = isPlus ? 'active' : null;
    let nextBillingDate = null;
    let cancelAtPeriodEnd = false;

    if (user.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
        status = sub.status; // active, past_due, canceled, etc.
        cancelAtPeriodEnd = sub.cancel_at_period_end;
        nextBillingDate = new Date(sub.current_period_end * 1000).toISOString();

        // Self-heal: if Stripe says active but DB still says free, upgrade now
        // (handles cases where webhook was missed)
        if (sub.status === 'active' && tier === 'free') {
          await query(
            `UPDATE users SET subscription_tier = 'plus', subscription_started_at = NOW() WHERE id = $1`,
            [req.user.id]
          );
          tier = 'plus';
        }
      } catch (stripeErr) {
        console.error('Failed to fetch Stripe subscription:', stripeErr.message);
      }
    }

    isPlus = tier === 'plus';
    const info = TIER_INFO[tier] || TIER_INFO.free;

    res.json({
      tier,
      name: info.name,
      priceCents: TIER_PRICES[tier] || 0,
      features: info.features,
      startedAt: user.subscription_started_at,
      expiresAt: user.subscription_expires_at,
      isActive: !user.subscription_expires_at || new Date(user.subscription_expires_at) > new Date(),
      canAccessTown: isPlus,
      canCharge: isPlus,
      status,
      nextBillingDate,
      cancelAtPeriodEnd,
    });
  } catch (err) {
    console.error('Get current subscription error:', err);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// ============================================
// POST /api/subscriptions/subscribe
// Create subscription and return PaymentSheet credentials
// ============================================
router.post('/subscribe', authenticate, async (req, res) => {
  const { plan = 'monthly' } = req.body;

  // Validate plan
  const planConfig = PLUS_PLANS[plan];
  if (!planConfig) {
    return res.status(400).json({ error: 'Invalid plan. Must be "monthly" or "annual".' });
  }

  try {
    const user = await query(
      `SELECT email, stripe_customer_id, subscription_tier FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.rows[0].subscription_tier === 'plus') {
      return res.status(400).json({ error: 'Already subscribed to Plus' });
    }

    let customerId = user.rows[0].stripe_customer_id;

    // Verify existing customer is accessible (handles live/test mode mismatch)
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (e) {
        // Customer from a different Stripe mode — clear and recreate
        customerId = null;
        await query(
          `UPDATE users SET stripe_customer_id = NULL, stripe_subscription_id = NULL WHERE id = $1`,
          [req.user.id]
        );
      }
    }

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.rows[0].email,
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;

      await query(
        `UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, req.user.id]
      );
    }

    // Create subscription with incomplete status — PaymentSheet will collect payment
    const idempotencyKey = `sub_${req.user.id}_${crypto.randomUUID()}`;
    let productId = process.env.STRIPE_PRODUCT_PLUS;
    if (!productId) {
      // In test mode without a configured product, find or create one
      const products = await stripe.products.list({ limit: 1, active: true });
      const existing = products.data.find(p => p.name === 'BorrowHood Plus');
      if (existing) {
        productId = existing.id;
      } else {
        const product = await stripe.products.create({ name: 'BorrowHood Plus' });
        productId = product.id;
      }
    }
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: productId,
          recurring: { interval: planConfig.interval },
          unit_amount: planConfig.amount,
        },
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: { userId: req.user.id, plan },
      expand: ['latest_invoice.payment_intent'],
    }, {
      idempotencyKey,
    });

    // Save subscription ID now (tier update happens via invoice.paid webhook)
    await query(
      `UPDATE users SET stripe_subscription_id = $1 WHERE id = $2`,
      [subscription.id, req.user.id]
    );

    // Generate ephemeral key for PaymentSheet
    const ephemeralKey = await createEphemeralKey(customerId, '2024-06-20');

    res.json({
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId,
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// ============================================
// POST /api/subscriptions/cancel
// Cancel subscription (downgrade to free at period end)
// ============================================
router.post('/cancel', authenticate, async (req, res) => {
  try {
    const user = await query(
      `SELECT stripe_subscription_id FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (!user.rows[0]?.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    // Cancel at period end
    const subscription = await stripe.subscriptions.update(
      user.rows[0].stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    // Update expiration date
    await query(
      `UPDATE users SET subscription_expires_at = to_timestamp($1)
       WHERE id = $2`,
      [subscription.current_period_end, req.user.id]
    );

    res.json({
      message: 'Subscription will be cancelled at end of billing period',
      expiresAt: new Date(subscription.current_period_end * 1000).toISOString(),
    });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// ============================================
// POST /api/subscriptions/reactivate
// Reactivate a cancelled subscription before period ends
// ============================================
router.post('/reactivate', authenticate, async (req, res) => {
  try {
    const user = await query(
      `SELECT stripe_subscription_id FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (!user.rows[0]?.stripe_subscription_id) {
      return res.status(400).json({ error: 'No subscription to reactivate' });
    }

    // Remove cancel_at_period_end
    const subscription = await stripe.subscriptions.update(
      user.rows[0].stripe_subscription_id,
      { cancel_at_period_end: false }
    );

    // Clear expiration date
    await query(
      `UPDATE users SET subscription_expires_at = NULL WHERE id = $1`,
      [req.user.id]
    );

    res.json({
      message: 'Subscription reactivated',
      status: subscription.status,
    });
  } catch (err) {
    console.error('Reactivate subscription error:', err);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

// ============================================
// POST /api/subscriptions/retry-payment
// Retry payment for past_due subscription via PaymentSheet
// ============================================
router.post('/retry-payment', authenticate, async (req, res) => {
  try {
    const user = await query(
      `SELECT stripe_customer_id, stripe_subscription_id FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (!user.rows[0]?.stripe_subscription_id) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const customerId = user.rows[0].stripe_customer_id;

    // Get the subscription's latest invoice
    const subscription = await stripe.subscriptions.retrieve(
      user.rows[0].stripe_subscription_id,
      { expand: ['latest_invoice.payment_intent'] }
    );

    if (subscription.status !== 'past_due') {
      return res.status(400).json({ error: 'Subscription is not past due' });
    }

    const paymentIntent = subscription.latest_invoice?.payment_intent;
    if (!paymentIntent?.client_secret) {
      return res.status(400).json({ error: 'No pending payment found' });
    }

    // Generate ephemeral key for PaymentSheet
    const ephemeralKey = await createEphemeralKey(customerId, '2024-06-20');

    res.json({
      clientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId,
    });
  } catch (err) {
    console.error('Retry payment error:', err);
    res.status(500).json({ error: 'Failed to retry payment' });
  }
});

// ============================================
// GET /api/subscriptions/access-check
// Check if user can access a feature
// ============================================
router.get('/access-check', authenticate, async (req, res) => {
  const { feature } = req.query; // 'town' or 'rentals'

  try {
    const result = await query(
      `SELECT subscription_tier, is_verified, stripe_connect_account_id, verification_grace_until FROM users WHERE id = $1`,
      [req.user.id]
    );

    const u = result.rows[0];
    const tier = u?.subscription_tier || 'free';
    const isPlus = tier === 'plus';
    const graceActive = u?.verification_grace_until && new Date(u.verification_grace_until) > new Date();
    const isVerified = u?.is_verified || graceActive || false;
    const hasConnect = !!u?.stripe_connect_account_id;

    let hasAccess = false;

    switch (feature) {
      case 'town':
      case 'rentals':
        hasAccess = isPlus;
        break;
      default:
        hasAccess = true;
    }

    // Determine next missing requirement
    const nextStep = !isPlus
      ? 'subscription'
      : !isVerified
        ? 'verification'
        : (feature === 'rentals' && !hasConnect)
          ? 'connect'
          : null;

    const requiresVerification = feature === 'town' || feature === 'rentals';
    res.json({
      tier,
      feature,
      canAccess: requiresVerification ? hasAccess && isVerified : hasAccess,
      isSubscribed: isPlus,
      isVerified,
      hasConnect,
      nextStep,
      // Keep legacy fields for backwards compat
      hasAccess,
      upgradeRequired: !hasAccess,
      requiredTier: 'plus',
    });
  } catch (err) {
    console.error('Access check error:', err);
    res.status(500).json({ error: 'Failed to check access' });
  }
});

// ============================================
// GET /api/subscriptions/can-charge
// Quick check if user can charge for rentals
// ============================================
router.get('/can-charge', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT subscription_tier FROM users WHERE id = $1`,
      [req.user.id]
    );

    const tier = result.rows[0]?.subscription_tier || 'free';
    const canCharge = tier === 'plus';

    res.json({ canCharge, tier });
  } catch (err) {
    console.error('Can charge check error:', err);
    res.status(500).json({ error: 'Failed to check' });
  }
});

export default router;
