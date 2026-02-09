/**
 * Friends & Users Route Tests
 * Tests: friend requests, accept/decline, search, contacts/match, profile update, verified field locking
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, cleanupTestUser } from './helpers/stripe.js';
import { createTestCommunity, addCommunityMember } from './helpers/fixtures.js';

let app;
let userA, userB, userC, verifiedUser;
let communityId;
const createdUserIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/users', module: '../../src/routes/users.js' }
  );

  userA = await createTestUser({
    email: `friend-a-${Date.now()}@borrowhood.test`,
    firstName: 'Alice',
    lastName: 'Friend',
    city: 'FriendCity',
    state: 'FS',
  });
  userB = await createTestUser({
    email: `friend-b-${Date.now()}@borrowhood.test`,
    firstName: 'Bob',
    lastName: 'Buddy',
    city: 'FriendCity',
    state: 'FS',
  });
  userC = await createTestUser({
    email: `friend-c-${Date.now()}@borrowhood.test`,
    firstName: 'Charlie',
    lastName: 'Contact',
    city: 'FriendCity',
    state: 'FS',
  });
  verifiedUser = await createTestUser({
    email: `verified-friend-${Date.now()}@borrowhood.test`,
    firstName: 'Vera',
    lastName: 'Verified',
    isVerified: true,
    status: 'verified',
  });
  createdUserIds.push(userA.userId, userB.userId, userC.userId, verifiedUser.userId);

  // Set phone for contact matching
  await query('UPDATE users SET phone = $1 WHERE id = $2', ['5551234567', userC.userId]);

  // Create a community with userA and userB for suggested users
  communityId = await createTestCommunity({ name: 'Friend Community', city: 'FriendCity', state: 'FS' });
  await addCommunityMember(userA.userId, communityId, 'member');
  await addCommunityMember(userB.userId, communityId, 'member');
});

afterAll(async () => {
  try {
    await query('DELETE FROM friendships WHERE user_id = ANY($1) OR friend_id = ANY($1)', [createdUserIds]);
    await query('DELETE FROM community_memberships WHERE community_id = $1', [communityId]);
    await query('DELETE FROM communities WHERE id = $1', [communityId]);
  } catch (e) { /* */ }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('POST /api/users/me/friends', () => {
  it('should send a friend request (status: pending)', async () => {
    const res = await request(app)
      .post('/api/users/me/friends')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ friendId: userB.userId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');

    // Verify in DB
    const friendship = await query(
      "SELECT status FROM friendships WHERE user_id = $1 AND friend_id = $2",
      [userA.userId, userB.userId]
    );
    expect(friendship.rows[0].status).toBe('pending');
  });

  it('should reject adding yourself as friend', async () => {
    const res = await request(app)
      .post('/api/users/me/friends')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ friendId: userA.userId });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('yourself');
  });

  it('should auto-accept if other user already sent request', async () => {
    // userA already sent request to userB above; now userB sends request to userA
    const res = await request(app)
      .post('/api/users/me/friends')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ friendId: userA.userId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('accepted');
  });

  it('should return already_friends for existing friendship', async () => {
    const res = await request(app)
      .post('/api/users/me/friends')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ friendId: userB.userId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('already_friends');
  });
});

describe('GET /api/users/me/friends', () => {
  it('should return only accepted friends', async () => {
    const res = await request(app)
      .get('/api/users/me/friends')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const bob = res.body.find(f => f.id === userB.userId);
    expect(bob).toBeDefined();
    expect(bob.firstName).toBe('Bob');
  });
});

describe('GET /api/users/me/friend-requests', () => {
  it('should return pending friend requests', async () => {
    // userC sends request to userA
    await query(
      "INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING",
      [userC.userId, userA.userId]
    );

    const res = await request(app)
      .get('/api/users/me/friend-requests')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    const req = res.body.find(r => r.id === userC.userId);
    expect(req).toBeDefined();
    expect(req.firstName).toBe('Charlie');
    expect(req.requestId).toBeDefined();
  });
});

