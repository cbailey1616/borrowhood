/**
 * Feed Route Tests
 * Tests: combined feed, type filtering, search, visibility
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, createTestListing, cleanupTestUser } from './helpers/stripe.js';
import { createTestCommunity, addCommunityMember, createFriendship } from './helpers/fixtures.js';
import { randomUUID } from 'node:crypto';

let app;
let freeUser, verifiedPlusUser;
let communityId;
let ownListing, ownRequest;
const createdUserIds = [];
const createdListingIds = [];
const createdRequestIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/feed', module: '../../src/routes/feed.js' },
    { path: '/api/listings', module: '../../src/routes/listings.js' },
    { path: '/api/requests', module: '../../src/routes/requests.js' }
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
    [verifiedPlusUser.userId, communityId]
  );
  createdRequestIds.push(reqResult.rows[0].id);
  ownListing = await createTestListing(freeUser.userId, { title: 'My own ladder', isFree: true, visibility: 'close_friends' });
  createdListingIds.push(ownListing);
  ownRequest = (await query(`INSERT INTO item_requests(user_id,community_id,title,visibility,status)
    VALUES($1,$2,'My own ladder request','close_friends','open') RETURNING id`, [freeUser.userId, communityId])).rows[0].id;
  createdRequestIds.push(ownRequest);
});

afterAll(async () => {
  await query('DELETE FROM feed_sessions WHERE user_id = ANY($1::uuid[])', [createdUserIds]);
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
  it('excludes your listings and requests across Home, search and tabs, while preserving My Posts', async () => {
    for (const suffix of ['', '?layout=sections', '?search=ladder', '?type=requests', '?type=listings']) {
      const response = await request(app).get('/api/feed' + suffix).set('Authorization', `Bearer ${freeUser.token}`);
      expect(response.status).toBe(200);
      const posts = [...response.body.items, ...(response.body.requests || [])];
      expect(posts.some(post => [ownListing, ownRequest].includes(post.id))).toBe(false);
    }
    const listings = await request(app).get('/api/listings/mine').set('Authorization', `Bearer ${freeUser.token}`);
    const requests = await request(app).get('/api/requests/mine').set('Authorization', `Bearer ${freeUser.token}`);
    expect(listings.status).toBe(200);
    expect(requests.status).toBe(200);
    expect(JSON.stringify(listings.body)).toContain(ownListing);
    expect(JSON.stringify(requests.body)).toContain(ownRequest);
  });

  it('skips hidden pages in an existing session without shifting or repeating the remaining posts', async () => {
    const token = randomUUID();
    const keys = [createdListingIds[0], ownListing, ownListing, createdListingIds[1], ownListing].map(id => `listing:${id}`);
    await query('INSERT INTO feed_sessions(user_id,token,filter_key,item_keys) VALUES($1,$2,$3,$4)',
      [freeUser.userId, token, JSON.stringify(['', '', '', '', true]), JSON.stringify(keys)]);
    const getPage = page => request(app).get(`/api/feed?layout=sections&session=${token}&limit=1&page=${page}`)
      .set('Authorization', `Bearer ${freeUser.token}`);
    const first = await getPage(1);
    expect(first.status).toBe(200);
    expect(first.body.items.map(item => item.id)).toEqual([createdListingIds[0]]);
    expect(first.body.hasMore).toBe(true);
    const next = await getPage(2);
    expect(next.status).toBe(200);
    expect(next.body.items.map(item => item.id)).toEqual([createdListingIds[1]]);
    expect(next.body.page).toBe(4);
    expect(next.body.hasMore).toBe(false);
  });
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

  it('should return an empty town filter without exposing town listings to unverified users', async () => {
    const res = await request(app)
      .get('/api/feed?visibility=town')
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
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
