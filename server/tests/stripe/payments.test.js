/**
 * Payments Tests — Real Stripe Test API
 *
 * Tests PaymentIntent creation, amount validation, refunds,
 * and ownership-gated refund authorization.
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
  TEST_CARDS,
} from '../helpers/stripe.js';

describe('Payments API', () => {
  let app;
  let userA; // Will create payments
  let userB; // Different user for ownership checks

  beforeAll(async () => {
    app = await createTestApp(
      { path: '/api/payments', module: '../../src/routes/payments.js' },
    );

    // User A — has payment method
    userA = await createTestUser({
      email: `pay-a-${Date.now()}@borrowhood.test`,
    });
    const custA = await createTestCustomer(userA.userId, userA.email);
    await attachTestPaymentMethod(custA.id);
    userA.customerId = custA.id;

    // User B — different user
    userB = await createTestUser({
      email: `pay-b-${Date.now()}@borrowhood.test`,
    });
    const custB = await createTestCustomer(userB.userId, userB.email);
    await attachTestPaymentMethod(custB.id);
    userB.customerId = custB.id;
  });

  afterAll(async () => {
    await cleanupTestUser(userA.userId);
    await cleanupTestUser(userB.userId);
  });

  // ===========================================
  // POST /api/payments/create-payment-intent
  // ===========================================
  describe('POST /create-payment-intent', () => {
    it('should create PaymentIntent with correct amount', async () => {
      const res = await request(app)
        .post('/api/payments/create-payment-intent')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ amount: 1000, description: 'Test payment' });

      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toBeDefined();
      expect(res.body.paymentIntentId).toMatch(/^pi_/);
      expect(res.body.customerId).toBe(userA.customerId);
      expect(res.body.ephemeralKey).toBeDefined();

      // Verify the PI amount on Stripe
      const pi = await stripe.paymentIntents.retrieve(res.body.paymentIntentId);
      expect(pi.amount).toBe(1000);
      expect(pi.currency).toBe('usd');
      expect(pi.metadata.userId).toBe(userA.userId);

      // Store for refund test
      userA.paymentIntentId = res.body.paymentIntentId;
    });

    it('should accept metadata in the payment intent', async () => {
      const res = await request(app)
        .post('/api/payments/create-payment-intent')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          amount: 500,
          metadata: { itemId: 'test-item-123', type: 'rental' },
        });

      expect(res.status).toBe(200);
      const pi = await stripe.paymentIntents.retrieve(res.body.paymentIntentId);
      expect(pi.metadata.itemId).toBe('test-item-123');
      expect(pi.metadata.type).toBe('rental');
    });

    it('should reject amount below Stripe minimum ($0.50)', async () => {
      const res = await request(app)
        .post('/api/payments/create-payment-intent')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ amount: 49 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Amount must be/);
    });

    it('should reject amount above maximum ($9,999)', async () => {
      const res = await request(app)
        .post('/api/payments/create-payment-intent')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ amount: 999901 });

      expect(res.status).toBe(400);
    });

    it('should reject non-integer amounts', async () => {
      const res = await request(app)
        .post('/api/payments/create-payment-intent')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ amount: 10.50 });

      expect(res.status).toBe(400);
    });

    it('should auto-create Stripe customer if none exists', async () => {
      const noCustUser = await createTestUser({
        email: `pay-nocust-${Date.now()}@borrowhood.test`,
      });

      try {
        const res = await request(app)
          .post('/api/payments/create-payment-intent')
          .set('Authorization', `Bearer ${noCustUser.token}`)
          .send({ amount: 500 });

        expect(res.status).toBe(200);
        expect(res.body.customerId).toMatch(/^cus_/);
      } finally {
        await cleanupTestUser(noCustUser.userId);
      }
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/payments/create-payment-intent')
        .send({ amount: 1000 });

      expect(res.status).toBe(401);
    });
  });

  // ===========================================
  // POST /api/payments/refund
  // ===========================================
  describe('POST /refund', () => {
    let confirmedPiId;

    beforeAll(async () => {
      // Create and confirm a payment intent for refund tests
      const pi = await stripe.paymentIntents.create({
        amount: 2000,
        currency: 'usd',
        customer: userA.customerId,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        confirm: true,
        payment_method: (await stripe.paymentMethods.list({
          customer: userA.customerId,
          type: 'card',
        })).data[0].id,
        metadata: { userId: userA.userId },
      });
      confirmedPiId = pi.id;
    });

    it('should process full refund for own payment', async () => {
      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ paymentIntentId: confirmedPiId });

      expect(res.status).toBe(200);
      expect(res.body.refundId).toMatch(/^re_/);
      expect(res.body.status).toBe('succeeded');
      expect(res.body.amount).toBe(2000);
    });

    it('should reject refund for another user\'s payment', async () => {
      // Create a payment for userA, then try to refund as userB
      const pi = await stripe.paymentIntents.create({
        amount: 500,
        currency: 'usd',
        customer: userA.customerId,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        confirm: true,
        payment_method: (await stripe.paymentMethods.list({
          customer: userA.customerId,
          type: 'card',
        })).data[0].id,
        metadata: { userId: userA.userId },
      });

      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ paymentIntentId: pi.id });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Not authorized/);
    });

    it('should reject refund without paymentIntentId', async () => {
      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/paymentIntentId is required/);
    });

    it('should reject invalid partial refund amount', async () => {
      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ paymentIntentId: confirmedPiId, amount: -100 });

      expect(res.status).toBe(400);
    });

    it('should process partial refund', async () => {
      // Create and confirm another payment for partial refund
      const pi = await stripe.paymentIntents.create({
        amount: 3000,
        currency: 'usd',
        customer: userA.customerId,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        confirm: true,
        payment_method: (await stripe.paymentMethods.list({
          customer: userA.customerId,
          type: 'card',
        })).data[0].id,
        metadata: { userId: userA.userId },
      });

      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ paymentIntentId: pi.id, amount: 1500 });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(1500);
    });
  });
});
