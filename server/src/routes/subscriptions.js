import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, ENABLE_PAID_TIERS } from '../middleware/auth.js';

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
// Retired: digital verification purchases use Apple IAP, never Stripe Checkout
// ============================================
router.post('/verify-payment', authenticate, (_req, res) => {
  // Deliberately unconditional: ENABLE_PAYMENTS controls historical physical
  // rentals, and must never reactivate external digital verification charges.
  res.status(410).json({ code: 'VERIFICATION_IAP_REQUIRED', error: 'Update Borrowhood to use Apple verification purchases.' });
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

    const isPlusOrVerified = isPlus || isVerified;

    // Verification always required for town; tier checks only when paid tiers enabled
    let hasAccess;
    if (!ENABLE_PAID_TIERS) {
      // Town and rentals still require verification even without paid tiers
      switch (feature) {
        case 'town':
          hasAccess = isVerified;
          break;
        case 'rentals':
          hasAccess = isVerified;
          break;
        default:
          hasAccess = true;
      }
    } else {
      hasAccess = false;
      switch (feature) {
        case 'town':
        case 'rentals':
          hasAccess = isPlusOrVerified;
          break;
        default:
          hasAccess = true;
      }
    }

    // Determine next missing requirement
    const needsVerification = (feature === 'town' || feature === 'rentals') && !isVerified;
    const nextStep = needsVerification
      ? 'identity'
      : (ENABLE_PAID_TIERS && !isPlusOrVerified)
        ? 'verification'
        : (feature === 'rentals' && !hasConnect)
          ? 'connect'
          : null;

    const requiresVerification = feature === 'town' || feature === 'rentals';
    res.json({
      tier: ENABLE_PAID_TIERS ? tier : 'plus',
      feature,
      canAccess: requiresVerification ? hasAccess && isVerified : hasAccess,
      isSubscribed: !ENABLE_PAID_TIERS || isPlus,
      isVerified,
      hasConnect,
      nextStep,
      // Keep legacy fields for backwards compat
      hasAccess,
      upgradeRequired: ENABLE_PAID_TIERS && !hasAccess,
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
    // Verification always required for charging; tier check only when paid tiers enabled
    const canCharge = isVerified && (!ENABLE_PAID_TIERS || tier === 'plus');

    res.json({ canCharge, tier: ENABLE_PAID_TIERS ? tier : 'plus' });
  } catch (err) {
    console.error('Can charge check error:', err);
    res.status(500).json({ error: 'Failed to check' });
  }
});

export default router;
