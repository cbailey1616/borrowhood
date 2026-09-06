import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { query } from '../src/utils/db.js';
import { createTestUser } from './helpers/stripe.js';
import { protectMediaResponses } from '../src/services/privatePhotos.js';

let app, poster, viewer, verified, outsider, noTown, suspended;
const users = [], posts = { listings: [], requests: [] };
const access = (method, route, user, body) => request(app)[method]('/api/' + route)
  .set('Authorization', `Bearer ${user.token}`).send(body);
const payload = (type, user, visibility = ['town']) => ({
  title: 'Town posting test ladder', visibility, townPreviewEnabled: true,
  ...(type === 'listings' ? { condition: 'good', isFree: true, sharingConfirmed: true,
    photos: [`https://borrowhood-uploads.s3.us-east-1.amazonaws.com/listings/${user.userId}/ladder.jpg`] }
    : { type: 'item', expiresIn: 'never' }),
});
const create = async (type, user, visibility) => {
  const response = await access('post', type, user, payload(type, user, visibility));
  if (response.body.id) posts[type].push(response.body.id);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.id;
};
beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api', protectMediaResponses);
  for (const route of ['listings', 'requests', 'feed']) {
    const { default: router } = await import(`../src/routes/${route}.js`);
    app.use('/api/' + route, router);
  }
  for (const overrides of [
    { firstName: 'UnverifiedPoster' }, {}, { isVerified: true },
    { city: 'Another town', isVerified: true }, { city: ' ', state: '' }, { status: 'suspended' },
  ]) users.push(await createTestUser({ city: 'TownPosting', state: 'MA', ...overrides }));
  [poster, viewer, verified, outsider, noTown, suspended] = users;
});
afterAll(async () => {
  await query('DELETE FROM item_requests WHERE id=ANY($1)', [posts.requests]);
  await query('DELETE FROM listing_photos WHERE listing_id=ANY($1)', [posts.listings]);
  await query('DELETE FROM listings WHERE id=ANY($1)', [posts.listings]);
  await query('DELETE FROM users WHERE id=ANY($1)', [users.map(user => user.userId)]);
});

describe.each(['listings', 'requests'])('Unverified Town posting: %s', type => {
  let id;
  it('allows a new post without verification, friends, or a neighborhood', async () => {
    id = await create(type, poster);
    const table = type === 'listings' ? 'listings' : 'item_requests';
    expect((await query(`SELECT visibility, town_preview_enabled FROM ${table} WHERE id=$1`, [id])).rows[0])
      .toMatchObject({ visibility: 'town', town_preview_enabled: true });
    expect((await query('SELECT is_verified FROM users WHERE id=$1', [poster.userId])).rows[0].is_verified).toBe(false);
  });
  it('shows previews while hiding the poster from unverified viewers', async () => {
    for (const route of [type + '/' + id, type, 'feed?visibility=town']) {
      const response = await access('get', route, viewer);
      expect(response.status).toBe(200);
      const post = response.body.items ? response.body.items.find(post => post.id === id)
        : Array.isArray(response.body) ? response.body.find(post => post.id === id) : response.body;
      expect(post).toMatchObject({ ownerMasked: true, previewOnly: true });
      expect(JSON.stringify(post)).not.toContain(poster.userId);
      expect(JSON.stringify(post)).not.toContain('UnverifiedPoster');
    }
  });
  it('shows the poster to verified viewers without adding a false verified badge', async () => {
    for (const route of [type + '/' + id, type, 'feed?visibility=town']) {
      const response = await access('get', route, verified);
      expect(response.status).toBe(200);
      const post = response.body.items ? response.body.items.find(post => post.id === id)
        : Array.isArray(response.body) ? response.body.find(post => post.id === id) : response.body;
      expect(post.user || post.owner || post.requester).toMatchObject({ id: poster.userId, isVerified: false });
      expect(post.previewOnly).not.toBe(true);
    }
  });
  it('does not grant another town access', async () => {
    expect((await access('get', type + '/' + id, outsider)).status).toBe(404);
  });
  it('lets an unverified owner change an existing post to Town', async () => {
    const existing = await create(type, poster, type === 'listings' ? ['private'] : ['close_friends']);
    expect((await access('get', type + '/' + existing, viewer)).status).toBe(404);
    const response = await access('patch', type + '/' + existing, poster, {
      visibility: ['town'], sharingConfirmed: true, townPreviewEnabled: true,
    });
    expect(response.status).toBe(200);
    expect((await access('get', type + '/' + existing, viewer)).body.previewOnly).toBe(true);
  });
  it('does not let a different member change the audience', async () => {
    expect((await access('patch', type + '/' + id, viewer, {
      visibility: ['town'], sharingConfirmed: true, townPreviewEnabled: true,
    })).status).toBe(403);
  });
  it('still requires a town and state for creating or editing Town posts', async () => {
    const createResult = await access('post', type, noTown, payload(type, noTown));
    expect(createResult.status).toBe(400);
    expect(createResult.body.error).toMatch(/town and state/);
    const existing = await create(type, noTown, ['close_friends']);
    const editResult = await access('patch', type + '/' + existing, noTown, {
      visibility: ['town'], sharingConfirmed: true, townPreviewEnabled: true,
    });
    expect(editResult.status).toBe(400);
    expect(editResult.body.error).toMatch(/town and state/);
  });
  it('does not allow suspended accounts to post', async () => {
    expect((await access('post', type, suspended, payload(type, suspended))).status).toBe(403);
  });
  it('removes Town access when the poster is suspended', async () => {
    await query("UPDATE users SET status='suspended' WHERE id=$1", [poster.userId]);
    try {
      for (const user of [viewer, verified]) expect((await access('get', type + '/' + id, user)).status).toBe(404);
    } finally {
      await query("UPDATE users SET status='pending' WHERE id=$1", [poster.userId]);
    }
  });
});
