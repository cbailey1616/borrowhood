/**
 * Saved Listings Route Tests
 * Tests: save, unsave, list, check
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, createTestListing, cleanupTestUser } from './helpers/stripe.js';

let app;
let userA, userB;
let listingId;
const createdUserIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/saved', module: '../../src/routes/saved.js' }
  );

  userA = await createTestUser({ email: `saved-a-${Date.now()}@borrowhood.test` });
  userB = await createTestUser({ email: `saved-b-${Date.now()}@borrowhood.test` });
  createdUserIds.push(userA.userId, userB.userId);

  listingId = await createTestListing(userB.userId, {
    title: 'Saveable Drill',
    isFree: true,
    visibility: 'close_friends',
  });
});

afterAll(async () => {
  try {
    await query('DELETE FROM saved_listings WHERE listing_id = $1', [listingId]);
    await query('DELETE FROM listing_photos WHERE listing_id = $1', [listingId]);
    await query('DELETE FROM listings WHERE id = $1', [listingId]);
  } catch (e) { /* */ }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('POST /api/saved/:listingId', () => {
  it('should save a listing', async () => {
    const res = await request(app)
      .post(`/api/saved/${listingId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.saved).toBe(true);

    // Verify in DB
    const saved = await query(
      'SELECT 1 FROM saved_listings WHERE user_id = $1 AND listing_id = $2',
      [userA.userId, listingId]
    );
    expect(saved.rows.length).toBe(1);
  });

  it('should handle duplicate save gracefully', async () => {
    const res = await request(app)
      .post(`/api/saved/${listingId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app)
      .post('/api/saved/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/saved', () => {
  it('should return saved listings', async () => {
    const res = await request(app)
      .get('/api/saved')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const saved = res.body[0];
    expect(saved.id).toBe(listingId);
    expect(saved.title).toBe('Saveable Drill');
    expect(saved.savedAt).toBeDefined();
    expect(saved.owner).toBeDefined();
    expect(saved.owner.firstName).toBeDefined();
  });

  it('should return empty for user with no saves', async () => {
    const res = await request(app)
      .get('/api/saved')
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/saved/check/:listingId', () => {
  it('should return saved=true for saved listing', async () => {
    const res = await request(app)
      .get(`/api/saved/check/${listingId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
  });

  it('should return saved=false for unsaved listing', async () => {
    const res = await request(app)
      .get(`/api/saved/check/${listingId}`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
  });
});

describe('DELETE /api/saved/:listingId', () => {
  it('should unsave a listing', async () => {
    const res = await request(app)
      .delete(`/api/saved/${listingId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.saved).toBe(false);

    // Verify removed from DB
    const saved = await query(
      'SELECT 1 FROM saved_listings WHERE user_id = $1 AND listing_id = $2',
      [userA.userId, listingId]
    );
    expect(saved.rows.length).toBe(0);
  });

  it('should handle unsave of non-saved listing gracefully', async () => {
    const res = await request(app)
      .delete(`/api/saved/${listingId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
  });
});
