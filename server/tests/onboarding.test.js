import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../src/utils/db.js';

const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  const { default: onboardingRoutes } = await import('../src/routes/onboarding.js');
  const { default: communityRoutes } = await import('../src/routes/communities.js');
  const { default: userRoutes } = await import('../src/routes/users.js');
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/communities', communityRoutes);
  app.use('/api/users', userRoutes);
  return app;
};

describe('Onboarding API', () => {
  let app;
  let testUserId;
  let testOtherUserId;
  let testCommunityId;
  let authToken;
  let otherAuthToken;

  beforeAll(async () => {
    app = await createTestApp();

    // Create test users with city/state for community creation
    const userResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, status, city, state, onboarding_completed)
       VALUES ('onboard-test@test.com', 'hash', 'Onboard', 'Tester', 'pending', 'TestCity', 'MA', false)
       RETURNING id`
    );
    testUserId = userResult.rows[0].id;

    const otherResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, status, city, state, onboarding_completed)
       VALUES ('onboard-other@test.com', 'hash', 'Other', 'User', 'pending', 'TestCity', 'MA', false)
       RETURNING id`
    );
    testOtherUserId = otherResult.rows[0].id;

    // Create a test community
    const communityResult = await query(
      `INSERT INTO communities (name, slug, description, city, state)
       VALUES ('Onboard Test Neighborhood', 'onboard-test-hood', 'For testing', 'TestCity', 'MA')
       RETURNING id`
    );
    testCommunityId = communityResult.rows[0].id;

    // Add other user to community
    await query(
      `INSERT INTO community_memberships (user_id, community_id) VALUES ($1, $2)`,
      [testOtherUserId, testCommunityId]
    );

    authToken = jwt.sign({ userId: testUserId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    otherAuthToken = jwt.sign({ userId: testOtherUserId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await query('DELETE FROM community_memberships WHERE user_id IN ($1, $2)', [testUserId, testOtherUserId]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId, testOtherUserId]);
    await query('DELETE FROM communities WHERE id = $1', [testCommunityId]);
  });

  // ==========================================
  // PATCH /api/onboarding/step
  // ==========================================
  describe('PATCH /api/onboarding/step', () => {
    it('should update onboarding step to valid value', async () => {
      const res = await request(app)
        .patch('/api/onboarding/step')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ step: 3 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify persisted
      const user = await query('SELECT onboarding_step FROM users WHERE id = $1', [testUserId]);
      expect(user.rows[0].onboarding_step).toBe(3);
    });

    it('should reject step below 1', async () => {
      const res = await request(app)
        .patch('/api/onboarding/step')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ step: 0 });

      expect(res.status).toBe(400);
    });

    it('should reject step above 5', async () => {
      const res = await request(app)
        .patch('/api/onboarding/step')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ step: 6 });

      expect(res.status).toBe(400);
    });

    it('should reject non-integer step', async () => {
      const res = await request(app)
        .patch('/api/onboarding/step')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ step: 'abc' });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch('/api/onboarding/step')
        .send({ step: 2 });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // POST /api/onboarding/complete
  // ==========================================
  describe('POST /api/onboarding/complete', () => {
    it('should mark onboarding as completed', async () => {
      const res = await request(app)
        .post('/api/onboarding/complete')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify persisted
      const user = await query(
        'SELECT onboarding_completed, onboarding_step FROM users WHERE id = $1',
        [testUserId]
      );
      expect(user.rows[0].onboarding_completed).toBe(true);
      expect(user.rows[0].onboarding_step).toBe(5);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/onboarding/complete');

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // GET /api/communities/nearby
  // ==========================================
  describe('GET /api/communities/nearby', () => {
    it('should return communities matching user city when no PostGIS', async () => {
      const res = await request(app)
        .get('/api/communities/nearby?lat=42.36&lng=-71.06')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should find our test community since user is in TestCity
    });

    it('should require lat and lng', async () => {
      const res = await request(app)
        .get('/api/communities/nearby')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
    });

    it('should return empty array for user with no city', async () => {
      // Create user with no city
      const noCityResult = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, status)
         VALUES ('nocity-onboard@test.com', 'hash', 'No', 'City', 'pending')
         RETURNING id`
      );
      const noCityToken = jwt.sign(
        { userId: noCityResult.rows[0].id },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/communities/nearby?lat=42.36&lng=-71.06')
        .set('Authorization', `Bearer ${noCityToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);

      // Cleanup
      await query('DELETE FROM users WHERE id = $1', [noCityResult.rows[0].id]);
    });
  });

  // ==========================================
  // POST /api/communities (with coordinates)
  // ==========================================
  describe('POST /api/communities (enhanced)', () => {
    let createdCommunityId;

    afterAll(async () => {
      if (createdCommunityId) {
        await query('DELETE FROM community_memberships WHERE community_id = $1', [createdCommunityId]);
        await query('DELETE FROM communities WHERE id = $1', [createdCommunityId]);
      }
    });

    it('should create community with coordinates', async () => {
      const res = await request(app)
        .post('/api/communities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Geo Neighborhood',
          description: 'Created with coords',
          latitude: 42.36,
          longitude: -71.06,
          radius: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.isFounder).toBe(true);
      createdCommunityId = res.body.id;

      // Verify user marked as founder
      const user = await query('SELECT is_founder FROM users WHERE id = $1', [testUserId]);
      expect(user.rows[0].is_founder).toBe(true);
    });

    it('should reject invalid radius', async () => {
      const res = await request(app)
        .post('/api/communities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Bad Radius Hood',
          latitude: 42.36,
          longitude: -71.06,
          radius: 10, // Too large (max 2)
        });

      expect(res.status).toBe(400);
    });

    it('should create community without coordinates (fallback)', async () => {
      const res = await request(app)
        .post('/api/communities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'No Coords Neighborhood' });

      expect(res.status).toBe(201);

      // Cleanup
      await query('DELETE FROM community_memberships WHERE community_id = $1', [res.body.id]);
      await query('DELETE FROM communities WHERE id = $1', [res.body.id]);
    });
  });

  // ==========================================
  // GET /api/users/suggested
  // ==========================================
  describe('GET /api/users/suggested', () => {
    it('should return users in same neighborhood', async () => {
      // Add test user to community first
      await query(
        `INSERT INTO community_memberships (user_id, community_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [testUserId, testCommunityId]
      );

      const res = await request(app)
        .get(`/api/users/suggested?neighborhood=${testCommunityId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should find the other user
      const found = res.body.find(u => u.id === testOtherUserId);
      expect(found).toBeDefined();
      expect(found.firstName).toBe('Other');
    });

    it('should exclude self from results', async () => {
      const res = await request(app)
        .get(`/api/users/suggested?neighborhood=${testCommunityId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const self = res.body.find(u => u.id === testUserId);
      expect(self).toBeUndefined();
    });

    it('should return empty when no neighborhood specified and user not in any', async () => {
      // Create isolated user
      const isoResult = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, status)
         VALUES ('isolated-onboard@test.com', 'hash', 'Iso', 'User', 'pending')
         RETURNING id`
      );
      const isoToken = jwt.sign(
        { userId: isoResult.rows[0].id },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/users/suggested')
        .set('Authorization', `Bearer ${isoToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);

      // Cleanup
      await query('DELETE FROM users WHERE id = $1', [isoResult.rows[0].id]);
    });
  });
});
