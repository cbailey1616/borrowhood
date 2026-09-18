import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (s, p) => state.db.query(s, p), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => { req.user = { id: req.headers['x-user'] }; next(); },
  requireVerified: (req, res, next) => next(), requireOrganizer: (req, res, next) => next(),
}));
import router from '../../src/routes/communities.js';
import { originalPhotoUrl, privatePhotoUrl, protectMediaResponses, repairCommunityCoverReferences } from '../../src/services/privatePhotos.js';
const app = express(); app.use(express.json()); app.use(protectMediaResponses); app.use('/communities', router);
const owner = randomUUID(), member = randomUUID(), hood = randomUUID();
const source = `https://borrowhood-uploads.s3.us-east-1.amazonaws.com/communities/${owner}/cover.jpg`;
const url = `/communities/${hood}`;
const patch = (body, user = owner) => request(app).patch(url).set('x-user', user).send(body);
const stored = async () => (await state.db.query('SELECT banner_url FROM communities WHERE id=$1', [hood])).rows[0].banner_url;
const expired = () => {
  const { enc, photoCacheKey } = jwt.decode(new URL(privatePhotoUrl(source, owner)).pathname.split('/api/private-photos/')[1]);
  return `http://localhost:3000/api/private-photos/${jwt.sign({ enc, photoCacheKey }, process.env.JWT_SECRET, { subject: owner, audience: 'listing-photo', expiresIn: -1 })}`;
};
beforeAll(async () => {
  process.env.JWT_SECRET = 'isolated-community-cover-test-key';
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,first_name TEXT,last_name TEXT,display_name TEXT,profile_photo_url TEXT);
    CREATE TABLE communities(id UUID PRIMARY KEY,name TEXT,slug TEXT,description TEXT,city TEXT,state TEXT,banner_url TEXT,
      announcement TEXT,announcement_at TIMESTAMPTZ,announcement_by UUID,requires_approval BOOLEAN,is_active BOOLEAN DEFAULT true);
    CREATE TABLE community_memberships(community_id UUID REFERENCES communities,user_id UUID,role TEXT);
    CREATE TABLE listings(community_id UUID,status TEXT,privacy_version INTEGER,visibility TEXT);`);
  await state.db.query("INSERT INTO users(id,first_name) VALUES($1,'Owner'),($2,'Member')", [owner, member]);
}, 20000);
beforeEach(async () => {
  await state.db.exec('TRUNCATE communities,community_memberships CASCADE');
  await state.db.query("INSERT INTO communities(id,name,banner_url) VALUES($1,'Our neighborhood',$2)", [hood, source]);
  await state.db.query("INSERT INTO community_memberships VALUES($1,$2,'organizer'),($1,$3,'member')", [hood, owner, member]);
});
afterAll(async () => state.db.close());

it('keeps a permanent storage reference when older editors send the displayed cover back', async () => {
  const before = await request(app).get(url).set('x-user', owner);
  expect(before.body.bannerUrl).toContain('/api/private-photos/');
  const save = await patch({ name: 'Renamed', bannerUrl: before.body.bannerUrl });
  expect(save.status).toBe(200);
  expect(await stored()).toBe(source);
  expect(originalPhotoUrl(save.body.bannerUrl, owner)).toBe(source);
  const other = await request(app).get('/communities?member=true').set('x-user', member);
  expect(originalPhotoUrl(other.body[0].bannerUrl, member)).toBe(source);
  expect(other.body[0].bannerUrl).not.toBe(before.body.bannerUrl);
});
it('preserves unchanged covers, returns protected new covers, and supports explicit removal', async () => {
  expect((await patch({ description: 'Updated' })).status).toBe(200);
  expect(await stored()).toBe(source);
  const replacement = source.replace('cover.jpg', 'new.jpg');
  const saved = await patch({ bannerUrl: replacement });
  expect(originalPhotoUrl(saved.body.bannerUrl, owner)).toBe(replacement);
  expect(await stored()).toBe(replacement);
  expect((await patch({ bannerUrl: null })).body.bannerUrl).toBeNull();
  expect(await stored()).toBeNull();
});
it.each(['expired', 'other viewer', 'tampered'])('rejects an incoming %s display link without changing the cover', async kind => {
  const value = kind === 'expired' ? expired() : kind === 'other viewer' ? privatePhotoUrl(source, member)
    : privatePhotoUrl(source, owner).split('?')[0] + 'tampered';
  expect((await patch({ bannerUrl: value })).status).toBe(400);
  expect(await stored()).toBe(source);
});
it('prevents regular members from replacing or removing the cover', async () => {
  expect((await patch({ bannerUrl: null }, member)).status).toBe(403);
  expect(await stored()).toBe(source);
});
it('restores saved expired links, reissues valid display URLs, and is safe to rerun', async () => {
  const old = expired();
  expect(() => originalPhotoUrl(old, owner)).toThrow();
  await state.db.query('UPDATE communities SET banner_url=$1 WHERE id=$2', [old, hood]);
  expect(await repairCommunityCoverReferences()).toEqual({ repaired: 1, skipped: 0 });
  expect(await stored()).toBe(source);
  expect(await repairCommunityCoverReferences()).toEqual({ repaired: 0, skipped: 0 });
  const fresh = await request(app).get(url).set('x-user', owner);
  expect(originalPhotoUrl(fresh.body.bannerUrl, owner)).toBe(source);
  expect(() => originalPhotoUrl(old, owner)).toThrow();
});
it('does not overwrite a newer cover during recovery', async () => {
  await state.db.query('UPDATE communities SET banner_url=$1 WHERE id=$2', [expired(), hood]);
  const replacement = source.replace('cover.jpg', 'replacement.jpg');
  const db = { query: async (sql, params) => {
    const result = await state.db.query(sql, params);
    if (sql.startsWith('SELECT')) await state.db.query('UPDATE communities SET banner_url=$1 WHERE id=$2', [replacement, hood]);
    return result;
  } };
  expect(await repairCommunityCoverReferences(db)).toEqual({ repaired: 0, skipped: 0 });
  expect(await stored()).toBe(replacement);
});
it.each(['tampered', 'wrong purpose', 'non-cover'])('does not repair a %s stored reference', async kind => {
  const token = jwt.sign({ src: source }, process.env.JWT_SECRET, { audience: 'sign-in', expiresIn: -1 });
  const invalid = kind === 'tampered' ? expired() + 'bad' : kind === 'wrong purpose'
    ? `http://localhost:3000/api/private-photos/${token}` : privatePhotoUrl(source.replace('/communities/', '/listings/'), owner);
  await state.db.query('UPDATE communities SET banner_url=$1 WHERE id=$2', [invalid, hood]);
  expect(await repairCommunityCoverReferences()).toEqual({ repaired: 0, skipped: 1 });
  expect(await stored()).toBe(invalid);
});
