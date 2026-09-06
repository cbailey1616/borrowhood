import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestListing, createTestApp } from './helpers/stripe.js';
import { canViewListing, canViewRequest } from '../src/services/listingAccess.js';
let app, owner, viewer, verified, outsider, friend, item, legacy, privateItem, wanted;
const users = [];
beforeAll(async () => {
  app = await createTestApp(...['feed','listings','requests','users','transactions','messages','discussions'].map(route => ({ path: '/api/' + (route === 'discussions' ? 'listings' : route), module: `../../src/routes/${route}.js` })));
  for (const [name,isVerified,city] of [['Poster',true,'Upton'],['Viewer',false,'Upton'],['Verified',true,'Upton'],['Outsider',false,'Mendon'],['Friend',false,'Upton']]) {
    users.push(await createTestUser({ firstName: name, email: `town-preview-${name}@borrowhood.test`, isVerified, city, state: 'MA' }));
  }
  [owner,viewer,verified,outsider,friend] = users;
  item = await createTestListing(owner.userId, { title: 'Preview ladder', visibility: 'town,close_friends', isFree: true });
  legacy = await createTestListing(owner.userId, { title: 'Original audience ladder', visibility: 'town', isFree: true });
  privateItem = await createTestListing(owner.userId, { title: 'Private inventory ladder', visibility: 'private', isFree: true });
  await query('UPDATE listings SET town_preview_enabled=true WHERE id=$1', [item]);
  await query("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted')", [owner.userId,friend.userId]);
  wanted = (await query("INSERT INTO item_requests(user_id,title,visibility,status,type,town_preview_enabled) VALUES($1,'Looking for a drill','town','open','item',true) RETURNING id", [owner.userId])).rows[0].id;
});
afterAll(async () => {
  await query('DELETE FROM item_requests WHERE id=$1', [wanted]);
  await query('DELETE FROM listing_photos WHERE listing_id=ANY($1)', [[item,legacy,privateItem]]);
  await query('DELETE FROM listings WHERE id=ANY($1)', [[item,legacy,privateItem]]);
  await query('DELETE FROM friendships WHERE user_id=$1 OR friend_id=$1', [owner.userId]);
  await query('DELETE FROM users WHERE id=ANY($1)', [users.map(u => u.userId)]);
});
const get = (path, user=viewer) => request(app).get('/api/' + path).set('Authorization', `Bearer ${user.token}`);
const hidden = body => {
  expect(body).toMatchObject({ ownerMasked: true, previewOnly: true });
  expect(JSON.stringify(body)).not.toContain(owner.userId);
  expect(JSON.stringify(body)).not.toContain('Poster');
  expect(body.owner || body.requester).toMatchObject({ id: null, profilePhotoUrl: null });
};
describe('Town previews do not grant identity or contact access', () => {
  it('shows opted-in previews in the feed without identity fields', async () => {
    const res = await get('feed?visibility=town');
    expect(res.status).toBe(200);
    hidden(res.body.items.find(r => r.id === item));
    hidden(res.body.items.find(r => r.id === wanted));
    expect(res.body.items.some(r => [legacy,privateItem].includes(r.id))).toBe(false);
  });
  it.each(['listings','requests'])('masks every %s browse preview', async route => {
    const res = await get(route); expect(res.status).toBe(200);
    hidden(res.body.find(r => r.id === (route === 'listings' ? item : wanted)));
  });
  it('masks listing and request details', async () => {
    for (const path of [`listings/${item}`,`requests/${wanted}`]) {
      const res = await get(path); expect(res.status).toBe(200); hidden(res.body);
    }
  });
  it('does not broaden older posts or expose an inventory', async () => {
    expect((await get('listings/' + legacy)).status).toBe(404);
    expect((await get('listings/' + privateItem)).status).toBe(404);
    expect((await get('users/' + owner.userId + '/listings')).body).toEqual([]);
  });
  it('does not allow another town to preview either post', async () => {
    expect((await get('listings/' + item,outsider)).status).toBe(404);
    expect((await get('requests/' + wanted,outsider)).status).toBe(404);
  });
  it('shows identities after verification without requiring a paid plan', async () => {
    const listing = await get('listings/' + item,verified);
    expect(listing.status).toBe(200);
    expect(listing.body.owner).toMatchObject({ id: owner.userId, firstName: 'Poster' });
    expect(listing.body.ownerMasked).toBe(false);
    expect((await get('requests/' + wanted,verified)).body.requester.id).toBe(owner.userId);
  });
  it('preserves identity for existing accepted friends without ID verification', async () => {
    const res = await get('listings/' + item,friend);
    expect(res.body.owner.id).toBe(owner.userId);
    expect(res.body.ownerMasked).toBe(false);
  });
  it('keeps the full-access policy closed for preview-only viewers', async () => {
    expect(await canViewListing(item,viewer.userId)).toBe(false);
    expect(await canViewRequest(wanted,viewer.userId)).toBe(false);
    expect((await get(`listings/${item}/discussions`)).status).toBe(404);
    expect((await get(`requests/${wanted}/offers`)).status).toBe(404);
  });
  it('does not let a preview grant borrowing or listing-linked contact', async () => {
    const body = { listingId: item, startDate: '2027-01-01', endDate: '2027-01-02' };
    expect((await request(app).post('/api/transactions').set('Authorization', `Bearer ${viewer.token}`).send(body)).status).toBe(404);
    expect((await request(app).post('/api/messages').set('Authorization', `Bearer ${viewer.token}`).send({ listingId:item, recipientId:owner.userId, content:'Trying to bypass the preview' })).status).toBe(404);
  });
  it('allows only the owner to enable previews on an existing listing', async () => {
    const body = { visibility:['town'], sharingConfirmed:true, townPreviewEnabled:true };
    expect((await request(app).patch('/api/listings/' + legacy).set('Authorization', `Bearer ${viewer.token}`).send(body)).status).toBe(403);
    expect((await request(app).patch('/api/listings/' + legacy).set('Authorization', `Bearer ${owner.token}`).send(body)).status).toBe(200);
    hidden((await get('listings/' + legacy)).body);
  });
  it('revoking previews immediately removes preview access', async () => {
    await query('UPDATE listings SET town_preview_enabled=false WHERE id=$1', [item]);
    expect((await get('listings/' + item)).status).toBe(404);
    await query("UPDATE item_requests SET visibility='close_friends' WHERE id=$1", [wanted]);
    expect((await get('requests/' + wanted)).status).toBe(404);
  });
});