describe('POST /api/users/me/friend-requests/:requestId/accept', () => {
  it('should accept a friend request and create bidirectional friendship', async () => {
    // Get the request ID from DB
    const reqResult = await query(
      "SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'",
      [userC.userId, userA.userId]
    );
    const requestId = reqResult.rows[0].id;

    const res = await request(app)
      .post(`/api/users/me/friend-requests/${requestId}/accept`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify bidirectional
    const forward = await query(
      "SELECT status FROM friendships WHERE user_id = $1 AND friend_id = $2",
      [userC.userId, userA.userId]
    );
    expect(forward.rows[0].status).toBe('accepted');

    const reverse = await query(
      "SELECT status FROM friendships WHERE user_id = $1 AND friend_id = $2",
      [userA.userId, userC.userId]
    );
    expect(reverse.rows[0].status).toBe('accepted');
  });

  it('should return 404 for non-existent request', async () => {
    const res = await request(app)
      .post('/api/users/me/friend-requests/00000000-0000-0000-0000-000000000000/accept')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/users/me/friend-requests/:requestId/decline', () => {
  it('should decline a friend request and remove it', async () => {
    // Create a pending request from verifiedUser to userA
    const insertResult = await query(
      "INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'pending') RETURNING id",
      [verifiedUser.userId, userA.userId]
    );
    const requestId = insertResult.rows[0].id;

    const res = await request(app)
      .post(`/api/users/me/friend-requests/${requestId}/decline`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify removed from DB
    const check = await query('SELECT id FROM friendships WHERE id = $1', [requestId]);
    expect(check.rows.length).toBe(0);
  });
});

describe('DELETE /api/users/me/friends/:friendId', () => {
  it('should remove friendship in both directions', async () => {
    // userA and userC are friends from above
    const res = await request(app)
      .delete(`/api/users/me/friends/${userC.userId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify both directions removed
    const check = await query(
      'SELECT id FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
      [userA.userId, userC.userId]
    );
    expect(check.rows.length).toBe(0);
  });
});

describe('GET /api/users/search', () => {
  it('should search users by name', async () => {
    const res = await request(app)
      .get('/api/users/search?q=Alice')
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    const found = res.body.find(u => u.id === userA.userId);
    expect(found).toBeDefined();
    expect(found.firstName).toBe('Alice');
  });

  it('should return empty for query shorter than 2 chars', async () => {
    const res = await request(app)
      .get('/api/users/search?q=A')
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should not include self in results', async () => {
    const res = await request(app)
      .get('/api/users/search?q=Bob')
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    const self = res.body.find(u => u.id === userB.userId);
    expect(self).toBeUndefined();
  });
});

describe('POST /api/users/contacts/match', () => {
  it('should match users by phone number', async () => {
    const res = await request(app)
      .post('/api/users/contacts/match')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ phoneNumbers: ['+1 (555) 123-4567'] });

    expect(res.status).toBe(200);
    const match = res.body.find(u => u.id === userC.userId);
    expect(match).toBeDefined();
    expect(match.firstName).toBe('Charlie');
  });

  it('should return empty for no matching numbers', async () => {
    const res = await request(app)
      .post('/api/users/contacts/match')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ phoneNumbers: ['0000000000'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should return empty for missing phoneNumbers', async () => {
    const res = await request(app)
      .post('/api/users/contacts/match')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PATCH /api/users/me', () => {
  it('should update profile fields', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ bio: 'Hello from tests!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify in DB
    const user = await query('SELECT bio FROM users WHERE id = $1', [userA.userId]);
    expect(user.rows[0].bio).toBe('Hello from tests!');
  });

  it('should reject name change for verified user', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${verifiedUser.token}`)
      .send({ firstName: 'NewName' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('locked');
  });

  it('should reject city/state change for verified user', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${verifiedUser.token}`)
      .send({ city: 'NewCity' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('locked');
  });

  it('should reject empty update', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/users/suggested', () => {
  it('should return suggested users from same community', async () => {
    const res = await request(app)
      .get(`/api/users/suggested?neighborhood=${communityId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // userA should not see themselves
    const self = res.body.find(u => u.id === userA.userId);
    expect(self).toBeUndefined();
  });
});

describe('GET /api/users/:id', () => {
  it('should return user profile', async () => {
    const res = await request(app)
      .get(`/api/users/${userA.userId}`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Alice');
    expect(res.body.lastName).toBe('Friend');
  });

  it('should return 404 for non-existent user', async () => {
    const res = await request(app)
      .get('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(404);
  });
});
