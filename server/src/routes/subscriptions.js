import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { stripe, createEphemeralKey } from '../services/stripe.js';

const router = Router();

// Tier structure:
// - free: Friends + Neighborhood, free listings only
// - plus ($1.99 one-time): Town visibility + can charge for rentals (permanent)

const VERIFICATION_FEE_CENTS = 199; // $1.99 one-time

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
    name: 'Verified',
    description: 'Unlock your whole town',
    features: [
      'Everything in Free',
      'Borrow from anyone in town',
      'Charge rental fees',
      'Identity verified badge',
    ],
  },
};

// ============================================
// GET /api/subscriptions/tiers
// Get available tiers
// ============================================
router.get('/tiers', authenticate, async (req, res) => {
  try {
    const tiers = [
      {
        tier: 'free',
        priceCents: 0,
        priceDisplay: 'Free',
        name: TIER_INFO.free.name,
        description: TIER_INFO.free.description,
        features: TIER_INFO.free.features,
      },
      {
        tier: 'plus',
        priceCents: VERIFICATION_FEE_CENTS,
        priceDisplay: '$1.99 one-time',
        name: TIER_INFO.plus.name,
        description: TIER_INFO.plus.description,
        features: TIER_INFO.plus.features,
      },
    ];

    res.json(tiers);
  } catch (err) {
    console.error('Get tiers error:', err);
    res.status(500).json({ error: 'Failed to get tiers' });
  }
});

// ============================================
// GET /api/subscriptions/current
// Get user's current tier status
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
    const isPlus = tier === 'plus';
    const info = TIER_INFO[tier] || TIER_INFO.free;

    res.json({
      tier,
      name: info.name,
      priceCents: isPlus ? VERIFICATION_FEE_CENTS : 0,
      features: info.features,
      startedAt: user.subscription_started_at,
      isActive: isPlus,
      isPermanent: isPlus,
      canAccessTown: isPlus,
      canCharge: isPlus,
    });
  } catch (err) {
    console.error('Get current subscription error:', err);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// ============================================
// POST /api/subscriptions/verify-payment
// Create one-time PaymentIntent for $1.99 verification fee
// ============================================
router.post('/verify-payment', authenticate, async (req, res) => {
  try {
    const user = await query(
      `SELECT email, stripe_customer_id, subscription_tier FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.rows[0].subscription_tier === 'plus') {
      return res.status(400).json({ error: 'Already verified' });
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
          `UPDATE users SET stripe_customer_id = NULL WHERE id = $1`,
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

    // Create one-time PaymentIntent for $1.99
    const idempotencyKey = `verify_${req.user.id}_${crypto.randomUUID()}`;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: VERIFICATION_FEE_CENTS,
      currency: 'usd',
      customer: customerId,
      metadata: {
        userId: req.user.id,
        type: 'verification_fee',
      },
      payment_method_options: {
        card: {
          setup_future_usage: 'off_session',
        },
      },
    }, {
      idempotencyKey,
    });

    // Store the PaymentIntent ID on the user
    await query(
      `UPDATE users SET stripe_verification_payment_intent_id = $1 WHERE id = $2`,
      [paymentIntent.id, req.user.id]
    );

    // Generate ephemeral key for PaymentSheet
    const ephemeralKey = await createEphemeralKey(customerId, '2024-06-20');

    res.json({
      clientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId,
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Failed to create verification payment' });
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

    const isPlusOrVerified = isPlus || isVerified;

    switch (feature) {
      case 'town':
      case 'rentals':
        hasAccess = isPlusOrVerified;
        break;
      default:
        hasAccess = true;
    }

    // Determine next missing requirement
    const nextStep = !isPlusOrVerified
      ? 'verification'
      : !isVerified
        ? 'identity'
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
      `SELECT subscription_tier, is_verified FROM users WHERE id = $1`,
      [req.user.id]
    );

    const tier = result.rows[0]?.subscription_tier || 'free';
    const isVerified = result.rows[0]?.is_verified || false;
    const canCharge = tier === 'plus' || isVerified;

    res.json({ canCharge, tier });
  } catch (err) {
    console.error('Can charge check error:', err);
    res.status(500).json({ error: 'Failed to check' });
  }
});

export default router;
