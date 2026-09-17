import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args) }));
import { friendshipSummary } from '../../src/services/friendshipSummary.js';

const viewer = '10000000-0000-4000-8000-000000000001';
const profile = '10000000-0000-4000-8000-000000000002';
const someoneElse = '10000000-0000-4000-8000-000000000003';
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE friendships (id uuid DEFAULT gen_random_uuid(), user_id uuid, friend_id uuid, status text)`);
}, 20000);
afterAll(async () => state.db?.close());
beforeEach(async () => state.db.exec('TRUNCATE friendships'));
const insert = (from, to, status) => state.db.query('INSERT INTO friendships(user_id, friend_id, status) VALUES($1,$2,$3)', [from, to, status]);

it('distinguishes a sent request, an incoming request and an accepted friendship', async () => {
  expect(await friendshipSummary(viewer, profile)).toEqual({ status: 'none' });
  await insert(viewer, profile, 'pending');
  expect(await friendshipSummary(viewer, profile)).toEqual({ status: 'pending' });
  expect(await friendshipSummary(profile, viewer)).toEqual({ status: 'received' });
  await state.db.exec("UPDATE friendships SET status = 'accepted'");
  await insert(profile, viewer, 'accepted');
  expect(await friendshipSummary(viewer, profile)).toEqual({ status: 'accepted' });
  expect(await friendshipSummary(profile, viewer)).toEqual({ status: 'accepted' });
});

it('does not return a relationship belonging to other members', async () => {
  await insert(profile, someoneElse, 'accepted');
  await insert(someoneElse, viewer, 'pending');
  expect(await friendshipSummary(viewer, profile)).toEqual({ status: 'none' });
  expect(await friendshipSummary(viewer, viewer)).toEqual({ status: 'self' });
});

it('keeps accepted status when older pending rows also exist', async () => {
  await insert(profile, viewer, 'pending');
  await insert(viewer, profile, 'accepted');
  expect(await friendshipSummary(viewer, profile)).toEqual({ status: 'accepted' });
});
