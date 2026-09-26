import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
const state = vi.hoisted(() => ({ db: null, failNotice: false }));
vi.mock('../../src/utils/db.js', () => ({ query: (sql, params) => state.db.query(sql, params), withTransaction: action => state.db.transaction(action) }));
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: req.get('x-user'), isAdmin: true }; next(); },
  requireVerified: (_req, _res, next) => next(), requireOrganizer: (_req, _res, next) => next(),
}));
vi.mock('../../src/services/notifications.js', () => ({
  sendNotification: async (userId, type, data, options) => {
    if (state.failNotice) throw new Error('Simulated queue failure');
    await options.runQuery('INSERT INTO notices(user_id, type, data) VALUES ($1,$2,$3)', [userId, type, JSON.stringify(data)]);
  },
}));
import router from '../../src/routes/communities.js';
import { ensureCommunityMembershipSchema } from '../../src/services/communityMemberships.js';
import { ensureCommunityChatSchema } from '../../src/services/communityChat.js';
const app = express(); app.use(express.json()); app.use('/communities', router);
const moderator = randomUUID(), neighbor = randomUUID(), member = randomUUID(), otherModerator = randomUUID();
const group = randomUUID(), otherGroup = randomUUID();
const post = (path, user = neighbor) => request(app).post(`/communities/${group}/${path}`).set('x-user', user);
const remove = (user = moderator, target = neighbor) => request(app).delete(`/communities/${group}/members/${target}`).set('x-user', user);
const review = (decision, user = moderator) => post(`rejoin-requests/${neighbor}/${decision}`, user);
const members = async () => (await state.db.query('SELECT user_id, joined_at, role FROM community_memberships WHERE community_id=$1 AND user_id=$2', [group, neighbor])).rows;
const removal = async () => (await state.db.query('SELECT * FROM community_member_removals WHERE community_id=$1 AND user_id=$2', [group, neighbor])).rows[0];
const notices = async () => (await state.db.query('SELECT * FROM notices')).rows;
const chat = () => request(app).get(`/communities/${group}/chat`).set('x-user', neighbor);
const send = content => post('chat', moderator).send({ content, clientRequestId: randomUUID() });
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, first_name TEXT DEFAULT 'Sam', last_name TEXT DEFAULT 'Green', display_name TEXT,
    profile_photo_url TEXT, city TEXT DEFAULT 'Upton', state TEXT DEFAULT 'MA', status TEXT DEFAULT 'verified', lender_rating NUMERIC DEFAULT 0, lender_rating_count INT DEFAULT 0);
    CREATE TABLE communities(id UUID PRIMARY KEY, name TEXT DEFAULT 'Oak Street', slug TEXT, city TEXT DEFAULT 'Upton', state TEXT DEFAULT 'MA',
      banner_url TEXT, is_active BOOLEAN DEFAULT true, community_type TEXT DEFAULT 'neighborhood');
    CREATE TABLE community_memberships(community_id UUID REFERENCES communities, user_id UUID REFERENCES users, role TEXT DEFAULT 'member',
      joined_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(community_id,user_id));
    CREATE TABLE listings(id UUID, owner_id UUID, community_id UUID, status TEXT, privacy_version INT, visibility TEXT);
    CREATE TABLE borrow_transactions(listing_id UUID, borrower_id UUID, lender_id UUID, status TEXT);
    CREATE TABLE user_blocks(user_id UUID, blocked_id UUID);
    CREATE TABLE notices(user_id UUID, type TEXT, data JSONB);`);
  await ensureCommunityMembershipSchema(); await ensureCommunityMembershipSchema(); await ensureCommunityChatSchema();
  await state.db.query('INSERT INTO users(id) VALUES($1),($2),($3),($4)', [moderator, neighbor, member, otherModerator]);
  await state.db.query('INSERT INTO communities(id) VALUES($1),($2)', [group, otherGroup]);
}, 20000);
afterAll(async () => state.db.close());
beforeEach(async () => {
  state.failNotice = false;
  await state.db.exec('TRUNCATE community_memberships, community_member_removals, community_chat_messages, notices, listings, borrow_transactions RESTART IDENTITY CASCADE');
  await state.db.exec("UPDATE users SET city='Upton',status='verified'; UPDATE communities SET is_active=true");
  await state.db.query(`INSERT INTO community_memberships(community_id,user_id,role,joined_at)
    VALUES($1,$2,'organizer',NOW()),($1,$3,'member','2026-01-01'),($1,$4,'member',NOW()),($5,$6,'organizer',NOW())`,
  [group, moderator, neighbor, member, otherGroup, otherModerator]);
});
it('keeps a durable removal and denies chat and repeated joins without duplicating requests', async () => {
  await remove().expect(200); expect(await members()).toEqual([]);
  expect(await removal()).toMatchObject({ removed_by: moderator, requested_at: null });
  await chat().expect(403);
  await post('join').expect(403).expect(({ body }) => expect(body.code).toBe('REJOIN_APPROVAL_REQUIRED'));
  const first = (await removal()).requested_at;
  await post('join').expect(403); expect((await removal()).requested_at).toEqual(first);
  expect(await members()).toEqual([]);
  expect(await notices()).toMatchObject([{ user_id: moderator, type: 'join_request', data: { rejoin: true, communityId: group } }]);
  const requests = await request(app).get(`/communities/${group}/rejoin-requests`).set('x-user', moderator).expect(200);
  expect(requests.body).toMatchObject([{ id: neighbor, firstName: 'Sam', lastName: 'G.' }]);
});
it('allows only this neighborhood’s moderator to remove, view or approve; protects moderators', async () => {
  await remove(member).expect(403); await remove(otherModerator).expect(403);
  await remove(moderator, moderator).expect(400);
  await state.db.query("INSERT INTO community_memberships VALUES($1,$2,'organizer',NOW())", [group, otherModerator]);
  await remove(moderator, otherModerator).expect(400);
  await remove().expect(200); await post('join').expect(403);
  await request(app).get(`/communities/${group}/rejoin-requests`).set('x-user', member).expect(403);
  await review('approve', neighbor).expect(403); await review('approve', member).expect(403); await review('decline', member).expect(403);
  await state.db.query('DELETE FROM community_memberships WHERE community_id=$1 AND user_id=$2', [group, otherModerator]);
  await review('approve', otherModerator).expect(403); expect(await members()).toEqual([]);
});
it('approves a fresh membership without exposing messages sent before approval', async () => {
  await remove().expect(200); await post('join').expect(403); await send('While waiting').expect(200);
  const beforeApproval = Date.now(); await review('approve').expect(200);
  const [membership] = await members(); expect(membership.role).toBe('member');
  expect(new Date(membership.joined_at).getTime()).toBeGreaterThanOrEqual(beforeApproval);
  expect(await removal()).toBeUndefined(); expect((await chat().expect(200)).body.messages).toEqual([]);
  await send('Welcome back').expect(200);
  expect((await chat()).body.messages.map(message => message.content)).toEqual(['Welcome back']);
  await post('join').expect(200); expect((await members())[0].joined_at).toEqual(membership.joined_at);
  await review('approve').expect(404); expect((await notices()).filter(n => n.type === 'join_approved')).toHaveLength(1);
  await remove().expect(200); await post('join').expect(403); expect(await members()).toEqual([]);
});
it('declining or trying to leave cannot erase the restriction', async () => {
  await remove().expect(200); await post('join').expect(403); await review('decline').expect(200);
  expect((await removal()).requested_at).toBeNull(); await post('leave').expect(200);
  expect(await removal()).toBeDefined(); await post('join').expect(403); expect(await members()).toEqual([]);
});
it('keeps voluntary leave/rejoin and unrelated neighborhoods working', async () => {
  await post('leave').expect(200); await post('join').expect(200); expect(await removal()).toBeUndefined();
  await remove().expect(200); await request(app).post(`/communities/${otherGroup}/join`).set('x-user', neighbor).expect(200);
  await post('join').expect(403);
});
it('rechecks location and active status when approving a request', async () => {
  await remove().expect(200); await post('join').expect(403);
  await state.db.query("UPDATE users SET city='Boston' WHERE id=$1", [neighbor]); await review('approve').expect(403);
  await state.db.query("UPDATE users SET city='Upton' WHERE id=$1", [neighbor]);
  await state.db.query('UPDATE communities SET is_active=false WHERE id=$1', [group]); await review('approve').expect(403);
  expect(await members()).toEqual([]); expect((await removal()).requested_at).not.toBeNull();
});
it('exposes removed/pending status only for the requesting account in discovery and details', async () => {
  await remove().expect(200);
  const list = () => request(app).get('/communities').set('x-user', neighbor);
  expect((await list()).body.find(c => c.id === group)).toMatchObject({ isMember: false, rejoinStatus: 'removed' });
  await post('join').expect(403);
  expect((await list()).body.find(c => c.id === group)).toMatchObject({ isMember: false, rejoinStatus: 'pending' });
  expect((await request(app).get(`/communities/${group}`).set('x-user', neighbor)).body.rejoinStatus).toBe('pending');
  const others = await request(app).get('/communities').set('x-user', member);
  expect(others.body.find(c => c.id === group).rejoinStatus).toBeNull();
});
it('rolls back request or approval if its durable notification cannot be queued', async () => {
  await remove().expect(200); state.failNotice = true; await post('join').expect(500);
  expect((await removal()).requested_at).toBeNull(); state.failNotice = false; await post('join').expect(403);
  state.failNotice = true; await review('approve').expect(500);
  expect(await members()).toEqual([]); expect((await removal()).requested_at).not.toBeNull();
  state.failNotice = false; await review('approve').expect(200);
});
it('requires the last steward to choose a replacement without changing memberships', async () => {
  const result = await post('leave', moderator).expect(409);
  expect(result.body.code).toBe('STEWARD_HANDOFF_REQUIRED');
  expect((await state.db.query('SELECT role FROM community_memberships WHERE user_id=$1 AND community_id=$2', [moderator, group])).rows[0].role).toBe('organizer');
  expect((await members())[0].role).toBe('member');
});
it('hands over stewardship and leaves atomically, preserving the successor’s chat history', async () => {
  const joinedAt = (await members())[0].joined_at;
  await post('leave', moderator).send({ successorId: neighbor }).expect(200);
  expect((await state.db.query('SELECT * FROM community_memberships WHERE user_id=$1 AND community_id=$2', [moderator, group])).rows).toHaveLength(0);
  expect((await members())[0]).toMatchObject({ role: 'organizer', joined_at: joinedAt });
  expect(await notices()).toMatchObject([{ user_id: neighbor, type: 'steward_assigned', data: { communityId: group } }]);
  await post('leave', moderator).send({ successorId: neighbor }).expect(200);
  expect(await notices()).toHaveLength(1);
});
it('lets a steward leave normally when another steward is staying', async () => {
  await state.db.query("UPDATE community_memberships SET role='organizer' WHERE user_id=$1 AND community_id=$2", [neighbor, group]);
  await post('leave', moderator).expect(200);
  expect((await members())[0].role).toBe('organizer');
  expect((await state.db.query('SELECT is_active FROM communities WHERE id=$1', [group])).rows[0].is_active).toBe(true);
  expect(await notices()).toEqual([]);
});
it.each(['self', 'uppercase self', 'outsider', 'removed', 'suspended', 'malformed'])('rejects a %s successor without removing the current steward', async kind => {
  let successorId = neighbor;
  if (kind === 'self') successorId = moderator;
  if (kind === 'uppercase self') successorId = moderator.toUpperCase();
  if (kind === 'outsider') successorId = otherModerator;
  if (kind === 'removed') await remove().expect(200);
  if (kind === 'suspended') await state.db.query("UPDATE users SET status='suspended' WHERE id=$1", [neighbor]);
  if (kind === 'malformed') successorId = {};
  const response = await post('leave', moderator).send({ successorId });
  expect([400, 409]).toContain(response.status); expect(response.body.code).toBe('INVALID_STEWARD');
  expect((await state.db.query('SELECT role FROM community_memberships WHERE user_id=$1 AND community_id=$2', [moderator, group])).rows[0].role).toBe('organizer');
  expect(await notices()).toEqual([]);
});
it('prevents regular members from using leave to promote someone', async () => {
  await post('leave', neighbor).send({ successorId: member }).expect(403);
  expect((await members())[0].role).toBe('member');
});
it('archives only when the final member leaves and prevents joining the archive', async () => {
  await state.db.query('DELETE FROM community_memberships WHERE community_id=$1 AND user_id<>$2', [group, moderator]);
  const response = await post('leave', moderator).expect(200);
  expect(response.body.archived).toBe(true);
  expect((await state.db.query('SELECT is_active FROM communities WHERE id=$1', [group])).rows[0].is_active).toBe(false);
  await post('join').expect(403);
  const nearby = await request(app).get('/communities').set('x-user', neighbor).expect(200);
  expect(nearby.body.some(c => c.id === group)).toBe(false);
  await post('leave', moderator).expect(200);
});
it('does not let outsiders archive an empty neighborhood', async () => {
  await state.db.query('DELETE FROM community_memberships WHERE community_id=$1', [group]);
  await post('leave', neighbor).expect(200);
  expect((await state.db.query('SELECT is_active FROM communities WHERE id=$1', [group])).rows[0].is_active).toBe(true);
});
it.each(['listing', 'exchange'])('preserves stewardship when an active %s prevents departure', async kind => {
  const item = randomUUID();
  await state.db.query('INSERT INTO listings(id,owner_id,community_id,status) VALUES($1,$2,$3,$4)', [item, kind === 'listing' ? moderator : neighbor, group, kind === 'listing' ? 'active' : 'paused']);
  if (kind === 'exchange') await state.db.query("INSERT INTO borrow_transactions(listing_id,borrower_id,lender_id,status) VALUES($1,$2,$3,'picked_up')", [item, moderator, neighbor]);
  const response = await post('leave', moderator).send({ successorId: neighbor }).expect(400);
  expect(response.body.code).toBe(kind === 'listing' ? 'ACTIVE_NEIGHBORHOOD_LISTINGS' : 'ACTIVE_NEIGHBORHOOD_EXCHANGES');
  expect((await members())[0].role).toBe('member'); expect(await notices()).toEqual([]);
});
it('keeps the current steward and roles if the handoff notification cannot be queued', async () => {
  state.failNotice = true;
  await post('leave', moderator).send({ successorId: neighbor }).expect(500);
  expect((await members())[0].role).toBe('member');
  expect((await state.db.query('SELECT role FROM community_memberships WHERE user_id=$1 AND community_id=$2', [moderator, group])).rows[0].role).toBe('organizer');
});
it('offers only eligible neighbors to a steward and supports paging the choices', async () => {
  const path = `/communities/${group}/members?forSteward=true&limit=1`;
  await request(app).get(path).set('x-user', neighbor).expect(403);
  const first = (await request(app).get(path).set('x-user', moderator).expect(200)).body;
  const second = (await request(app).get(`${path}&page=2`).set('x-user', moderator).expect(200)).body;
  expect(first).toHaveLength(1); expect(second).toHaveLength(1);
  expect(new Set([first[0].id, second[0].id])).toEqual(new Set([neighbor, member]));
  await state.db.query("UPDATE users SET status='suspended' WHERE id=$1", [neighbor]);
  const available = (await request(app).get(path).set('x-user', moderator).expect(200)).body;
  expect(available.map(m => m.id)).toEqual([member]);
});
