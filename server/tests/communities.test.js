/**
 * Communities Route Tests
 * Tests: list, nearby, detail, create, join, leave, members, add-admin
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, cleanupTestUser, createTestListing } from './helpers/stripe.js';
import { createTestCommunity, addCommunityMember } from './helpers/fixtures.js';

let app;
let userA, userB, userC;
let communityId;
const createdUserIds = [];
const createdCommunityIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/communities', module: '../../src/routes/communities.js' }
  );

  // Create test users with city/state set
  userA = await createTestUser({
    email: `comm-a-${Date.now()}@borrowhood.test`,
    city: 'CommCity',
    state: 'CS',
  });
  userB = await createTestUser({
    email: `comm-b-${Date.now()}@borrowhood.test`,
    city: 'CommCity',
    state: 'CS',
  });
  userC = await createTestUser({
    email: `comm-c-${Date.now()}@borrowhood.test`,
    city: 'OtherCity',
    state: 'OT',
  });
  createdUserIds.push(userA.userId, userB.userId, userC.userId);

  // Create a community in CommCity
  communityId = await createTestCommunity({
    name: 'CommCity Neighborhood',
    city: 'CommCity',
    state: 'CS',
  });
  createdCommunityIds.push(communityId);

  // userA is the organizer
  await addCommunityMember(userA.userId, communityId, 'organizer');
});

afterAll(async () => {
  for (const cid of createdCommunityIds) {
    try {
      await query('DELETE FROM community_memberships WHERE community_id = $1', [cid]);
      await query('DELETE FROM communities WHERE id = $1', [cid]);
    } catch (e) { /* */ }
  }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('GET /api/communities', () => {
  it('should list communities in user\'s city', async () => {
    const res = await request(app)
      .get('/api/communities')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(c => c.id === communityId);
    expect(found).toBeDefined();
    expect(found.name).toBe('CommCity Neighborhood');
    expect(found.isMember).toBe(true);
  });

  it('should return empty for user in different city', async () => {
    const res = await request(app)
      .get('/api/communities')
      .set('Authorization', `Bearer ${userC.token}`);

    expect(res.status).toBe(200);
    // Should not find CommCity communities
    const found = res.body.find(c => c.id === communityId);
    expect(found).toBeUndefined();
  });

  it('should list only joined communities when member=true', async () => {
    const res = await request(app)
      .get('/api/communities?member=true')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    res.body.forEach(c => {
      expect(c.isMember).toBe(true);
    });
  });

  it('should return empty joined list for user with no memberships', async () => {
    const res = await request(app)
      .get('/api/communities?member=true')
      .set('Authorization', `Bearer ${userC.token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });
});

describe('GET /api/communities/nearby', () => {
  it('should return communities near coordinates (city-based fallback)', async () => {
    const res = await request(app)
      .get('/api/communities/nearby?lat=40.7128&lng=-74.0060')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should reject missing lat/lng with 400', async () => {
    const res = await request(app)
      .get('/api/communities/nearby')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lat and lng');
  });
});

describe('GET /api/communities/:id', () => {
  it('should return community details', async () => {
    const res = await request(app)
      .get(`/api/communities/${communityId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(communityId);
    expect(res.body.name).toBe('CommCity Neighborhood');
    expect(res.body.isMember).toBe(true);
    expect(res.body.role).toBe('organizer');
    expect(res.body.organizers).toBeDefined();
    expect(res.body.organizers.length).toBeGreaterThanOrEqual(1);
  });

  it('should return 404 for non-existent community', async () => {
    const res = await request(app)
      .get('/api/communities/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/communities', () => {
  it('should create a community and make creator organizer', async () => {
    const res = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        name: 'New Test Hood',
        description: 'A brand new neighborhood',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.slug).toBeDefined();
    expect(res.body.isFounder).toBe(true);
    createdCommunityIds.push(res.body.id);

    // Verify creator is organizer
    const membership = await query(
      'SELECT role FROM community_memberships WHERE community_id = $1 AND user_id = $2',
      [res.body.id, userA.userId]
    );
    expect(membership.rows[0].role).toBe('organizer');
  });

  it('should reject community creation without city set', async () => {
    const noCityUser = await createTestUser({
      email: `nocity-${Date.now()}@borrowhood.test`,
      city: null,
      state: null,
    });
    createdUserIds.push(noCityUser.userId);
    // Clear city/state
    await query('UPDATE users SET city = NULL, state = NULL WHERE id = $1', [noCityUser.userId]);

    const res = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${noCityUser.token}`)
      .send({ name: 'No City Hood' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LOCATION_REQUIRED');
  });

  it('should reject name shorter than 3 characters', async () => {
    const res = await request(app)
      .post('/api/communities')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ name: 'AB' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/communities/:id/join', () => {
  it('should join a community', async () => {
    const res = await request(app)
      .post(`/api/communities/${communityId}/join`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify membership in DB
    const membership = await query(
      'SELECT role FROM community_memberships WHERE community_id = $1 AND user_id = $2',
      [communityId, userB.userId]
    );
    expect(membership.rows.length).toBe(1);
  });

  it('should handle duplicate join gracefully', async () => {
    const res = await request(app)
      .post(`/api/communities/${communityId}/join`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
  });

  it('should return 404 for non-existent community', async () => {
    const res = await request(app)
      .post('/api/communities/00000000-0000-0000-0000-000000000000/join')
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/communities/:id/leave', () => {
  it('should leave a community with no active items', async () => {
    // userB joined above, should be able to leave
    const res = await request(app)
      .post(`/api/communities/${communityId}/leave`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify no membership
    const membership = await query(
      'SELECT id FROM community_memberships WHERE community_id = $1 AND user_id = $2',
      [communityId, userB.userId]
    );
    expect(membership.rows.length).toBe(0);
  });
});

describe('GET /api/communities/:id/members', () => {
  it('should return member list with roles', async () => {
    const res = await request(app)
      .get(`/api/communities/${communityId}/members`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const organizer = res.body.find(m => m.id === userA.userId);
    expect(organizer).toBeDefined();
    expect(organizer.role).toBe('organizer');
  });
});

describe('POST /api/communities/:id/add-admin', () => {
  it('should add admin when requested by organizer', async () => {
    // First, add userB back as member
    await addCommunityMember(userB.userId, communityId, 'member');

    const res = await request(app)
      .post(`/api/communities/${communityId}/add-admin`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ userId: userB.userId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify role changed
    const membership = await query(
      'SELECT role FROM community_memberships WHERE community_id = $1 AND user_id = $2',
      [communityId, userB.userId]
    );
    expect(membership.rows[0].role).toBe('organizer');
  });

  it('should reject add-admin by non-organizer (403)', async () => {
    // userC is not a member/organizer
    const res = await request(app)
      .post(`/api/communities/${communityId}/add-admin`)
      .set('Authorization', `Bearer ${userC.token}`)
      .send({ userId: userA.userId });

    expect(res.status).toBe(403);
  });

  it('should reject promoting non-member', async () => {
    const res = await request(app)
      .post(`/api/communities/${communityId}/add-admin`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ userId: userC.userId });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('member first');
  });
});
