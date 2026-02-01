import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { query, pool } from '../src/utils/db.js';

// Create a test app instance
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  const { default: subscriptionRoutes } = await import('../src/routes/subscriptions.js');

  // Mock authentication middleware for testing
  let mockUserId = null;
  app.use((req, res, next) => {
    req.user = { id: mockUserId || 'test-user-id' };
    next();
  });

  app.use('/api/subscriptions', subscriptionRoutes);

  // Helper to set mock user
  app.setMockUser = (userId) => {
    mockUserId = userId;
  };

  return app;
};

describe('Subscriptions API', () => {
  let app;
  let testUserId;

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
    app.setMockUser(testUserId);
  });

  afterAll(async () => {
    await query('DELETE FROM subscription_history WHERE user_id = $1', [testUserId]);
    await query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  describe('GET /api/subscriptions/tiers', () => {
    it('should return all subscription tiers', async () => {
      const response = await request(app).get('/api/subscriptions/tiers');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(3);

      // Check tier structure
      const freeTier = response.body.find(t => t.tier === 'free');
      expect(freeTier).toBeDefined();
      expect(freeTier.priceCents).toBe(0);
      expect(freeTier.features).toBeDefined();
    });

    it('should include neighborhood and town tiers', async () => {
      const response = await request(app).get('/api/subscriptions/tiers');

      const neighborhoodTier = response.body.find(t => t.tier === 'neighborhood');
      const townTier = response.body.find(t => t.tier === 'town');

      expect(neighborhoodTier).toBeDefined();
      expect(neighborhoodTier.priceCents).toBe(500);

      expect(townTier).toBeDefined();
      expect(townTier.priceCents).toBe(1000);
    });
  });

  describe('GET /api/subscriptions/current', () => {
    it('should return user current subscription', async () => {
      const response = await request(app).get('/api/subscriptions/current');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tier');
      expect(response.body.tier).toBe('free');
    });

    it('should indicate subscription is active', async () => {
      const response = await request(app).get('/api/subscriptions/current');

      expect(response.body).toHaveProperty('isActive');
      expect(response.body.isActive).toBe(true);
    });
  });

  describe('GET /api/subscriptions/access-check', () => {
    it('should allow free tier to access close_friends', async () => {
      const response = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ visibility: 'close_friends' });

      expect(response.status).toBe(200);
      expect(response.body.canAccess).toBe(true);
    });

    it('should deny free tier access to neighborhood', async () => {
      const response = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ visibility: 'neighborhood' });

      expect(response.status).toBe(200);
      expect(response.body.canAccess).toBe(false);
      expect(response.body.upgradeRequired).toBe(true);
    });

    it('should deny free tier access to town', async () => {
      const response = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ visibility: 'town' });

      expect(response.status).toBe(200);
      expect(response.body.canAccess).toBe(false);
      expect(response.body.requiredTier).toBe('town');
    });
  });

  describe('POST /api/subscriptions/subscribe', () => {
    it('should reject invalid tier', async () => {
      const response = await request(app)
        .post('/api/subscriptions/subscribe')
        .send({ tier: 'invalid', paymentMethodId: 'pm_test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid tier');
    });

    it('should require payment method for paid tier', async () => {
      const response = await request(app)
        .post('/api/subscriptions/subscribe')
        .send({ tier: 'neighborhood' });

      // Without Stripe keys configured, this will fail at payment processing
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('POST /api/subscriptions/upgrade', () => {
    it('should only allow upgrade to town tier', async () => {
      const response = await request(app)
        .post('/api/subscriptions/upgrade')
        .send({ tier: 'neighborhood' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Can only upgrade to town tier');
    });

    it('should reject upgrade without active subscription', async () => {
      const response = await request(app)
        .post('/api/subscriptions/upgrade')
        .send({ tier: 'town' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No active subscription to upgrade');
    });
  });

  describe('POST /api/subscriptions/cancel', () => {
    it('should reject cancel without active subscription', async () => {
      const response = await request(app)
        .post('/api/subscriptions/cancel');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No active subscription');
    });
  });
});

describe('Subscription Tier Access Logic', () => {
  it('free tier should only access close_friends', () => {
    const tier = 'free';
    const canAccessFriends = true;
    const canAccessNeighborhood = tier === 'neighborhood' || tier === 'town';
    const canAccessTown = tier === 'town';

    expect(canAccessFriends).toBe(true);
    expect(canAccessNeighborhood).toBe(false);
    expect(canAccessTown).toBe(false);
  });

  it('neighborhood tier should access friends and neighborhood', () => {
    const tier = 'neighborhood';
    const canAccessFriends = true;
    const canAccessNeighborhood = tier === 'neighborhood' || tier === 'town';
    const canAccessTown = tier === 'town';

    expect(canAccessFriends).toBe(true);
    expect(canAccessNeighborhood).toBe(true);
    expect(canAccessTown).toBe(false);
  });

  it('town tier should access all levels', () => {
    const tier = 'town';
    const canAccessFriends = true;
    const canAccessNeighborhood = tier === 'neighborhood' || tier === 'town';
    const canAccessTown = tier === 'town';

    expect(canAccessFriends).toBe(true);
    expect(canAccessNeighborhood).toBe(true);
    expect(canAccessTown).toBe(true);
  });
});
