/**
 * Discussions Route Tests
 * Tests: get discussions, post discussion, reply, delete
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, createTestListing, cleanupTestUser } from './helpers/stripe.js';

let app;
let owner, commenter, outsider;
let listingId;
let postId;
const createdUserIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/listings', module: '../../src/routes/discussions.js' }
  );

  owner = await createTestUser({ email: `disc-owner-${Date.now()}@borrowhood.test`, firstName: 'Disc', lastName: 'Owner' });
  commenter = await createTestUser({ email: `disc-comm-${Date.now()}@borrowhood.test`, firstName: 'Disc', lastName: 'Commenter' });
  outsider = await createTestUser({ email: `disc-out-${Date.now()}@borrowhood.test`, firstName: 'Disc', lastName: 'Outsider' });
  createdUserIds.push(owner.userId, commenter.userId, outsider.userId);

  listingId = await createTestListing(owner.userId, {
    title: 'Discussion Test Drill',
    isFree: true,
    visibility: 'close_friends',
  });
});

afterAll(async () => {
  try {
    await query('DELETE FROM listing_discussions WHERE listing_id = $1', [listingId]);
    await query('DELETE FROM notifications WHERE user_id = ANY($1)', [createdUserIds]);
    await query('DELETE FROM listing_photos WHERE listing_id = $1', [listingId]);
    await query('DELETE FROM listings WHERE id = $1', [listingId]);
  } catch (e) { /* */ }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('POST /api/listings/:listingId/discussions', () => {
  it('should create a top-level discussion post', async () => {
    const res = await request(app)
      .post(`/api/listings/${listingId}/discussions`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ content: 'Is this drill cordless?' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.content).toBe('Is this drill cordless?');
    expect(res.body.parentId).toBeNull();
    expect(res.body.user.firstName).toBe('Disc');
    postId = res.body.id;

    // Verify notification sent to owner
    const notif = await query(
      "SELECT type FROM notifications WHERE user_id = $1 AND type = 'listing_comment'",
      [owner.userId]
    );
    expect(notif.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('should create a reply to a post', async () => {
    const res = await request(app)
      .post(`/api/listings/${listingId}/discussions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ content: 'Yes, it is cordless!', parentId: postId });

    expect(res.status).toBe(201);
    expect(res.body.parentId).toBe(postId);

    // Verify notification sent to original poster
    const notif = await query(
      "SELECT type FROM notifications WHERE user_id = $1 AND type = 'discussion_reply'",
      [commenter.userId]
    );
    expect(notif.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('should not send notification when replying to own post', async () => {
    // Clear existing notifications
    await query("DELETE FROM notifications WHERE user_id = $1 AND type = 'listing_comment'", [owner.userId]);

    // Owner posts on own listing (no notification to self)
    const res = await request(app)
      .post(`/api/listings/${listingId}/discussions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ content: 'Update: battery included!' });

    expect(res.status).toBe(201);

    // Should not have created a listing_comment notification for owner
    const notif = await query(
      "SELECT type FROM notifications WHERE user_id = $1 AND type = 'listing_comment'",
      [owner.userId]
    );
    expect(notif.rows.length).toBe(0);
  });

  it('should reject empty content', async () => {
    const res = await request(app)
      .post(`/api/listings/${listingId}/discussions`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ content: '' });

    expect(res.status).toBe(400);
  });

  it('should reject post on non-existent listing', async () => {
    const res = await request(app)
      .post('/api/listings/00000000-0000-0000-0000-000000000000/discussions')
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ content: 'Ghost post' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/listings/:listingId/discussions', () => {
  it('should return top-level discussion posts', async () => {
    const res = await request(app)
      .get(`/api/listings/${listingId}/discussions`)
      .set('Authorization', `Bearer ${commenter.token}`);

    expect(res.status).toBe(200);
    expect(res.body.posts).toBeDefined();
    expect(res.body.posts.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);

    const post = res.body.posts.find(p => p.id === postId);
    expect(post).toBeDefined();
    expect(post.content).toBe('Is this drill cordless?');
    expect(post.user).toBeDefined();
    expect(post.user.firstName).toBe('Disc');
  });
});

describe('GET /api/listings/:listingId/discussions/:postId/replies', () => {
  it('should return replies to a post', async () => {
    const res = await request(app)
      .get(`/api/listings/${listingId}/discussions/${postId}/replies`)
      .set('Authorization', `Bearer ${commenter.token}`);

    expect(res.status).toBe(200);
    expect(res.body.replies).toBeDefined();
    expect(res.body.replies.length).toBeGreaterThanOrEqual(1);
    const reply = res.body.replies.find(r => r.content === 'Yes, it is cordless!');
    expect(reply).toBeDefined();
  });
});

describe('DELETE /api/listings/:listingId/discussions/:postId', () => {
  it('should soft delete by post author', async () => {
    const res = await request(app)
      .delete(`/api/listings/${listingId}/discussions/${postId}`)
      .set('Authorization', `Bearer ${commenter.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify soft delete (is_hidden = true)
    const post = await query('SELECT is_hidden FROM listing_discussions WHERE id = $1', [postId]);
    expect(post.rows[0].is_hidden).toBe(true);
  });

  it('should reject delete by non-owner non-listing-owner', async () => {
    // Create a new post to test
    const postRes = await request(app)
      .post(`/api/listings/${listingId}/discussions`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ content: 'Another question' });

    const res = await request(app)
      .delete(`/api/listings/${listingId}/discussions/${postRes.body.id}`)
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(res.status).toBe(403);
  });

  it('should allow listing owner to delete any post', async () => {
    // Create a post by commenter
    const postRes = await request(app)
      .post(`/api/listings/${listingId}/discussions`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ content: 'Offensive question' });

    const res = await request(app)
      .delete(`/api/listings/${listingId}/discussions/${postRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
