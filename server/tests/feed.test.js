/**
 * Feed Route Tests
 * Tests: combined feed, type filtering, search, visibility
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, createTestListing, cleanupTestUser } from './helpers/stripe.js';
import { createTestCommunity, addCommunityMember, createFriendship } from './helpers/fixtures.js';

let app;
let freeUser, verifiedPlusUser;
let communityId;
const createdUserIds = [];
const createdListingIds = [];
const createdRequestIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/feed', module: '../../src/routes/feed.js' }
  );

  freeUser = await createTestUser({
    email: `feed-free-${Date.now()}@borrowhood.test`,
    city: 'FeedCity',
    state: 'FC',
  });
  verifiedPlusUser = await createTestUser({
    email: `feed-vp-${Date.now()}@borrowhood.test`,
    subscriptionTier: 'plus',
    isVerified: true,
    status: 'verified',
    city: 'FeedCity',
    state: 'FC',
  });
  createdUserIds.push(freeUser.userId, verifiedPlusUser.userId);

  // Community
  communityId = await createTestCommunity({ name: 'Feed Neighborhood', city: 'FeedCity', state: 'FC' });
  await addCommunityMember(freeUser.userId, communityId, 'member');
  await addCommunityMember(verifiedPlusUser.userId, communityId, 'member');

  // Friendship for close_friends visibility
  await createFriendship(freeUser.userId, verifiedPlusUser.userId);

  // Create listings with different visibility
  const neighborhoodListing = await createTestListing(verifiedPlusUser.userId, {
    title: 'Feed Neighborhood Drill',
    isFree: true,
    visibility: 'neighborhood',
  });
  await query('UPDATE listings SET community_id = $1 WHERE id = $2', [communityId, neighborhoodListing]);
  createdListingIds.push(neighborhoodListing);

  const closeFriendListing = await createTestListing(verifiedPlusUser.userId, {
    title: 'Feed Friend Camera',
    isFree: true,
    visibility: 'close_friends',
  });
  createdListingIds.push(closeFriendListing);

  // Create a request
  const reqResult = await query(
    `INSERT INTO item_requests (user_id, community_id, title, description, status)
     VALUES ($1, $2, 'Looking for a ladder', 'Need a ladder for weekend', 'open')
     RETURNING id`,
    [freeUser.userId, communityId]
  );
  createdRequestIds.push(reqResult.rows[0].id);
});

afterAll(async () => {
  for (const lid of createdListingIds) {
    try {
      await query('DELETE FROM listing_photos WHERE listing_id = $1', [lid]);
      await query('DELETE FROM listings WHERE id = $1', [lid]);
    } catch (e) { /* */ }
  }
  for (const rid of createdRequestIds) {
    try { await query('DELETE FROM item_requests WHERE id = $1', [rid]); } catch (e) { /* */ }
  }
  try {
    await query('DELETE FROM friendships WHERE user_id = ANY($1) OR friend_id = ANY($1)', [createdUserIds]);
    await query('DELETE FROM community_memberships WHERE community_id = $1', [communityId]);
    await query('DELETE FROM communities WHERE id = $1', [communityId]);
  } catch (e) { /* */ }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('GET /api/feed', () => {
  it('should return combined listings and requests', async () => {
    const res = await request(app)
      .get('/api/feed')
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it('should filter by type=listings', async () => {
    const res = await request(app)
      .get('/api/feed?type=listings')
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(200);
    res.body.items.forEach(item => {
      expect(item.type).toBe('listing');
    });
  });

  it('should filter by type=requests', async () => {
    const res = await request(app)
      .get('/api/feed?type=requests')
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(200);
    res.body.items.forEach(item => {
      expect(item.type).toBe('request');
    });
  });

  it('should filter by search term', async () => {
    const res = await request(app)
      .get('/api/feed?search=ladder')
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(200);
    // Should include the ladder request
    const ladder = res.body.items.find(i => i.title && i.title.toLowerCase().includes('ladder'));
    expect(ladder).toBeDefined();
  });

  it('should reject town visibility for free user', async () => {
    const res = await request(app)
      .get('/api/feed?visibility=town')
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('should allow town visibility for verified Plus user', async () => {
    const res = await request(app)
      .get('/api/feed?visibility=town')
      .set('Authorization', `Bearer ${verifiedPlusUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
  });

  it('should include neighborhood listings', async () => {
    const res = await request(app)
      .get('/api/feed?visibility=neighborhood')
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(200);
    const drill = res.body.items.find(i => i.title === 'Feed Neighborhood Drill');
    expect(drill).toBeDefined();
  });
});
