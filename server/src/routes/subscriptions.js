import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const TIER_PRICES = {
  free: 0,
  neighborhood: 100, // $1.00
  town: 200, // $2.00
};

// ============================================
// GET /api/subscriptions/tiers
// Get available subscription tiers
// ============================================
router.get('/tiers', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT tier, price_cents, name, description, features
       FROM subscription_pricing
       WHERE is_active = true
       ORDER BY price_cents`
    );

    res.json(result.rows.map(t => ({
      tier: t.tier,
      priceCents: t.price_cents,
      priceDisplay: t.price_cents === 0 ? 'Free' : `$${(t.price_cents / 100).toFixed(0)}/mo`,
      name: t.name,
      description: t.description,
      features: t.features,
    })));
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
      `SELECT u.subscription_tier, u.subscription_started_at, u.subscription_expires_at,
              sp.name, sp.price_cents, sp.features
       FROM users u
       LEFT JOIN subscription_pricing sp ON u.subscription_tier = sp.tier
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const sub = result.rows[0];

    res.json({
      tier: sub.subscription_tier,
      name: sub.name,
      priceCents: sub.price_cents,
      features: sub.features,
      startedAt: sub.subscription_started_at,
      expiresAt: sub.subscription_expires_at,
      isActive: !sub.subscription_expires_at || new Date(sub.subscription_expires_at) > new Date(),
    });
  } catch (err) {
    console.error('Get current subscription error:', err);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// ============================================
// POST /api/subscriptions/subscribe
// Subscribe to a tier
// ============================================
router.post('/subscribe', authenticate, async (req, res) => {
  const { tier, paymentMethodId } = req.body;

  if (!['neighborhood', 'town'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  try {
    const user = await query(
      `SELECT email, stripe_customer_id, subscription_tier FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
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
    const priceId = tier === 'neighborhood'
      ? process.env.STRIPE_PRICE_NEIGHBORHOOD
      : process.env.STRIPE_PRICE_TOWN;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    // Update user's subscription
    await query(
      `UPDATE users SET
        subscription_tier = $1,
        subscription_started_at = NOW(),
        subscription_expires_at = NULL,
        stripe_subscription_id = $2
       WHERE id = $3`,
      [tier, subscription.id, req.user.id]
    );

    // Log subscription history
    await query(
      `INSERT INTO subscription_history (user_id, tier, action, amount_cents, stripe_payment_id)
       VALUES ($1, $2, 'subscribe', $3, $4)`,
      [req.user.id, tier, TIER_PRICES[tier], subscription.id]
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

    // Log cancellation
    await query(
      `INSERT INTO subscription_history (user_id, tier, action)
       VALUES ($1, (SELECT subscription_tier FROM users WHERE id = $1), 'cancel')`,
      [req.user.id]
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
// POST /api/subscriptions/upgrade
// Upgrade to a higher tier
// ============================================
router.post('/upgrade', authenticate, async (req, res) => {
  const { tier } = req.body;

  if (tier !== 'town') {
    return res.status(400).json({ error: 'Can only upgrade to town tier' });
  }

  try {
    const user = await query(
      `SELECT stripe_subscription_id, subscription_tier FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (!user.rows[0]?.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription to upgrade' });
    }

    if (user.rows[0].subscription_tier === 'town') {
      return res.status(400).json({ error: 'Already on town tier' });
    }

    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(
      user.rows[0].stripe_subscription_id
    );

    // Update to new price
    await stripe.subscriptions.update(subscription.id, {
      items: [{
        id: subscription.items.data[0].id,
        price: process.env.STRIPE_PRICE_TOWN,
      }],
      proration_behavior: 'create_prorations',
    });

    // Update user
    await query(
      `UPDATE users SET subscription_tier = 'town' WHERE id = $1`,
      [req.user.id]
    );

    // Log upgrade
    await query(
      `INSERT INTO subscription_history (user_id, tier, action, amount_cents)
       VALUES ($1, 'town', 'upgrade', $2)`,
      [req.user.id, TIER_PRICES.town - TIER_PRICES.neighborhood]
    );

    res.json({ success: true, tier: 'town' });
  } catch (err) {
    console.error('Upgrade error:', err);
    res.status(500).json({ error: 'Failed to upgrade' });
  }
});

// ============================================
// GET /api/subscriptions/access-check
// Check if user can access a visibility level
// ============================================
router.get('/access-check', authenticate, async (req, res) => {
  const { visibility } = req.query;

  try {
    const result = await query(
      `SELECT subscription_tier FROM users WHERE id = $1`,
      [req.user.id]
    );

    const tier = result.rows[0]?.subscription_tier || 'free';

    let canAccess = false;
    let canCharge = false;

    switch (visibility) {
      case 'close_friends':
        canAccess = true;
        canCharge = tier !== 'free';
        break;
      case 'neighborhood':
        canAccess = tier === 'neighborhood' || tier === 'town';
        canCharge = canAccess;
        break;
      case 'town':
        canAccess = tier === 'town';
        canCharge = canAccess;
        break;
    }

    res.json({
      tier,
      visibility,
      canAccess,
      canCharge,
      upgradeRequired: !canAccess,
      requiredTier: visibility === 'town' ? 'town' : visibility === 'neighborhood' ? 'neighborhood' : 'free',
    });
  } catch (err) {
    console.error('Access check error:', err);
    res.status(500).json({ error: 'Failed to check access' });
  }
});

export default router;
