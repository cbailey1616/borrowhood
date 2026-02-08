/**
 * Subscription Tests — Real Stripe Test API
 *
 * Tests the full subscription lifecycle: create, activate via webhook,
 * cancel, reactivate, and access checks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createTestUser,
  createTestCustomer,
  attachTestPaymentMethod,
  createTestApp,
  cleanupTestUser,
  stripe,
  buildWebhookPayload,
  signWebhookPayload,
  ensureStripePlusProduct,
} from '../helpers/stripe.js';

describe('Subscriptions API', () => {
  let app;
  let freeUser; // { userId, token, email, customerId }
  let plusUser; // starts as free, becomes plus via subscribe flow

  beforeAll(async () => {
    // Ensure Plus product exists in Stripe
    await ensureStripePlusProduct();

    app = await createTestApp(
      { path: '/api/subscriptions', module: '../../src/routes/subscriptions.js' },
      { path: '/webhooks', module: '../../src/routes/webhooks.js' },
    );

    // Free user with Stripe customer + payment method
    freeUser = await createTestUser({
      email: `sub-free-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'free',
    });
    const freeCustomer = await createTestCustomer(freeUser.userId, freeUser.email);
    await attachTestPaymentMethod(freeCustomer.id);
    freeUser.customerId = freeCustomer.id;

    // Another user for subscribe flow
    plusUser = await createTestUser({
      email: `sub-plus-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'free',
    });
    const plusCustomer = await createTestCustomer(plusUser.userId, plusUser.email);
    await attachTestPaymentMethod(plusCustomer.id);
    plusUser.customerId = plusCustomer.id;
  });

  afterAll(async () => {
    await cleanupTestUser(freeUser.userId);
    await cleanupTestUser(plusUser.userId);
  });

  // ===========================================
  // GET /api/subscriptions/tiers
  // ===========================================
  describe('GET /tiers', () => {
    it('should return free and plus tiers', async () => {
      const res = await request(app)
        .get('/api/subscriptions/tiers')
        .set('Authorization', `Bearer ${freeUser.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const free = res.body.find(t => t.tier === 'free');
      const plus = res.body.find(t => t.tier === 'plus');

      expect(free).toBeDefined();
      expect(free.priceCents).toBe(0);
      expect(free.features).toBeInstanceOf(Array);

      expect(plus).toBeDefined();
      expect(plus.priceCents).toBe(100);
      expect(plus.plans).toBeInstanceOf(Array);
      expect(plus.plans.length).toBeGreaterThanOrEqual(2);
    });

    it('should include monthly and annual plans for plus tier', async () => {
      const res = await request(app)
        .get('/api/subscriptions/tiers')
        .set('Authorization', `Bearer ${freeUser.token}`);

      const plus = res.body.find(t => t.tier === 'plus');
      const monthly = plus.plans.find(p => p.key === 'monthly');
      const annual = plus.plans.find(p => p.key === 'annual');

      expect(monthly).toBeDefined();
      expect(monthly.amountCents).toBe(100);
      expect(monthly.interval).toBe('month');

      expect(annual).toBeDefined();
      expect(annual.amountCents).toBe(1000);
      expect(annual.interval).toBe('year');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/subscriptions/tiers');
      expect(res.status).toBe(401);
    });
  });

  // ===========================================
  // GET /api/subscriptions/current
  // ===========================================
  describe('GET /current', () => {
    it('should return free tier for unsubscribed user', async () => {
      const res = await request(app)
        .get('/api/subscriptions/current')
        .set('Authorization', `Bearer ${freeUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('free');
      expect(res.body.isActive).toBe(true);
      expect(res.body.canAccessTown).toBe(false);
      expect(res.body.canCharge).toBe(false);
    });
  });

  // ===========================================
  // POST /api/subscriptions/subscribe
  // ===========================================
  describe('POST /subscribe', () => {
    it('should create a subscription and return PaymentSheet credentials', async () => {
      const res = await request(app)
        .post('/api/subscriptions/subscribe')
        .set('Authorization', `Bearer ${plusUser.token}`)
        .send({ plan: 'monthly' });

      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toBeDefined();
      expect(res.body.clientSecret).toMatch(/^pi_/);
      expect(res.body.ephemeralKey).toBeDefined();
      expect(res.body.customerId).toBe(plusUser.customerId);
    });

    it('should reject invalid plan', async () => {
      const res = await request(app)
        .post('/api/subscriptions/subscribe')
        .set('Authorization', `Bearer ${freeUser.token}`)
        .send({ plan: 'platinum' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid plan/);
    });

    it('should reject if already subscribed to plus', async () => {
      // Manually set plusUser to plus tier
      const { query } = await import('../../src/utils/db.js');
      await query(
        "UPDATE users SET subscription_tier = 'plus' WHERE id = $1",
        [plusUser.userId]
      );

      const res = await request(app)
        .post('/api/subscriptions/subscribe')
        .set('Authorization', `Bearer ${plusUser.token}`)
        .send({ plan: 'monthly' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Already subscribed/);

      // Reset for subsequent tests
      await query(
        "UPDATE users SET subscription_tier = 'free' WHERE id = $1",
        [plusUser.userId]
      );
    });
  });

  // ===========================================
  // Webhook: invoice.paid → activate Plus
  // ===========================================
  describe('Webhook: invoice.paid', () => {
    it('should activate Plus tier when invoice.paid fires', async () => {
      const { query } = await import('../../src/utils/db.js');

      // First create a subscription so we have a subscription ID
      const subRes = await request(app)
        .post('/api/subscriptions/subscribe')
        .set('Authorization', `Bearer ${freeUser.token}`)
        .send({ plan: 'monthly' });

      expect(subRes.status).toBe(200);

      // Get the subscription ID from the DB
      const userRow = await query(
        'SELECT stripe_subscription_id FROM users WHERE id = $1',
        [freeUser.userId]
      );
      const subscriptionId = userRow.rows[0].stripe_subscription_id;
      expect(subscriptionId).toBeDefined();

      // Simulate invoice.paid webhook
      const payload = buildWebhookPayload('invoice.paid', {
        subscription: subscriptionId,
        amount_paid: 100,
        payment_intent: 'pi_test_' + Date.now(),
      });

      const payloadStr = JSON.stringify(payload);
      const signature = signWebhookPayload(payloadStr, process.env.STRIPE_WEBHOOK_SECRET);

      const webhookRes = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadStr);

      expect(webhookRes.status).toBe(200);

      // Verify tier updated in DB
      const updated = await query(
        'SELECT subscription_tier, subscription_started_at FROM users WHERE id = $1',
        [freeUser.userId]
      );
      expect(updated.rows[0].subscription_tier).toBe('plus');
      expect(updated.rows[0].subscription_started_at).toBeTruthy();
    });
  });

  // ===========================================
  // POST /api/subscriptions/cancel
  // ===========================================
  describe('POST /cancel', () => {
    it('should reject cancel without active subscription', async () => {
      // plusUser has no stripe_subscription_id set (we only set tier manually)
      const { query } = await import('../../src/utils/db.js');
      await query(
        "UPDATE users SET stripe_subscription_id = NULL, subscription_tier = 'free' WHERE id = $1",
        [plusUser.userId]
      );

      const res = await request(app)
        .post('/api/subscriptions/cancel')
        .set('Authorization', `Bearer ${plusUser.token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No active subscription');
    });

    it('should cancel subscription at period end', async () => {
      // freeUser now has a real subscription from the webhook test
      const res = await request(app)
        .post('/api/subscriptions/cancel')
        .set('Authorization', `Bearer ${freeUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.expiresAt).toBeDefined();
      expect(res.body.message).toMatch(/cancelled at end of billing period/);
    });
  });

  // ===========================================
  // POST /api/subscriptions/reactivate
  // ===========================================
  describe('POST /reactivate', () => {
    it('should reactivate a cancelled subscription', async () => {
      // freeUser's subscription was just cancelled (cancel_at_period_end)
      const res = await request(app)
        .post('/api/subscriptions/reactivate')
        .set('Authorization', `Bearer ${freeUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/reactivated/);

      // Verify expiration cleared
      const { query } = await import('../../src/utils/db.js');
      const row = await query(
        'SELECT subscription_expires_at FROM users WHERE id = $1',
        [freeUser.userId]
      );
      expect(row.rows[0].subscription_expires_at).toBeNull();
    });

    it('should reject reactivation without subscription', async () => {
      const res = await request(app)
        .post('/api/subscriptions/reactivate')
        .set('Authorization', `Bearer ${plusUser.token}`);

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // GET /api/subscriptions/access-check (enhanced)
  // ===========================================
  describe('GET /access-check (enhanced)', () => {
    it('should return nextStep=subscription for free user checking town', async () => {
      const { query } = await import('../../src/utils/db.js');
      await query(
        "UPDATE users SET subscription_tier = 'free', is_verified = false WHERE id = $1",
        [plusUser.userId]
      );

      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${plusUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.isSubscribed).toBe(false);
      expect(res.body.isVerified).toBe(false);
      expect(res.body.nextStep).toBe('subscription');
      expect(res.body.canAccess).toBe(false);
    });

    it('should return nextStep=verification for plus unverified user', async () => {
      const { query } = await import('../../src/utils/db.js');
      await query(
        "UPDATE users SET subscription_tier = 'plus', is_verified = false WHERE id = $1",
        [plusUser.userId]
      );

      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${plusUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.isSubscribed).toBe(true);
      expect(res.body.isVerified).toBe(false);
      expect(res.body.nextStep).toBe('verification');
    });

    it('should return nextStep=connect for verified plus user checking rentals', async () => {
      const { query } = await import('../../src/utils/db.js');
      await query(
        "UPDATE users SET subscription_tier = 'plus', is_verified = true, stripe_connect_account_id = NULL WHERE id = $1",
        [plusUser.userId]
      );

      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${plusUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.isSubscribed).toBe(true);
      expect(res.body.isVerified).toBe(true);
      expect(res.body.hasConnect).toBe(false);
      expect(res.body.nextStep).toBe('connect');
    });

    it('should return nextStep=null when all requirements met', async () => {
      const { query } = await import('../../src/utils/db.js');
      await query(
        "UPDATE users SET subscription_tier = 'plus', is_verified = true, stripe_connect_account_id = 'acct_test_123' WHERE id = $1",
        [plusUser.userId]
      );

      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${plusUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.canAccess).toBe(true);
      expect(res.body.nextStep).toBeNull();
    });
  });

  // ===========================================
  // GET /api/subscriptions/can-charge
  // ===========================================
  describe('GET /can-charge', () => {
    it('should return canCharge=false for free user', async () => {
      const { query } = await import('../../src/utils/db.js');
      await query(
        "UPDATE users SET subscription_tier = 'free' WHERE id = $1",
        [plusUser.userId]
      );

      const res = await request(app)
        .get('/api/subscriptions/can-charge')
        .set('Authorization', `Bearer ${plusUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.canCharge).toBe(false);
      expect(res.body.tier).toBe('free');
    });

    it('should return canCharge=true for plus user', async () => {
      const { query } = await import('../../src/utils/db.js');
      await query(
        "UPDATE users SET subscription_tier = 'plus' WHERE id = $1",
        [plusUser.userId]
      );

      const res = await request(app)
        .get('/api/subscriptions/can-charge')
        .set('Authorization', `Bearer ${plusUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.canCharge).toBe(true);
      expect(res.body.tier).toBe('plus');
    });
  });

  // ===========================================
  // Webhook: customer.subscription.deleted → reset to free
  // ===========================================
  describe('Webhook: customer.subscription.deleted', () => {
    it('should reset user to free tier', async () => {
      const { query } = await import('../../src/utils/db.js');

      // Get freeUser's subscription ID (set from earlier test)
      const row = await query(
        'SELECT stripe_subscription_id FROM users WHERE id = $1',
        [freeUser.userId]
      );
      const subscriptionId = row.rows[0]?.stripe_subscription_id;

      if (!subscriptionId) return; // Skip if no subscription from earlier tests

      const payload = buildWebhookPayload('customer.subscription.deleted', {
        id: subscriptionId,
        status: 'canceled',
      });

      const payloadStr = JSON.stringify(payload);
      const signature = signWebhookPayload(payloadStr, process.env.STRIPE_WEBHOOK_SECRET);

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadStr);

      expect(res.status).toBe(200);

      // Verify tier reset
      const updated = await query(
        'SELECT subscription_tier, stripe_subscription_id FROM users WHERE id = $1',
        [freeUser.userId]
      );
      expect(updated.rows[0].subscription_tier).toBe('free');
      expect(updated.rows[0].stripe_subscription_id).toBeNull();
    });
  });
});
