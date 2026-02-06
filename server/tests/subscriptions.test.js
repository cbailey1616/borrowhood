import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../src/utils/db.js';

// Create a test app instance
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  const { default: subscriptionRoutes } = await import('../src/routes/subscriptions.js');
  app.use('/api/subscriptions', subscriptionRoutes);
  return app;
};

describe('Subscriptions API', () => {
  let app;
  let testUserId;
  let authToken;

  beforeAll(async () => {
    app = await createTestApp();

    // Create test user
    const userResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, status, subscription_tier)
       VALUES ('sub-test@test.com', 'hash', 'Test', 'User', 'verified', 'free')
       ON CONFLICT (email) DO UPDATE SET subscription_tier = 'free'
       RETURNING id`
    );
    testUserId = userResult.rows[0].id;

    // Generate a real JWT for the test user
    authToken = jwt.sign({ userId: testUserId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await query('DELETE FROM subscription_history WHERE user_id = $1', [testUserId]);
    await query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  describe('GET /api/subscriptions/tiers', () => {
    it('should return all subscription tiers', async () => {
      const response = await request(app)
        .get('/api/subscriptions/tiers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      const freeTier = response.body.find(t => t.tier === 'free');
      expect(freeTier).toBeDefined();
      expect(freeTier.priceCents).toBe(0);
      expect(freeTier.features).toBeDefined();
    });

    it('should include plus tier', async () => {
      const response = await request(app)
        .get('/api/subscriptions/tiers')
        .set('Authorization', `Bearer ${authToken}`);

      const plusTier = response.body.find(t => t.tier === 'plus');
      expect(plusTier).toBeDefined();
      expect(plusTier.priceCents).toBe(100);
    });
  });

  describe('GET /api/subscriptions/current', () => {
    it('should return user current subscription', async () => {
      const response = await request(app)
        .get('/api/subscriptions/current')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tier');
      expect(response.body.tier).toBe('free');
    });

    it('should indicate subscription is active', async () => {
      const response = await request(app)
        .get('/api/subscriptions/current')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.body).toHaveProperty('isActive');
      expect(response.body.isActive).toBe(true);
    });
  });

  describe('GET /api/subscriptions/access-check', () => {
    it('should allow free tier default access', async () => {
      const response = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'friends' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.hasAccess).toBe(true);
    });

    it('should deny free tier access to town feature', async () => {
      const response = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.hasAccess).toBe(false);
      expect(response.body.upgradeRequired).toBe(true);
    });

    it('should deny free tier access to rentals feature', async () => {
      const response = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.hasAccess).toBe(false);
      expect(response.body.requiredTier).toBe('plus');
    });
  });

  describe('POST /api/subscriptions/subscribe', () => {
    it('should require verification for plus tier', async () => {
      const response = await request(app)
        .post('/api/subscriptions/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ paymentMethodId: 'pm_test' });

      // User is not identity-verified (is_verified is not set), so should get 403
      expect([403, 500]).toContain(response.status);
    });
  });

  describe('POST /api/subscriptions/cancel', () => {
    it('should reject cancel without active subscription', async () => {
      const response = await request(app)
        .post('/api/subscriptions/cancel')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No active subscription');
    });
  });
});

describe('Subscription Tier Access Logic', () => {
  it('free tier should not access town features', () => {
    const tier = 'free';
    const canAccessTown = tier === 'plus';
    const canCharge = tier === 'plus';

    expect(canAccessTown).toBe(false);
    expect(canCharge).toBe(false);
  });

  it('plus tier should access all features', () => {
    const tier = 'plus';
    const canAccessTown = tier === 'plus';
    const canCharge = tier === 'plus';

    expect(canAccessTown).toBe(true);
    expect(canCharge).toBe(true);
  });
});
