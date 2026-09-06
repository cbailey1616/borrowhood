/**
 * Listings Route Tests
 * Tests: browse, mine, detail, create, update, delete, analyze-image, visibility gating
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, createTestListing, cleanupTestUser, createTestCategory } from './helpers/stripe.js';
import { createTestCommunity, addCommunityMember, createFriendship } from './helpers/fixtures.js';

// Mock image analysis before importing routes
vi.mock('../src/services/imageAnalysis.js', () => ({
  analyzeItemImage: vi.fn().mockResolvedValue({
    title: 'Power Drill',
    description: 'A cordless power drill in good condition',
    condition: 'good',
    category: 'Tools',
    suggestedPrice: 8.00,
  }),
}));

let app;
let freeUser, plusUser, verifiedPlusUser;
let communityId, categoryId;
let analysisFile;
const photo = user => `https://borrowhood-uploads.s3.us-east-1.amazonaws.com/listings/${user.userId}/test.jpg`;
const createdUserIds = [];
const createdListingIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/listings', module: '../../src/routes/listings.js' }
  );

  freeUser = await createTestUser({
    email: `listing-free-${Date.now()}@borrowhood.test`,
    subscriptionTier: 'free',
    city: 'ListCity',
    state: 'LS',
  });
  plusUser = await createTestUser({
    email: `listing-plus-${Date.now()}@borrowhood.test`,
    subscriptionTier: 'plus',
    isVerified: false,
    city: 'ListCity',
    state: 'LS',
  });
  verifiedPlusUser = await createTestUser({
    email: `listing-vplus-${Date.now()}@borrowhood.test`,
    subscriptionTier: 'plus',
    isVerified: true,
    status: 'verified',
    city: 'ListCity',
    state: 'LS',
  });
  createdUserIds.push(freeUser.userId, plusUser.userId, verifiedPlusUser.userId);
  await mkdir('uploads', { recursive: true });
  analysisFile = `private-listing-${freeUser.userId}-release-test.png`;
  await writeFile(`uploads/${analysisFile}`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));

  // Create community and category
  communityId = await createTestCommunity({ name: 'Listing Neighborhood', city: 'ListCity', state: 'LS' });
  await addCommunityMember(freeUser.userId, communityId, 'member');
  await addCommunityMember(plusUser.userId, communityId, 'member');
  await addCommunityMember(verifiedPlusUser.userId, communityId, 'organizer');

  categoryId = await createTestCategory('Electronics', `electronics-${Date.now()}`);

  // Create friendship between free and verifiedPlus
  await createFriendship(freeUser.userId, verifiedPlusUser.userId);
});

afterAll(async () => {
  if (analysisFile) await unlink(`uploads/${analysisFile}`);
  for (const lid of createdListingIds) {
    try {
      await query('DELETE FROM listing_photos WHERE listing_id = $1', [lid]);
      await query('DELETE FROM listings WHERE id = $1', [lid]);
    } catch (e) { /* */ }
  }
  try {
    await query('DELETE FROM friendships WHERE user_id = ANY($1) OR friend_id = ANY($1)', [createdUserIds]);
    await query('DELETE FROM community_memberships WHERE community_id = $1', [communityId]);
    await query('DELETE FROM communities WHERE id = $1', [communityId]);
    await query('DELETE FROM categories WHERE id = $1', [categoryId]);
  } catch (e) { /* */ }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('POST /api/listings', () => {
  it('should create a free listing without Plus', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({
        sharingConfirmed: true,
        title: 'Free Garden Hose',
        description: 'A garden hose, free to borrow',
        condition: 'good',
        categoryId,
        isFree: true,
        visibility: ['close_friends'],
        photos: [photo(freeUser)],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    createdListingIds.push(res.body.id);
  });

  it('should reject in-app rental charging while payments are disabled', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({
        sharingConfirmed: true,
        title: 'Paid Camera',
        condition: 'like_new',
        categoryId,
        isFree: false,
        pricePerDay: 15.00,
        depositAmount: 100.00,
        visibility: ['close_friends'],
        photos: [photo(freeUser)],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PAYMENTS_DISABLED');
  });

  it('should store an optional offline price without Stripe or Plus', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${plusUser.token}`)
      .send({
        sharingConfirmed: true,
        title: 'Plus User Camera',
        condition: 'good',
        categoryId,
        isFree: true,
        directFee: { amount: 10, unit: 'day' },
        visibility: ['neighborhood'],
        communityId,
        photos: [photo(plusUser)],
      });

    expect(res.status).toBe(201);
    const stored = await query('SELECT direct_fee FROM listings WHERE id = $1', [res.body.id]);
    expect(stored.rows[0].direct_fee).toEqual({ amount: 10, unit: 'day', currency: 'USD' });
    createdListingIds.push(res.body.id);
  });

  it('should create a town listing for an unverified free user', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({
        sharingConfirmed: true,
        title: 'Town Item',
        condition: 'good',
        categoryId,
        isFree: true,
        visibility: ['town'],
        photos: [photo(freeUser)],
      });

    expect(res.status).toBe(201);
    createdListingIds.push(res.body.id);
  });

  it('should create a town listing without verification or a paid plan', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${plusUser.token}`)
      .send({
        sharingConfirmed: true,
        title: 'Unverified Town Item',
        condition: 'good',
        categoryId,
        isFree: true,
        visibility: ['town'],
        photos: [photo(plusUser)],
      });

    expect(res.status).toBe(201);
    createdListingIds.push(res.body.id);
  });

  it('should create town listing for verified Plus user', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${verifiedPlusUser.token}`)
      .send({
        sharingConfirmed: true,
        title: 'Town Power Washer',
        condition: 'good',
        categoryId,
        isFree: true,
        visibility: ['town'],
        photos: [photo(verifiedPlusUser)],
      });

    expect(res.status).toBe(201);
    createdListingIds.push(res.body.id);
  });

  it('should reject neighborhood visibility without communityId', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({
        sharingConfirmed: true,
        title: 'No Community Item',
        condition: 'fair',
        categoryId,
        isFree: true,
        visibility: ['neighborhood'],
        photos: [photo(freeUser)],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Join a neighborhood');
  });

  it('should reject missing photos', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({
        sharingConfirmed: true,
        title: 'No Photo Item',
        condition: 'good',
        categoryId,
        isFree: true,
        visibility: ['close_friends'],
        photos: [],
      });

    expect(res.status).toBe(400);
  });

  it('should reject title shorter than 3 characters', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({
        sharingConfirmed: true,
        title: 'AB',
        condition: 'good',
        categoryId,
        isFree: true,
        visibility: ['close_friends'],
        photos: [photo(freeUser)],
      });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/listings/mine', () => {
  it('should return current user\'s listings', async () => {
    const res = await request(app)
      .get('/api/listings/mine')
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const hose = res.body.find(l => l.title === 'Free Garden Hose');
    expect(hose).toBeDefined();
    expect(hose.isFree).toBe(true);
  });
});

describe('GET /api/listings/:id', () => {
  it('should return listing details', async () => {
    const listingId = createdListingIds[0];
    const res = await request(app)
      .get(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(listingId);
    expect(res.body.title).toBe('Free Garden Hose');
    expect(res.body.isOwner).toBe(true);
    expect(res.body.owner).toBeDefined();
    expect(res.body.photos).toBeDefined();
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app)
      .get('/api/listings/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/listings/:id', () => {
  it('should update listing by owner', async () => {
    const listingId = createdListingIds[0];
    const res = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({ title: 'Updated Garden Hose' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify in DB
    const listing = await query('SELECT title FROM listings WHERE id = $1', [listingId]);
    expect(listing.rows[0].title).toBe('Updated Garden Hose');
  });

  it('should reject update by non-owner with 403', async () => {
    const listingId = createdListingIds[0];
    const res = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${plusUser.token}`)
      .send({ title: 'Stolen Title' });

    expect(res.status).toBe(403);
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app)
      .patch('/api/listings/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({ title: 'Ghost' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/listings/:id', () => {
  it('should soft delete listing by owner', async () => {
    // Create a listing to delete
    const listingId = await createTestListing(freeUser.userId, {
      title: 'To Delete',
      isFree: true,
      visibility: 'close_friends',
    });
    createdListingIds.push(listingId);

    const res = await request(app)
      .delete(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify soft delete in DB
    const listing = await query('SELECT status FROM listings WHERE id = $1', [listingId]);
    expect(listing.rows[0].status).toBe('deleted');
  });

  it('should return 404 when deleting by non-owner', async () => {
    const listingId = createdListingIds[1]; // plusUser's listing
    const res = await request(app)
      .delete(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${freeUser.token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/listings/analyze-image', () => {
  it('should return AI analysis results (mocked)', async () => {
    const res = await request(app)
      .post('/api/listings/analyze-image')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({ imageUrl: `${process.env.API_URL}/uploads/${analysisFile}` });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Power Drill');
    expect(res.body.condition).toBe('good');
    expect(res.body.suggestedPrice).toBe(8.00);
  });

  it('should reject invalid URL', async () => {
    const res = await request(app)
      .post('/api/listings/analyze-image')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({ imageUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/listings (browse)', () => {
  it('should return active listings', async () => {
    const res = await request(app)
      .get('/api/listings')
      .set('Authorization', `Bearer ${plusUser.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
