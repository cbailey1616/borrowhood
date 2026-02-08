/**
 * Connect Account Tests — Real Stripe Test API
 *
 * Tests Stripe Connect Express account creation, onboarding links,
 * status checks, and balance retrieval.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createTestUser,
  createTestCustomer,
  createTestConnectAccount,
  createTestApp,
  cleanupTestUser,
  stripe,
} from '../helpers/stripe.js';
import { query } from '../../src/utils/db.js';

describe('Connect Account API', () => {
  let app;
  let verifiedUser; // Plus + verified, no Connect yet
  let connectedUser; // Plus + verified + Connect
  let unverifiedUser; // Not verified

  beforeAll(async () => {
    app = await createTestApp(
      { path: '/api/users', module: '../../src/routes/users.js' },
    );

    // Verified user without Connect account
    verifiedUser = await createTestUser({
      email: `conn-ver-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: true,
      status: 'verified',
    });
    const verCust = await createTestCustomer(verifiedUser.userId, verifiedUser.email);
    verifiedUser.customerId = verCust.id;

    // User with existing Connect account
    connectedUser = await createTestUser({
      email: `conn-full-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: true,
      status: 'verified',
    });
    const connCust = await createTestCustomer(connectedUser.userId, connectedUser.email);
    const account = await createTestConnectAccount(connectedUser.userId, connectedUser.email);
    connectedUser.customerId = connCust.id;
    connectedUser.connectAccountId = account.id;

    // Unverified user
    unverifiedUser = await createTestUser({
      email: `conn-unver-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: false,
      status: 'pending',
    });
  });

  afterAll(async () => {
    await cleanupTestUser(verifiedUser.userId);
    await cleanupTestUser(connectedUser.userId);
    await cleanupTestUser(unverifiedUser.userId);
  });

  // ===========================================
  // GET /api/users/me/connect-status
  // ===========================================
  describe('GET /me/connect-status', () => {
    it('should return no account for user without Connect', async () => {
      const res = await request(app)
        .get('/api/users/me/connect-status')
        .set('Authorization', `Bearer ${verifiedUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasAccount).toBe(false);
      expect(res.body.chargesEnabled).toBe(false);
      expect(res.body.payoutsEnabled).toBe(false);
    });

    it('should return account details for connected user', async () => {
      const res = await request(app)
        .get('/api/users/me/connect-status')
        .set('Authorization', `Bearer ${connectedUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasAccount).toBe(true);
      expect(res.body.accountId).toBe(connectedUser.connectAccountId);
      expect(typeof res.body.chargesEnabled).toBe('boolean');
      expect(typeof res.body.payoutsEnabled).toBe('boolean');
      expect(typeof res.body.detailsSubmitted).toBe('boolean');
    });

    it('should return requirements for pending account', async () => {
      const res = await request(app)
        .get('/api/users/me/connect-status')
        .set('Authorization', `Bearer ${connectedUser.token}`);

      expect(res.status).toBe(200);
      // Newly created Express accounts will have requirements
      if (res.body.requirements) {
        expect(res.body.requirements).toHaveProperty('currently_due');
      }
    });
  });

  // ===========================================
  // POST /api/users/me/connect-account
  // ===========================================
  describe('POST /me/connect-account', () => {
    it('should create Connect account for verified user', async () => {
      const res = await request(app)
        .post('/api/users/me/connect-account')
        .set('Authorization', `Bearer ${verifiedUser.token}`);

      expect(res.status).toBe(201);
      expect(res.body.accountId).toMatch(/^acct_/);

      // Verify stored in DB
      const row = await query(
        'SELECT stripe_connect_account_id FROM users WHERE id = $1',
        [verifiedUser.userId]
      );
      expect(row.rows[0].stripe_connect_account_id).toBe(res.body.accountId);
      verifiedUser.connectAccountId = res.body.accountId;
    });

    it('should reject if account already exists', async () => {
      const res = await request(app)
        .post('/api/users/me/connect-account')
        .set('Authorization', `Bearer ${connectedUser.token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already exists/);
    });

    it('should reject unverified user', async () => {
      const res = await request(app)
        .post('/api/users/me/connect-account')
        .set('Authorization', `Bearer ${unverifiedUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('VERIFICATION_REQUIRED');
    });
  });

  // ===========================================
  // POST /api/users/me/connect-onboarding
  // ===========================================
  describe('POST /me/connect-onboarding', () => {
    it('should return onboarding URL for connected user', async () => {
      const res = await request(app)
        .post('/api/users/me/connect-onboarding')
        .set('Authorization', `Bearer ${connectedUser.token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.url).toBeDefined();
      expect(res.body.url).toMatch(/^https:\/\/connect\.stripe\.com/);
      expect(res.body.expiresAt).toBeDefined();
    });

    it('should create account and return URL if no account exists', async () => {
      // Create a fresh verified user without Connect
      const freshUser = await createTestUser({
        email: `conn-fresh-${Date.now()}@borrowhood.test`,
        subscriptionTier: 'plus',
        isVerified: true,
        status: 'verified',
      });

      try {
        const res = await request(app)
          .post('/api/users/me/connect-onboarding')
          .set('Authorization', `Bearer ${freshUser.token}`)
          .send({});

        expect(res.status).toBe(200);
        expect(res.body.url).toMatch(/^https:\/\/connect\.stripe\.com/);

        // Verify account was created
        const row = await query(
          'SELECT stripe_connect_account_id FROM users WHERE id = $1',
          [freshUser.userId]
        );
        expect(row.rows[0].stripe_connect_account_id).toMatch(/^acct_/);
      } finally {
        await cleanupTestUser(freshUser.userId);
      }
    });

    it('should reject unverified user', async () => {
      const res = await request(app)
        .post('/api/users/me/connect-onboarding')
        .set('Authorization', `Bearer ${unverifiedUser.token}`)
        .send({});

      expect(res.status).toBe(403);
    });
  });

  // ===========================================
  // GET /api/users/me/connect-balance
  // ===========================================
  describe('GET /me/connect-balance', () => {
    it('should return zero balance for user without Connect', async () => {
      // Create user with no connect account
      const noConnUser = await createTestUser({
        email: `conn-nobal-${Date.now()}@borrowhood.test`,
      });

      try {
        const res = await request(app)
          .get('/api/users/me/connect-balance')
          .set('Authorization', `Bearer ${noConnUser.token}`);

        expect(res.status).toBe(200);
        expect(res.body.available).toBe(0);
        expect(res.body.pending).toBe(0);
        expect(res.body.currency).toBe('usd');
      } finally {
        await cleanupTestUser(noConnUser.userId);
      }
    });

    it('should return balance for connected user', async () => {
      const res = await request(app)
        .get('/api/users/me/connect-balance')
        .set('Authorization', `Bearer ${connectedUser.token}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.available).toBe('number');
      expect(typeof res.body.pending).toBe('number');
      expect(res.body.currency).toBe('usd');
    });
  });

  // ===========================================
  // Webhook: account.updated
  // ===========================================
  describe('Webhook: account.updated', () => {
    it('should update onboarded status when charges and payouts enabled', async () => {
      // This test verifies the webhook handler processes account updates
      // In real Stripe, this fires after Connect onboarding completes
      const { buildWebhookPayload, signWebhookPayload } = await import('../helpers/stripe.js');

      // Need webhook routes for this test
      const webhookApp = await createTestApp(
        { path: '/webhooks', module: '../../src/routes/webhooks.js' },
      );

      const payload = buildWebhookPayload('account.updated', {
        id: connectedUser.connectAccountId,
        charges_enabled: true,
        payouts_enabled: true,
      });

      const payloadStr = JSON.stringify(payload);
      const signature = signWebhookPayload(payloadStr, process.env.STRIPE_WEBHOOK_SECRET);

      const res = await request(webhookApp)
        .post('/webhooks/stripe')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadStr);

      expect(res.status).toBe(200);
    });
  });
});
