import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Tier structure:
// - free: Friends + Neighborhood, free listings only
// - plus ($1/mo): Town visibility + can charge for rentals

const TIER_PRICES = {
  free: 0,
  plus: 100, // $1.00
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
    }));

    res.json(tiers);
  } catch (err) {
    console.error('Get tiers error:', err);
    res.status(500).json({ error: 'Failed to get tiers' });
  }
});

// ============================================
// GET /api/subscriptions/current
// Get user's current subscription
// ============================================
router.get('/current', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT subscription_tier, subscription_started_at, subscription_expires_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const tier = user.subscription_tier || 'free';
    const info = TIER_INFO[tier] || TIER_INFO.free;
    const isPlus = tier === 'plus';

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
    });
  } catch (err) {
    console.error('Get current subscription error:', err);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// ============================================
// POST /api/subscriptions/subscribe
// Subscribe to Plus tier
// ============================================
router.post('/subscribe', authenticate, async (req, res) => {
  const { paymentMethodId } = req.body;

  try {
    const user = await query(
      `SELECT email, stripe_customer_id, subscription_tier, is_verified, city FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Plus requires identity verification (for town matching and rental payments)
    if (!user.rows[0].is_verified) {
      return res.status(403).json({
        error: 'Identity verification required for Plus subscription',
        code: 'VERIFICATION_REQUIRED',
      });
    }

    // Must have a verified city for town features
    if (!user.rows[0].city) {
      return res.status(403).json({
        error: 'Verified address required for Plus subscription. Please complete identity verification.',
        code: 'VERIFICATION_REQUIRED',
      });
    }

    if (user.rows[0].subscription_tier === 'plus') {
      return res.status(400).json({ error: 'Already subscribed to Plus' });
    }

    let customerId = user.rows[0].stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.rows[0].email,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;

      await query(
        `UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, req.user.id]
      );
    } else {
      // Attach payment method to existing customer
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: 'prod_Tw6rY768inoM0H',
          recurring: { interval: 'month' },
          unit_amount: 100, // $1.00
        },
      }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    // Update user's subscription
    await query(
      `UPDATE users SET
        subscription_tier = 'plus',
        subscription_started_at = NOW(),
        subscription_expires_at = NULL,
        stripe_subscription_id = $1
       WHERE id = $2`,
      [subscription.id, req.user.id]
    );

    res.json({
      subscriptionId: subscription.id,
      status: subscription.status,
      clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Failed to subscribe' });
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
// GET /api/subscriptions/access-check
// Check if user can access a feature
// ============================================
router.get('/access-check', authenticate, async (req, res) => {
  const { feature } = req.query; // 'town' or 'rentals'

  try {
    const result = await query(
      `SELECT subscription_tier FROM users WHERE id = $1`,
      [req.user.id]
    );

    const tier = result.rows[0]?.subscription_tier || 'free';
    const isPlus = tier === 'plus';

    let hasAccess = false;

    switch (feature) {
      case 'town':
      case 'rentals':
        hasAccess = isPlus;
        break;
      default:
        hasAccess = true;
    }

    res.json({
      tier,
      feature,
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
