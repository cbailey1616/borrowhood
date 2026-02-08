/**
 * Identity Verification Tests — Real Stripe Test API
 *
 * Tests Stripe Identity verification session creation, status polling,
 * and webhook-driven verification state transitions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createTestUser,
  createTestCustomer,
  createTestApp,
  cleanupTestUser,
  stripe,
  buildWebhookPayload,
  signWebhookPayload,
} from '../helpers/stripe.js';

describe('Identity Verification API', () => {
  let app;
  let unverifiedUser;
  let verifiedUser;
  let noCustomerUser;

  beforeAll(async () => {
    app = await createTestApp(
      { path: '/api/identity', module: '../../src/routes/identity.js' },
      { path: '/webhooks', module: '../../src/routes/webhooks.js' },
    );

    // User without Stripe customer (tests auto-creation)
    noCustomerUser = await createTestUser({
      email: `id-nocust-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'free',
      isVerified: false,
    });

    // User with Stripe customer (unverified)
    unverifiedUser = await createTestUser({
      email: `id-unver-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: false,
    });
    const customer = await createTestCustomer(unverifiedUser.userId, unverifiedUser.email);
    unverifiedUser.customerId = customer.id;

    // User already verified
    verifiedUser = await createTestUser({
      email: `id-ver-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: true,
      status: 'verified',
    });
    const verCust = await createTestCustomer(verifiedUser.userId, verifiedUser.email);
    verifiedUser.customerId = verCust.id;
  });

  afterAll(async () => {
    await cleanupTestUser(noCustomerUser.userId);
    await cleanupTestUser(unverifiedUser.userId);
    await cleanupTestUser(verifiedUser.userId);
  });

  // ===========================================
  // POST /api/identity/verify
  // ===========================================
  describe('POST /verify', () => {
    it('should create a verification session and return client_secret', async () => {
      const res = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', `Bearer ${unverifiedUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toBeDefined();
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.sessionId).toMatch(/^vs_/);

      // Store for later tests
      unverifiedUser.sessionId = res.body.sessionId;
    });

    it('should create Stripe customer if none exists', async () => {
      const res = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', `Bearer ${noCustomerUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toBeDefined();
      expect(res.body.sessionId).toBeDefined();

      // Verify customer was created in DB
      const { query } = await import('../../src/utils/db.js');
      const row = await query(
        'SELECT stripe_customer_id FROM users WHERE id = $1',
        [noCustomerUser.userId]
      );
      expect(row.rows[0].stripe_customer_id).toBeTruthy();
    });

    it('should reject if user is already verified', async () => {
      const res = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', `Bearer ${verifiedUser.token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Already verified/);
    });

    it('should require authentication', async () => {
      const res = await request(app).post('/api/identity/verify');
      expect(res.status).toBe(401);
    });

    it('should store session ID and set status to pending', async () => {
      const { query } = await import('../../src/utils/db.js');
      const row = await query(
        'SELECT stripe_identity_session_id, verification_status FROM users WHERE id = $1',
        [unverifiedUser.userId]
      );

      expect(row.rows[0].stripe_identity_session_id).toBe(unverifiedUser.sessionId);
      expect(row.rows[0].verification_status).toBe('pending');
    });
  });

  // ===========================================
  // GET /api/identity/status
  // ===========================================
  describe('GET /status', () => {
    it('should return status for user with pending session', async () => {
      const res = await request(app)
        .get('/api/identity/status')
        .set('Authorization', `Bearer ${unverifiedUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(false);
      // Stripe Identity test sessions start as requires_input
      expect(['pending', 'requires_input', 'processing']).toContain(res.body.status);
    });

    it('should return verified=true for verified user', async () => {
      const res = await request(app)
        .get('/api/identity/status')
        .set('Authorization', `Bearer ${verifiedUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
      expect(res.body.status).toBe('verified');
    });

    it('should return status=none for user without session', async () => {
      // Create a fresh user with no verification session
      const freshUser = await createTestUser({
        email: `id-fresh-${Date.now()}@borrowhood.test`,
        isVerified: false,
      });

      try {
        const res = await request(app)
          .get('/api/identity/status')
          .set('Authorization', `Bearer ${freshUser.token}`);

        expect(res.status).toBe(200);
        expect(res.body.verified).toBe(false);
        expect(res.body.status).toBe('none');
      } finally {
        await cleanupTestUser(freshUser.userId);
      }
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/identity/status');
      expect(res.status).toBe(401);
    });
  });

  // ===========================================
  // Webhook: identity.verification_session.verified
  // ===========================================
  describe('Webhook: identity.verification_session.verified', () => {
    it('should mark user as verified in DB', async () => {
      const { query } = await import('../../src/utils/db.js');

      // Create a fresh unverified user for this test
      const webhookUser = await createTestUser({
        email: `id-wh-${Date.now()}@borrowhood.test`,
        isVerified: false,
      });
      const whCustomer = await createTestCustomer(webhookUser.userId, webhookUser.email);

      try {
        const payload = buildWebhookPayload('identity.verification_session.verified', {
          id: 'vs_test_' + Date.now(),
          metadata: { customer_id: whCustomer.id, userId: webhookUser.userId },
          verified_outputs: {
            first_name: 'Test',
            last_name: 'Verified',
            dob: { year: 1990, month: 1, day: 1 },
            address: {
              line1: '123 Test St',
              city: 'TestCity',
              state: 'TS',
              postal_code: '12345',
            },
          },
        });

        const payloadStr = JSON.stringify(payload);
        const signature = signWebhookPayload(payloadStr, process.env.STRIPE_WEBHOOK_SECRET);

        const res = await request(app)
          .post('/webhooks/stripe')
          .set('stripe-signature', signature)
          .set('Content-Type', 'application/json')
          .send(payloadStr);

        expect(res.status).toBe(200);

        // Verify DB updated
        const row = await query(
          'SELECT is_verified, verification_status, verified_at FROM users WHERE id = $1',
          [webhookUser.userId]
        );
        expect(row.rows[0].is_verified).toBe(true);
        expect(row.rows[0].verification_status).toBe('verified');
        expect(row.rows[0].verified_at).toBeTruthy();
      } finally {
        await cleanupTestUser(webhookUser.userId);
      }
    });

    it('should update user name and address from verified outputs', async () => {
      const { query } = await import('../../src/utils/db.js');

      const webhookUser2 = await createTestUser({
        email: `id-wh2-${Date.now()}@borrowhood.test`,
        firstName: 'Old',
        lastName: 'Name',
        isVerified: false,
      });
      const whCust2 = await createTestCustomer(webhookUser2.userId, webhookUser2.email);

      try {
        const payload = buildWebhookPayload('identity.verification_session.verified', {
          id: 'vs_test_' + Date.now(),
          metadata: { customer_id: whCust2.id },
          verified_outputs: {
            first_name: 'RealFirst',
            last_name: 'RealLast',
            address: {
              line1: '456 Verified Ave',
              city: 'VerifiedCity',
              state: 'VS',
              postal_code: '99999',
            },
          },
        });

        const payloadStr = JSON.stringify(payload);
        const signature = signWebhookPayload(payloadStr, process.env.STRIPE_WEBHOOK_SECRET);

        await request(app)
          .post('/webhooks/stripe')
          .set('stripe-signature', signature)
          .set('Content-Type', 'application/json')
          .send(payloadStr);

        const row = await query(
          'SELECT first_name, last_name, city, state, zip_code FROM users WHERE id = $1',
          [webhookUser2.userId]
        );
        expect(row.rows[0].first_name).toBe('RealFirst');
        expect(row.rows[0].last_name).toBe('RealLast');
        expect(row.rows[0].city).toBe('VerifiedCity');
        expect(row.rows[0].state).toBe('VS');
        expect(row.rows[0].zip_code).toBe('99999');
      } finally {
        await cleanupTestUser(webhookUser2.userId);
      }
    });
  });

  // ===========================================
  // Webhook: identity.verification_session.requires_input
  // ===========================================
  describe('Webhook: identity.verification_session.requires_input', () => {
    it('should update verification_status to requires_input', async () => {
      const { query } = await import('../../src/utils/db.js');

      const failUser = await createTestUser({
        email: `id-fail-${Date.now()}@borrowhood.test`,
        isVerified: false,
      });
      const failCust = await createTestCustomer(failUser.userId, failUser.email);

      try {
        // Set verification_status to pending first
        await query(
          "UPDATE users SET verification_status = 'pending' WHERE id = $1",
          [failUser.userId]
        );

        const payload = buildWebhookPayload('identity.verification_session.requires_input', {
          id: 'vs_test_' + Date.now(),
          metadata: { customer_id: failCust.id },
        });

        const payloadStr = JSON.stringify(payload);
        const signature = signWebhookPayload(payloadStr, process.env.STRIPE_WEBHOOK_SECRET);

        const res = await request(app)
          .post('/webhooks/stripe')
          .set('stripe-signature', signature)
          .set('Content-Type', 'application/json')
          .send(payloadStr);

        expect(res.status).toBe(200);

        const row = await query(
          'SELECT verification_status, is_verified FROM users WHERE id = $1',
          [failUser.userId]
        );
        expect(row.rows[0].verification_status).toBe('requires_input');
        expect(row.rows[0].is_verified).toBe(false);
      } finally {
        await cleanupTestUser(failUser.userId);
      }
    });
  });
});
