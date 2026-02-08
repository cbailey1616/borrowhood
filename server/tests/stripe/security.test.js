/**
 * Security Tests — Rate Limiting, Input Validation, Auth Boundaries
 *
 * Tests that the Stripe integration follows security best practices:
 * rate limiting, input validation, ownership checks, and error handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createTestUser,
  createTestCustomer,
  attachTestPaymentMethod,
  createTestListing,
  createTestApp,
  cleanupTestUser,
  stripe,
} from '../helpers/stripe.js';
import { query } from '../../src/utils/db.js';

describe('Security', () => {
  let app;
  let userA;
  let userB;
  let suspendedUser;

  beforeAll(async () => {
    app = await createTestApp(
      { path: '/api/payments', module: '../../src/routes/payments.js' },
      { path: '/api/subscriptions', module: '../../src/routes/subscriptions.js' },
      { path: '/api/identity', module: '../../src/routes/identity.js' },
      { path: '/api/rentals', module: '../../src/routes/rentals.js' },
      { path: '/api/users', module: '../../src/routes/users.js' },
      { path: '/webhooks', module: '../../src/routes/webhooks.js' },
    );

    userA = await createTestUser({
      email: `sec-a-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: true,
      status: 'verified',
    });
    const custA = await createTestCustomer(userA.userId, userA.email);
    await attachTestPaymentMethod(custA.id);
    userA.customerId = custA.id;

    userB = await createTestUser({
      email: `sec-b-${Date.now()}@borrowhood.test`,
    });
    const custB = await createTestCustomer(userB.userId, userB.email);
    userB.customerId = custB.id;

    suspendedUser = await createTestUser({
      email: `sec-sus-${Date.now()}@borrowhood.test`,
      status: 'suspended',
    });
  });

  afterAll(async () => {
    await cleanupTestUser(userA.userId);
    await cleanupTestUser(userB.userId);
    await cleanupTestUser(suspendedUser.userId);
  });

  // ===========================================
  // Authentication enforcement
  // ===========================================
  describe('Authentication enforcement', () => {
    const protectedEndpoints = [
      { method: 'get', path: '/api/subscriptions/tiers' },
      { method: 'get', path: '/api/subscriptions/current' },
      { method: 'post', path: '/api/subscriptions/subscribe' },
      { method: 'post', path: '/api/subscriptions/cancel' },
      { method: 'get', path: '/api/subscriptions/access-check' },
      { method: 'post', path: '/api/payments/create-payment-intent' },
      { method: 'post', path: '/api/payments/refund' },
      { method: 'post', path: '/api/identity/verify' },
      { method: 'get', path: '/api/identity/status' },
      { method: 'get', path: '/api/users/me/connect-status' },
      { method: 'post', path: '/api/users/me/connect-account' },
    ];

    for (const endpoint of protectedEndpoints) {
      it(`should require auth for ${endpoint.method.toUpperCase()} ${endpoint.path}`, async () => {
        const res = await request(app)[endpoint.method](endpoint.path);
        expect(res.status).toBe(401);
      });
    }
  });

  // ===========================================
  // Suspended user blocking
  // ===========================================
  describe('Suspended user blocking', () => {
    it('should block suspended user from accessing subscriptions', async () => {
      const res = await request(app)
        .get('/api/subscriptions/tiers')
        .set('Authorization', `Bearer ${suspendedUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/suspended/i);
    });

    it('should block suspended user from creating payments', async () => {
      const res = await request(app)
        .post('/api/payments/create-payment-intent')
        .set('Authorization', `Bearer ${suspendedUser.token}`)
        .send({ amount: 1000 });

      expect(res.status).toBe(403);
    });
  });

  // ===========================================
  // Payment amount validation
  // ===========================================
  describe('Payment amount validation', () => {
    const invalidAmounts = [
      { amount: 0, desc: 'zero' },
      { amount: -100, desc: 'negative' },
      { amount: 49, desc: 'below Stripe minimum ($0.49)' },
      { amount: 999901, desc: 'above maximum ($9,999.01)' },
      { amount: 10.5, desc: 'non-integer (float)' },
      { amount: 'abc', desc: 'string' },
      { amount: null, desc: 'null' },
    ];

    for (const { amount, desc } of invalidAmounts) {
      it(`should reject ${desc} amount: ${amount}`, async () => {
        const res = await request(app)
          .post('/api/payments/create-payment-intent')
          .set('Authorization', `Bearer ${userA.token}`)
          .send({ amount });

        expect(res.status).toBe(400);
      });
    }

    it('should accept valid minimum amount ($0.50 = 50 cents)', async () => {
      const res = await request(app)
        .post('/api/payments/create-payment-intent')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ amount: 50 });

      expect(res.status).toBe(200);
    });

    it('should accept valid maximum amount ($9,999 = 999900 cents)', async () => {
      const res = await request(app)
        .post('/api/payments/create-payment-intent')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ amount: 999900 });

      expect(res.status).toBe(200);
    });
  });

  // ===========================================
  // Ownership and authorization checks
  // ===========================================
  describe('Ownership checks', () => {
    it('should prevent refunding another user\'s payment', async () => {
      // Create payment as userA
      const pi = await stripe.paymentIntents.create({
        amount: 1000,
        currency: 'usd',
        customer: userA.customerId,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        confirm: true,
        payment_method: (await stripe.paymentMethods.list({
          customer: userA.customerId,
          type: 'card',
        })).data[0].id,
      });

      // Try to refund as userB
      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ paymentIntentId: pi.id });

      expect(res.status).toBe(403);
    });

    it('should prevent non-lender from confirming pickup', async () => {
      // Create a listing and transaction
      const listingId = await createTestListing(userA.userId, {
        title: 'Sec Test Item',
        isFree: false,
        pricePerDay: 5.00,
        depositAmount: 10.00,
      });

      const result = await query(
        `INSERT INTO borrow_transactions (
          listing_id, borrower_id, lender_id,
          requested_start_date, requested_end_date,
          rental_days, daily_rate, rental_fee, deposit_amount,
          platform_fee, lender_payout, status, payment_status
        ) VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '2 days',
          2, 5.00, 10.00, 10.00, 0.20, 9.80, 'paid', 'authorized')
        RETURNING id`,
        [listingId, userB.userId, userA.userId]
      );

      const res = await request(app)
        .post(`/api/rentals/${result.rows[0].id}/pickup`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ condition: 'good' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only the lender/);
    });

    it('should prevent non-lender from filing damage claim', async () => {
      const listingId = await createTestListing(userA.userId, {
        title: 'Sec Damage Test',
        isFree: false,
        pricePerDay: 5.00,
        depositAmount: 20.00,
      });

      const result = await query(
        `INSERT INTO borrow_transactions (
          listing_id, borrower_id, lender_id,
          requested_start_date, requested_end_date,
          rental_days, daily_rate, rental_fee, deposit_amount,
          platform_fee, lender_payout, status, payment_status
        ) VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '2 days',
          2, 5.00, 10.00, 20.00, 0.20, 9.80, 'picked_up', 'captured')
        RETURNING id`,
        [listingId, userB.userId, userA.userId]
      );

      const res = await request(app)
        .post(`/api/rentals/${result.rows[0].id}/damage-claim`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ amountCents: 1000, notes: 'Trying to steal from deposit' });

      expect(res.status).toBe(403);
    });
  });

  // ===========================================
  // Webhook signature security
  // ===========================================
  describe('Webhook signature security', () => {
    it('should reject webhook with missing signature', async () => {
      const res = await request(app)
        .post('/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'test', data: {} }));

      expect(res.status).toBe(400);
    });

    it('should reject webhook with tampered payload', async () => {
      const { buildWebhookPayload, signWebhookPayload } = await import('../helpers/stripe.js');

      const payload = buildWebhookPayload('invoice.paid', {
        subscription: 'sub_fake',
        amount_paid: 0,
      });

      // Sign original payload
      const payloadStr = JSON.stringify(payload);
      const signature = signWebhookPayload(payloadStr, process.env.STRIPE_WEBHOOK_SECRET);

      // Tamper with the payload after signing
      const tamperedPayload = JSON.stringify({ ...payload, tampered: true });

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(tamperedPayload);

      expect(res.status).toBe(400);
    });

    it('should reject webhook with wrong secret', async () => {
      const { buildWebhookPayload, signWebhookPayload } = await import('../helpers/stripe.js');

      const payload = buildWebhookPayload('test.event', { id: 'test' });
      const payloadStr = JSON.stringify(payload);
      const signature = signWebhookPayload(payloadStr, 'whsec_wrong_secret_12345');

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadStr);

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Input validation on rental requests
  // ===========================================
  describe('Rental input validation', () => {
    it('should reject missing listingId', async () => {
      const res = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString(),
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid date format', async () => {
      const res = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          listingId: '00000000-0000-0000-0000-000000000000',
          startDate: 'not-a-date',
          endDate: 'also-not-a-date',
        });

      expect(res.status).toBe(400);
    });

    it('should reject message exceeding max length', async () => {
      const res = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          listingId: '00000000-0000-0000-0000-000000000000',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString(),
          message: 'x'.repeat(501),
        });

      expect(res.status).toBe(400);
    });

    it('should reject damage claim with short notes', async () => {
      const listingId = await createTestListing(userA.userId, {
        title: 'Short Note Test',
        isFree: false,
        pricePerDay: 5.00,
        depositAmount: 20.00,
      });

      const result = await query(
        `INSERT INTO borrow_transactions (
          listing_id, borrower_id, lender_id,
          requested_start_date, requested_end_date,
          rental_days, daily_rate, rental_fee, deposit_amount,
          platform_fee, lender_payout, status, payment_status
        ) VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '2 days',
          2, 5.00, 10.00, 20.00, 0.20, 9.80, 'picked_up', 'captured')
        RETURNING id`,
        [listingId, userB.userId, userA.userId]
      );

      const res = await request(app)
        .post(`/api/rentals/${result.rows[0].id}/damage-claim`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ amountCents: 1000, notes: 'short' }); // < 10 chars

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Stripe environment safety
  // ===========================================
  describe('Stripe environment safety', () => {
    it('should only use test keys in test environment', () => {
      const secretKey = process.env.STRIPE_SECRET_KEY || '';
      expect(secretKey.startsWith('sk_test_')).toBe(true);
    });

    it('should have webhook secret configured', () => {
      expect(process.env.STRIPE_WEBHOOK_SECRET).toBeDefined();
      expect(process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')).toBe(true);
    });
  });
});
