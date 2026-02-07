import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../src/utils/db.js';

const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  const { default: requestRoutes } = await import('../src/routes/requests.js');
  app.use('/api/requests', requestRoutes);
  return app;
};

describe('Requests API', () => {
  let app;
  let testUserId;
  let testOtherUserId;
  let testCommunityId;
  let testCategoryId;
  let authToken;
  let otherAuthToken;

  beforeAll(async () => {
    app = await createTestApp();

    // Create test community
    const communityResult = await query(
      `INSERT INTO communities (name, slug, description, city, state)
       VALUES ('Test Community', 'test-community-req', 'For testing', 'TestCity', 'MA')
       RETURNING id`
    );
    testCommunityId = communityResult.rows[0].id;

    // Create test category
    const categoryResult = await query(
      `INSERT INTO categories (name, slug, icon, sort_order)
       VALUES ('Test Category', 'test-category-req', 'hammer-outline', 99)
       ON CONFLICT (slug) DO UPDATE SET name = 'Test Category'
       RETURNING id`
    );
    testCategoryId = categoryResult.rows[0].id;

    // Create test users
    const userResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, status)
       VALUES ('requester@test.com', 'hash', 'Test', 'Requester', 'verified')
       RETURNING id`
    );
    testUserId = userResult.rows[0].id;

    const otherResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, status)
       VALUES ('other-req@test.com', 'hash', 'Other', 'User', 'verified')
       RETURNING id`
    );
    testOtherUserId = otherResult.rows[0].id;

    // Add both users to community
    await query(
      `INSERT INTO community_memberships (user_id, community_id) VALUES ($1, $2), ($3, $2)`,
      [testUserId, testCommunityId, testOtherUserId]
    );

    authToken = jwt.sign({ userId: testUserId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    otherAuthToken = jwt.sign({ userId: testOtherUserId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await query('DELETE FROM item_requests WHERE user_id IN ($1, $2)', [testUserId, testOtherUserId]);
    await query('DELETE FROM community_memberships WHERE user_id IN ($1, $2)', [testUserId, testOtherUserId]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId, testOtherUserId]);
    await query('DELETE FROM communities WHERE id = $1', [testCommunityId]);
    await query(`DELETE FROM categories WHERE slug = 'test-category-req'`);
  });

  describe('POST /api/requests (create with expiration)', () => {
    it('should create a request with default 1-day expiry', async () => {
      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Need a ladder',
          categoryId: testCategoryId,
          communityId: testCommunityId,
          visibility: 'neighborhood',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');

      // Verify expires_at was set
      const dbResult = await query(
        'SELECT expires_at FROM item_requests WHERE id = $1',
        [response.body.id]
      );
      expect(dbResult.rows[0].expires_at).toBeTruthy();

      // Should be roughly 1 day from now (within 5 seconds)
      const expiresAt = new Date(dbResult.rows[0].expires_at);
      const expectedExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });

    it('should create a request with 3-day expiry', async () => {
      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Need a drill (3d)',
          categoryId: testCategoryId,
          communityId: testCommunityId,
          visibility: 'neighborhood',
          expiresIn: '3d',
        });

      expect(response.status).toBe(201);

      const dbResult = await query(
        'SELECT expires_at FROM item_requests WHERE id = $1',
        [response.body.id]
      );
      const expiresAt = new Date(dbResult.rows[0].expires_at);
      const expectedExpiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });

    it('should create a request with 1-week expiry', async () => {
      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Need a saw (1w)',
          categoryId: testCategoryId,
          communityId: testCommunityId,
          visibility: 'neighborhood',
          expiresIn: '1w',
        });

      expect(response.status).toBe(201);

      const dbResult = await query(
        'SELECT expires_at FROM item_requests WHERE id = $1',
        [response.body.id]
      );
      const expiresAt = new Date(dbResult.rows[0].expires_at);
      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });
  });

  describe('GET /api/requests (feed filtering)', () => {
    let activeRequestId;
    let expiredRequestId;

    beforeAll(async () => {
      // Create an active request from the other user (so it shows in our feed)
      const activeResult = await query(
        `INSERT INTO item_requests (user_id, community_id, category_id, title, visibility, status, expires_at)
         VALUES ($1, $2, $3, 'Active request', 'neighborhood', 'open', NOW() + INTERVAL '1 day')
         RETURNING id`,
        [testOtherUserId, testCommunityId, testCategoryId]
      );
      activeRequestId = activeResult.rows[0].id;

      // Create an expired request from the other user
      const expiredResult = await query(
        `INSERT INTO item_requests (user_id, community_id, category_id, title, visibility, status, expires_at)
         VALUES ($1, $2, $3, 'Expired request', 'neighborhood', 'open', NOW() - INTERVAL '1 hour')
         RETURNING id`,
        [testOtherUserId, testCommunityId, testCategoryId]
      );
      expiredRequestId = expiredResult.rows[0].id;
    });

    it('should show active requests in the feed', async () => {
      const response = await request(app)
        .get('/api/requests')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.map(r => r.id);
      expect(ids).toContain(activeRequestId);
    });

    it('should hide expired requests from the feed', async () => {
      const response = await request(app)
        .get('/api/requests')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.map(r => r.id);
      expect(ids).not.toContain(expiredRequestId);
    });
  });

  describe('GET /api/requests/mine', () => {
    it('should return all requests including expired with isExpired flag', async () => {
      // Create an expired request for the test user
      await query(
        `INSERT INTO item_requests (user_id, community_id, category_id, title, visibility, status, expires_at)
         VALUES ($1, $2, $3, 'My expired request', 'neighborhood', 'open', NOW() - INTERVAL '1 hour')`,
        [testUserId, testCommunityId, testCategoryId]
      );

      const response = await request(app)
        .get('/api/requests/mine')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      const expired = response.body.find(r => r.title === 'My expired request');
      expect(expired).toBeTruthy();
      expect(expired.isExpired).toBe(true);
      expect(expired.expiresAt).toBeTruthy();

      // Active requests should have isExpired = false
      const active = response.body.find(r => r.title === 'Need a ladder');
      if (active) {
        expect(active.isExpired).toBe(false);
      }
    });
  });

  describe('POST /api/requests/:id/renew', () => {
    let expiredRequestId;

    beforeAll(async () => {
      const result = await query(
        `INSERT INTO item_requests (user_id, community_id, category_id, title, visibility, status, expires_at)
         VALUES ($1, $2, $3, 'Request to renew', 'neighborhood', 'open', NOW() - INTERVAL '1 hour')
         RETURNING id`,
        [testUserId, testCommunityId, testCategoryId]
      );
      expiredRequestId = result.rows[0].id;
    });

    it('should renew an expired request with default 1-day duration', async () => {
      const response = await request(app)
        .post(`/api/requests/${expiredRequestId}/renew`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify expires_at was reset
      const dbResult = await query(
        'SELECT expires_at FROM item_requests WHERE id = $1',
        [expiredRequestId]
      );
      const expiresAt = new Date(dbResult.rows[0].expires_at);
      expect(expiresAt > new Date()).toBe(true);

      const expectedExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });

    it('should renew with a custom duration', async () => {
      // Expire it again first
      await query(
        `UPDATE item_requests SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
        [expiredRequestId]
      );

      const response = await request(app)
        .post(`/api/requests/${expiredRequestId}/renew`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ expiresIn: '1w' });

      expect(response.status).toBe(200);

      const dbResult = await query(
        'SELECT expires_at FROM item_requests WHERE id = $1',
        [expiredRequestId]
      );
      const expiresAt = new Date(dbResult.rows[0].expires_at);
      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });

    it('should reject renew from non-owner', async () => {
      const response = await request(app)
        .post(`/api/requests/${expiredRequestId}/renew`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .send({});

      expect(response.status).toBe(403);
    });

    it('should reject renew on closed requests', async () => {
      // Close the request
      await query(
        `UPDATE item_requests SET status = 'closed' WHERE id = $1`,
        [expiredRequestId]
      );

      const response = await request(app)
        .post(`/api/requests/${expiredRequestId}/renew`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);

      // Restore for cleanup
      await query(
        `UPDATE item_requests SET status = 'open' WHERE id = $1`,
        [expiredRequestId]
      );
    });

    it('should return 404 for non-existent request', async () => {
      const response = await request(app)
        .post('/api/requests/00000000-0000-0000-0000-000000000000/renew')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(404);
    });
  });
});
