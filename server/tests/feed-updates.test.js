import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestListing, createTestApp, cleanupTestUser } from './helpers/stripe.js';

let app, viewer, neighbor, outsider, visible, wanted;
const users = [], listings = [];
const latest = '2026-09-09T12:00:00.000Z';

beforeAll(async () => {
  app = await createTestApp({ path: '/api/feed', module: '../../src/routes/feed.js' });
  for (const [name, city] of [['viewer', 'FeedDotTown'], ['neighbor', 'FeedDotTown'], ['outsider', 'AnotherFeedDotTown']]) {
    users.push(await createTestUser({ email: `feed-dot-${name}@borrowhood.test`, city, state: 'MA', isVerified: true }));
  }
  [viewer, neighbor, outsider] = users;
  const addListing = async (owner, visibility, createdAt, overrides = {}) => {
    const id = await createTestListing(owner.userId, { title: 'Feed dot fixture', isFree: true, visibility, ...overrides });
    listings.push(id);
    await query('UPDATE listings SET created_at=$1 WHERE id=$2', [createdAt, id]);
    return id;
  };
  visible = await addListing(neighbor, 'town', '2026-09-08T12:00:00Z');
  await addListing(viewer, 'town', '2026-09-15T12:00:00Z');
  await addListing(neighbor, 'private', '2026-09-16T12:00:00Z');
  await addListing(outsider, 'town', '2026-09-17T12:00:00Z');
  const sold = await addListing(neighbor, 'town', '2026-09-18T12:00:00Z');
  await query("UPDATE listings SET listing_type='sell', is_available=false WHERE id=$1", [sold]);
  wanted = (await query(`INSERT INTO item_requests (user_id,title,visibility,status,type,created_at)
    VALUES ($1,'New feed request','town','open','item',$2) RETURNING id`, [neighbor.userId, latest])).rows[0].id;
});

afterAll(async () => {
  if (wanted) await query('DELETE FROM item_requests WHERE id=$1', [wanted]);
  await query('DELETE FROM listing_photos WHERE listing_id=ANY($1)', [listings]);
  await query('DELETE FROM listings WHERE id=ANY($1)', [listings]);
  for (const user of users) await cleanupTestUser(user.userId);
});

const get = suffix => request(app).get('/api/feed' + suffix).set('Authorization', `Bearer ${viewer.token}`);
describe('Feed update indicator', () => {
  it('uses the newest visible neighbor post, excluding own, private, other-town and sold posts', async () => {
    const summary = await get('?summary=true');
    expect(summary.status).toBe(200);
    expect(summary.body).toEqual({ latestPostAt: latest });
    const feed = await get('');
    expect(feed.status).toBe(200);
    expect(feed.body.latestPostAt).toBe(summary.body.latestPostAt);
    expect(feed.body.items.find(item => item.id === wanted)).toMatchObject({ type: 'request', requestType: 'item' });
    expect(feed.body.items.some(item => item.id === visible)).toBe(true);
  });

  it('does not expose a timestamp without authentication', async () => {
    expect((await request(app).get('/api/feed?summary=true')).status).toBe(401);
  });

  it('preserves service type in both full and anonymous Town feeds without exposing identity', async () => {
    await query("UPDATE item_requests SET type='service', town_preview_enabled=true WHERE id=$1", [wanted]);
    const full = await get('?type=requests');
    expect(full.status).toBe(200);
    expect(full.body.items.find(item => item.id === wanted)).toMatchObject({
      type: 'request', requestType: 'service', user: { id: neighbor.userId },
    });
    const unverified = await createTestUser({ email: 'feed-service-preview@borrowhood.test', city: 'FeedDotTown', state: 'MA', isVerified: false });
    users.push(unverified);
    const preview = await request(app).get('/api/feed?type=requests').set('Authorization', `Bearer ${unverified.token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.items.find(item => item.id === wanted)).toMatchObject({
      type: 'request', requestType: 'service', ownerMasked: true, previewOnly: true,
      user: { id: null, firstName: 'Town', lastName: 'neighbor', profilePhotoUrl: null },
      requester: { id: null },
    });
  });

  it('rechecks visibility and availability each time, including an empty feed', async () => {
    await query("UPDATE item_requests SET visibility='private' WHERE id=$1", [wanted]);
    expect((await get('?summary=true')).body.latestPostAt).toBe('2026-09-08T12:00:00.000Z');
    await query("UPDATE listings SET status='paused' WHERE id=$1", [visible]);
    expect((await get('?summary=true')).body).toEqual({ latestPostAt: null });
  });
});
