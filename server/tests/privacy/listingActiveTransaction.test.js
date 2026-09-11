import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({
  query: (...args) => state.db.query(...args),
  withTransaction: fn => state.db.transaction(fn),
}));
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: req.get('x-user-id') }; next(); },
  requireVerified: (_req, _res, next) => next(),
  ENABLE_PAID_TIERS: false,
}));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn() }));
vi.mock('../../src/services/imageAnalysis.js', () => ({ analyzeItemImage: vi.fn() }));

const listings = (await import('../../src/routes/listings.js')).default;
const app = express();
app.use('/listings', listings);
const detail = viewer => request(app).get('/listings/drill').set('x-user-id', viewer);

beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, display_name TEXT,
      profile_photo_url TEXT, lender_rating NUMERIC, lender_rating_count INT, total_transactions INT,
      is_verified BOOLEAN DEFAULT true, city TEXT, state TEXT, status TEXT DEFAULT 'active');
    CREATE TABLE listings(id TEXT PRIMARY KEY, owner_id TEXT, title TEXT, status TEXT DEFAULT 'active',
      listing_type TEXT DEFAULT 'lend', is_available BOOLEAN DEFAULT false, privacy_version INT DEFAULT 1,
      visibility TEXT DEFAULT 'close_friends', circle_id TEXT, community_id TEXT, category_id TEXT,
      town_preview_enabled BOOLEAN DEFAULT false);
    CREATE TABLE categories(id TEXT, name TEXT);
    CREATE TABLE listing_photos(listing_id TEXT, url TEXT, sort_order INT);
    CREATE TABLE friendships(user_id TEXT, friend_id TEXT, status TEXT);
    CREATE TABLE lending_circle_members(circle_id TEXT, user_id TEXT, status TEXT);
    CREATE TABLE community_memberships(community_id TEXT, user_id TEXT);
    CREATE TABLE item_requests(id TEXT, status TEXT, expires_at TIMESTAMPTZ, needed_until DATE, time_zone TEXT);
    CREATE TABLE listing_shares(listing_id TEXT, user_id TEXT, request_id TEXT, revoked_at TIMESTAMPTZ, expires_at TIMESTAMPTZ);
    CREATE TABLE borrow_transactions(id TEXT PRIMARY KEY, listing_id TEXT, borrower_id TEXT, lender_id TEXT,
      status TEXT, payment_status TEXT, requested_start_date DATE, requested_end_date DATE, created_at TIMESTAMPTZ);
    INSERT INTO users(id,first_name) VALUES ('owner','Owner'), ('borrower','Borrower'), ('waiting','Waiting'), ('neighbor','Neighbor');
    INSERT INTO listings(id,owner_id,title) VALUES ('drill','owner','Drill');
    INSERT INTO friendships VALUES ('owner','borrower','accepted'), ('owner','waiting','accepted'), ('owner','neighbor','accepted');
  `);
}, 20000);

afterAll(async () => { await state.db?.close(); });
beforeEach(async () => {
  await state.db.exec(`TRUNCATE borrow_transactions;
    INSERT INTO borrow_transactions(id,listing_id,borrower_id,lender_id,status,created_at) VALUES
      ('current','drill','borrower','owner','approved','2026-09-01'),
      ('waiting-request','drill','waiting','owner','pending','2026-09-02'),
      ('cancelled','drill','borrower','owner','cancelled','2026-09-03');`);
});

it.each(['approved', 'paid', 'picked_up', 'return_pending'])('keeps the owner’s %s exchange ahead of a newer pending request', async status => {
  await state.db.query('UPDATE borrow_transactions SET status=$1 WHERE id=$2', [status, 'current']);
  const response = await detail('owner');
  expect(response.status).toBe(200);
  expect(response.body.activeTransaction).toMatchObject({ id: 'current', status, isBorrower: false });
  expect(response.body.pendingRequests).toBe(1);
});

it('returns each borrower’s own exchange without disclosing another person’s reservation', async () => {
  const current = await detail('borrower');
  expect(current.status).toBe(200);
  expect(current.body.activeTransaction).toMatchObject({ id: 'current', isBorrower: true });

  const waiting = await detail('waiting');
  expect(waiting.status).toBe(200);
  expect(waiting.body.activeTransaction).toMatchObject({ id: 'waiting-request', status: 'pending', isBorrower: true });
  expect(waiting.body.pendingRequests).toBeUndefined();

  const neighbor = await detail('neighbor');
  expect(neighbor.status).toBe(200);
  expect(neighbor.body.activeTransaction).toBeNull();
});

it('keeps the newest pending request as the owner’s fallback once the previous exchange is complete', async () => {
  await state.db.exec("UPDATE borrow_transactions SET status='completed' WHERE id='current'");
  const response = await detail('owner');
  expect(response.status).toBe(200);
  expect(response.body.activeTransaction).toMatchObject({ id: 'waiting-request', status: 'pending' });
});
