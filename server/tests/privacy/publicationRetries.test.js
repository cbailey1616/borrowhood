import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null, allowed: true, failName: false }));
vi.mock('../../src/utils/db.js', () => ({
  query: (sql, params) => {
    if (state.failName && sql.includes('SELECT first_name, last_name, display_name')) throw new Error('Name lookup unavailable');
    return state.db.query(sql, params);
  },
  withTransaction: fn => state.db.transaction(fn),
}));
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => { req.user = { id: req.headers['x-user'] }; next(); },
  requireVerified: (req, res, next) => next(), ENABLE_PAID_TIERS: false,
}));
vi.mock('../../src/services/listingAccess.js', () => ({
  canViewListing: async () => state.allowed, canViewRequest: async () => state.allowed,
  validateSharing: async () => ({ scopes: ['private'], circleId: null }), offerListing: vi.fn(),
}));
vi.mock('../../src/services/privatePhotos.js', () => ({ ownedPhotoReferences: async photos => photos, readOwnedPhoto: vi.fn() }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn(), sendBulkNotification: vi.fn() }));
vi.mock('../../src/services/discussionNotifications.js', () => ({ notifyThreadParticipants: vi.fn(), getDiscussionThread: vi.fn() }));
vi.mock('../../src/services/imageAnalysis.js', () => ({ analyzeItemImage: vi.fn() }));
import { ensurePublicationSchema, publishOnce } from '../../src/services/publicationReceipts.js';
import { sendNotification } from '../../src/services/notifications.js';
import { notifyThreadParticipants } from '../../src/services/discussionNotifications.js';
import listings from '../../src/routes/listings.js';
import requests from '../../src/routes/requests.js';
import discussions from '../../src/routes/discussions.js';
import requestDiscussions from '../../src/routes/requestDiscussions.js';
const owner = randomUUID(), neighbor = randomUUID(), item = randomUUID(), wanted = randomUUID(), parent = randomUUID();
const app = express(); app.use(express.json());
app.use('/listings', listings); app.use('/requests', requests);
app.use('/listings', discussions); app.use('/requests', requestDiscussions);
const post = (path, body, user = neighbor) => request(app).post(path).set('x-user', user).send(body);
const count = async table => Number((await state.db.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, first_name TEXT DEFAULT 'Lauren', last_name TEXT, display_name TEXT);
    CREATE TABLE friendships(user_id UUID, friend_id UUID, status TEXT);
    CREATE TABLE listings(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID, title TEXT, description TEXT, condition TEXT,
      community_id UUID, category_id UUID, is_free BOOLEAN, price_per_day NUMERIC, deposit_amount NUMERIC, min_duration INT, max_duration INT,
      visibility TEXT, listing_type TEXT, privacy_version INT, circle_id UUID, direct_fee JSONB, town_preview_enabled BOOLEAN,
      status TEXT DEFAULT 'active');
    CREATE TABLE listing_photos(listing_id UUID REFERENCES listings(id), url TEXT, sort_order INT);
    CREATE TABLE item_requests(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, title TEXT, description TEXT, community_id UUID,
      category_id UUID, needed_from DATE, needed_until DATE, visibility TEXT, status TEXT DEFAULT 'open', expires_at TIMESTAMPTZ,
      type TEXT, time_zone TEXT, photo_url TEXT, town_preview_enabled BOOLEAN);
    CREATE TABLE listing_discussions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), listing_id UUID, request_id UUID,
      user_id UUID, parent_id UUID, content TEXT, is_hidden BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW());`);
  await ensurePublicationSchema();
  await ensurePublicationSchema();
}, 20000);
afterAll(async () => state.db.close());
beforeEach(async () => {
  vi.clearAllMocks(); state.allowed = true; state.failName = false;
  sendNotification.mockReset(); notifyThreadParticipants.mockReset();
  await state.db.exec('TRUNCATE publication_receipts, listing_discussions, listing_photos, listings, item_requests, users CASCADE');
  await state.db.query('INSERT INTO users(id) VALUES($1),($2)', [owner, neighbor]);
  await state.db.query("INSERT INTO listings(id,owner_id,title) VALUES($1,$2,'Ladder')", [item, owner]);
  await state.db.query("INSERT INTO item_requests(id,user_id,title) VALUES($1,$2,'Drill')", [wanted, owner]);
});

it.each([
  ['/listings', 'listings', { title: 'New ladder', condition: 'good', isFree: true, photos: ['photo-one'] }],
  ['/requests', 'item_requests', { title: 'Need a drill', expiresIn: 'never', visibility: ['close_friends'], photoUrl: 'photo-one' }],
])('publishes once after the response is lost: %s', async (path, table, input) => {
  const body = { ...input, clientRequestId: randomUUID() };
  const first = await post(path, body).expect(201);
  const retry = await post(path, body).expect(201);
  expect(retry.body).toEqual(first.body);
  expect(await count(table)).toBe(2); // Original fixture + one new post.
  expect(await count('publication_receipts')).toBe(1);
  await post(path, { ...body, title: 'Different item' }).expect(409);
  expect(await count(table)).toBe(2);
});

it.each(['listing', 'request'])('retries a %s comment without another post or alert', async kind => {
  const path = kind === 'listing' ? `/listings/${item}/discussions` : `/requests/${wanted}/discussions`;
  const body = { content: 'Can I pick it up tomorrow?', clientRequestId: randomUUID() };
  const first = await post(path, body).expect(201);
  const retry = await post(path, body).expect(201);
  expect(retry.body).toMatchObject({ id: first.body.id, content: body.content, replayed: true });
  expect(await count('listing_discussions')).toBe(1);
  expect(sendNotification).toHaveBeenCalledTimes(1);
  state.allowed = false;
  await post(path, body).expect(404); // A receipt never bypasses the visibility gate.
});

it.each(['listing', 'request'])('rolls back a %s reply when its activity record fails, then safely retries', async kind => {
  const column = kind === 'listing' ? 'listing_id' : 'request_id';
  await state.db.query(`INSERT INTO listing_discussions(id,${column},user_id,content) VALUES($1,$2,$3,'Parent')`, [parent, kind === 'listing' ? item : wanted, owner]);
  notifyThreadParticipants.mockRejectedValueOnce(new Error('Alert unavailable'));
  const path = kind === 'listing' ? `/listings/${item}/discussions` : `/requests/${wanted}/discussions`;
  const body = { content: 'Yes, thanks!', parentId: parent, clientRequestId: randomUUID() };
  await post(path, body).expect(500);
  expect(await count('listing_discussions')).toBe(1);
  expect(await count('publication_receipts')).toBe(0);
  await post(path, body).expect(201);
  await post(path, body).expect(201);
  expect(await count('listing_discussions')).toBe(2);
  expect(notifyThreadParticipants).toHaveBeenCalledTimes(2);
});

it('a response-critical name lookup failure saves no comment', async () => {
  state.failName = true;
  const body = { content: 'Hello', clientRequestId: randomUUID() };
  await post(`/listings/${item}/discussions`, body).expect(500);
  expect(await count('listing_discussions')).toBe(0);
  expect(await count('publication_receipts')).toBe(0);
  state.failName = false;
  await post(`/listings/${item}/discussions`, body).expect(201);
  expect(await count('listing_discussions')).toBe(1);
});

it('rolls back both the publication and receipt after a failed secondary write', async () => {
  const attempt = { userId: neighbor, operation: 'test', payload: { title: 'Example', clientRequestId: randomUUID() } };
  await expect(publishOnce(attempt, async client => {
    await client.query("INSERT INTO listings(title) VALUES('Should roll back')");
    throw new Error('Photo failed');
  })).rejects.toThrow('Photo failed');
  expect(await count('listings')).toBe(1);
  expect(await count('publication_receipts')).toBe(0);
  const create = vi.fn(async () => ({ id: randomUUID() }));
  const results = await Promise.all([publishOnce(attempt, create), publishOnce(attempt, create)]);
  expect(results[0].value).toEqual(results[1].value);
  expect(create).toHaveBeenCalledTimes(1);
  await publishOnce({ ...attempt, userId: owner }, create);
  expect(create).toHaveBeenCalledTimes(2); // Keys belong to the authenticated account.
});
