/**
 * Subscription Gating Tests
 *
 * Tests the middleware and access-control gates:
 * - requireSubscription middleware
 * - requireVerified middleware
 * - Combined gate logic for town access and rental listing
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
  createTestUser,
  createTestCustomer,
  cleanupTestUser,
} from '../helpers/stripe.js';
import { query } from '../../src/utils/db.js';
import { authenticate, requireVerified, requireSubscription } from '../../src/middleware/auth.js';

describe('Subscription Gating', () => {
  let app;
  let freeUser;
  let plusUnverified;
  let plusVerified;
  let plusVerifiedConnect;

  beforeAll(async () => {
    // Build a lightweight test app with gated routes
    app = express();
    app.use(express.json());

    // Import subscription routes for access-check
    const { default: subscriptionRoutes } = await import('../../src/routes/subscriptions.js');
    app.use('/api/subscriptions', subscriptionRoutes);

    // Custom test routes to exercise middleware directly
    app.get('/test/auth-only', authenticate, (req, res) => {
      res.json({ ok: true, userId: req.user.id });
    });
    app.get('/test/verified', authenticate, requireVerified, (req, res) => {
      res.json({ ok: true });
    });
    app.get('/test/subscribed', authenticate, requireSubscription, (req, res) => {
      res.json({ ok: true });
    });
    app.get('/test/sub-and-verified', authenticate, requireSubscription, requireVerified, (req, res) => {
      res.json({ ok: true });
    });

    // Create test users with different states
    freeUser = await createTestUser({
      email: `gate-free-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'free',
      isVerified: false,
      status: 'pending',
    });

    plusUnverified = await createTestUser({
      email: `gate-plus-unver-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: false,
      status: 'pending',
    });

    plusVerified = await createTestUser({
      email: `gate-plus-ver-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: true,
      status: 'verified',
    });

    plusVerifiedConnect = await createTestUser({
      email: `gate-plus-conn-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: true,
      status: 'verified',
    });
    // Set a fake Connect account ID in DB — gating tests only check the DB field
    await query(
      "UPDATE users SET stripe_connect_account_id = 'acct_test_gating' WHERE id = $1",
      [plusVerifiedConnect.userId]
    );
    plusVerifiedConnect.connectAccountId = 'acct_test_gating';
  });

  afterAll(async () => {
    await cleanupTestUser(freeUser.userId);
    await cleanupTestUser(plusUnverified.userId);
    await cleanupTestUser(plusVerified.userId);
    await cleanupTestUser(plusVerifiedConnect.userId);
  });

  // ===========================================
  // requireSubscription middleware
  // ===========================================
  describe('requireSubscription middleware', () => {
    it('should block free users', async () => {
      const res = await request(app)
        .get('/test/subscribed')
        .set('Authorization', `Bearer ${freeUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('should allow plus users', async () => {
      const res = await request(app)
        .get('/test/subscribed')
        .set('Authorization', `Bearer ${plusUnverified.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ===========================================
  // requireVerified middleware
  // ===========================================
  describe('requireVerified middleware', () => {
    it('should block unverified users', async () => {
      const res = await request(app)
        .get('/test/verified')
        .set('Authorization', `Bearer ${freeUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('VERIFICATION_REQUIRED');
    });

    it('should allow verified users', async () => {
      const res = await request(app)
        .get('/test/verified')
        .set('Authorization', `Bearer ${plusVerified.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ===========================================
  // Combined middleware: subscription + verified
  // ===========================================
  describe('requireSubscription + requireVerified', () => {
    it('should block free unverified user (subscription check first)', async () => {
      const res = await request(app)
        .get('/test/sub-and-verified')
        .set('Authorization', `Bearer ${freeUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('should block plus unverified user (verification check)', async () => {
      const res = await request(app)
        .get('/test/sub-and-verified')
        .set('Authorization', `Bearer ${plusUnverified.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('VERIFICATION_REQUIRED');
    });

    it('should allow plus verified user', async () => {
      const res = await request(app)
        .get('/test/sub-and-verified')
        .set('Authorization', `Bearer ${plusVerified.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ===========================================
  // access-check endpoint — gate progression
  // ===========================================
  describe('access-check gate progression', () => {
    it('free user → town: nextStep=subscription', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${freeUser.token}`);

      expect(res.body.nextStep).toBe('subscription');
      expect(res.body.canAccess).toBe(false);
    });

    it('plus unverified → town: nextStep=verification', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${plusUnverified.token}`);

      expect(res.body.nextStep).toBe('verification');
      expect(res.body.isSubscribed).toBe(true);
      expect(res.body.isVerified).toBe(false);
    });

    it('plus verified → town: nextStep=null (fully gated)', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${plusVerified.token}`);

      expect(res.body.nextStep).toBeNull();
      expect(res.body.canAccess).toBe(true);
    });

    it('free → rentals: nextStep=subscription', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${freeUser.token}`);

      expect(res.body.nextStep).toBe('subscription');
    });

    it('plus unverified → rentals: nextStep=verification', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${plusUnverified.token}`);

      expect(res.body.nextStep).toBe('verification');
    });

    it('plus verified no-connect → rentals: nextStep=connect', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${plusVerified.token}`);

      expect(res.body.nextStep).toBe('connect');
      expect(res.body.hasConnect).toBe(false);
    });

    it('plus verified with-connect → rentals: nextStep=null', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${plusVerifiedConnect.token}`);

      expect(res.body.nextStep).toBeNull();
      expect(res.body.canAccess).toBe(true);
      expect(res.body.hasConnect).toBe(true);
    });
  });

  // ===========================================
  // Authentication edge cases
  // ===========================================
  describe('Authentication edge cases', () => {
    it('should reject missing token', async () => {
      const res = await request(app).get('/test/auth-only');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/No token/);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/test/auth-only')
        .set('Authorization', 'Bearer invalid.token.here');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should reject expired token', async () => {
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.default.sign(
        { userId: freeUser.userId },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );

      // Small delay to ensure expiration
      await new Promise(r => setTimeout(r, 100));

      const res = await request(app)
        .get('/test/auth-only')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Token expired/);
    });
  });
});
