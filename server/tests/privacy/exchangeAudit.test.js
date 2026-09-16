import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/middleware/auth.js', () => ({ authenticate: (req, res, next) => { req.user = { id: req.headers['x-user'] || '22222222-2222-4222-8222-222222222222' }; next(); }, requireVerified: (_req, _res, next) => next(), ENABLE_PAID_TIERS: false }));
vi.mock('../../src/services/listingAccess.js', () => ({ canViewListing: vi.fn().mockResolvedValue(true) }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn().mockResolvedValue('notice') }));
vi.mock('../../src/services/stripe.js', () => ({ stripe: {}, createPaymentIntent: vi.fn(), getPaymentIntent: vi.fn(), capturePaymentIntent: vi.fn(), cancelPaymentIntent: vi.fn(), createEphemeralKey: vi.fn(), refundPayment: vi.fn() }));
import transactions from '../../src/routes/transactions.js';
import availability from '../../src/routes/availability.js';
import { approveFreeBorrow } from '../../src/services/borrowReservation.js';
import { submitEndorsement } from '../../src/services/endorsements.js';
const owner = '11111111-1111-4111-8111-111111111111';
const borrower = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const listing = '44444444-4444-4444-8444-444444444444';
let app;
const rows = async (sql, params) => (await state.db.query(sql, params)).rows;
const send = (user = borrower, dates = {}) => request(app).post('/transactions').set('x-user', user).send({ listingId: listing, startDate: '2026-10-01', endDate: '2026-10-03', ...dates });
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, stripe_connect_account_id TEXT, city TEXT,
      first_name TEXT DEFAULT 'Neighbor', last_name TEXT, display_name TEXT, profile_photo_url TEXT, is_verified BOOLEAN DEFAULT true);
    CREATE TABLE listings(id UUID PRIMARY KEY, owner_id UUID, title TEXT, is_free BOOLEAN DEFAULT true, price_per_day NUMERIC DEFAULT 0,
      deposit_amount NUMERIC DEFAULT 0, listing_type TEXT DEFAULT 'lend', direct_fee JSONB, is_available BOOLEAN DEFAULT true,
      status TEXT DEFAULT 'active', min_duration INT DEFAULT 1, max_duration INT DEFAULT 14);
    CREATE TABLE listing_availability(id UUID DEFAULT gen_random_uuid(), listing_id UUID, start_date DATE, end_date DATE, is_available BOOLEAN, note TEXT);
    CREATE TABLE borrow_transactions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), listing_id UUID, borrower_id UUID, lender_id UUID,
      requested_start_date DATE, requested_end_date DATE, scheduled_pickup_date DATE, scheduled_return_date DATE, rental_days INT,
      daily_rate NUMERIC, rental_fee NUMERIC, deposit_amount NUMERIC, platform_fee NUMERIC, lender_payout NUMERIC, borrower_message TEXT,
      lender_response TEXT, status TEXT DEFAULT 'pending', payment_status TEXT DEFAULT 'none', stripe_payment_intent_id TEXT,
      accepted_at TIMESTAMPTZ, endorsement_started_at TIMESTAMPTZ, actual_pickup_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE listing_photos(listing_id UUID, url TEXT, sort_order INT);
    CREATE TABLE disputes(id UUID DEFAULT gen_random_uuid(), transaction_id UUID, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE exchange_endorsements(transaction_id UUID, rater_id UUID, ratee_id UUID, positive BOOLEAN,
      UNIQUE(transaction_id,rater_id));`);
  app = express(); app.use(express.json()); app.use('/transactions', transactions); app.use('/listings', availability);
}, 20000);
beforeEach(async () => {
  await state.db.exec('TRUNCATE listings, users, borrow_transactions, listing_availability, exchange_endorsements, disputes, listing_photos');
  await state.db.query('INSERT INTO users(id) VALUES($1),($2),($3)', [owner, borrower, other]);
  await state.db.query("INSERT INTO listings(id,owner_id,title) VALUES($1,$2,'Ladder')", [listing, owner]);
});
afterAll(async () => state.db.close());

it('provides the real return and dispute state for Home and Inbox only to participants', async () => {
  const created = await send();
  await state.db.exec("UPDATE borrow_transactions SET status='returned',payment_status='authorized',actual_pickup_at='2026-09-15T12:00:00Z'");
  const first = await request(app).get('/transactions').set('x-user',owner).expect(200);
  expect(first.body[0]).toMatchObject({ id:created.body.id, status:'returned', paymentStatus:'authorized', isBorrower:false,
    actualPickupAt:'2026-09-15T12:00:00.000Z', hasDispute:false, disputeId:null });
  const [issue] = await rows('INSERT INTO disputes(transaction_id) VALUES($1) RETURNING id',[created.body.id]);
  const borrowerView = await request(app).get('/transactions').set('x-user',borrower).expect(200);
  expect(borrowerView.body[0]).toMatchObject({ isBorrower:true, hasDispute:true, disputeId:issue.id });
  const unrelated = await request(app).get('/transactions').set('x-user',other).expect(200);
  expect(unrelated.body).toEqual([]);
});

it('queues different neighbors but never creates two active requests for the same person', async () => {
  const result = await Promise.all([send(), send(), send(other)]);
  expect(result.map(r => r.status).sort()).toEqual([201, 201, 409]);
  expect(await rows('SELECT borrower_id FROM borrow_transactions ORDER BY borrower_id')).toEqual([{ borrower_id: borrower }, { borrower_id: other }]);
  expect((await rows('SELECT is_available FROM listings'))[0].is_available).toBe(true);
});

it('permits only one winner when approval attempts are submitted together', async () => {
  const first = await send(); const second = await send(other);
  const approved = await Promise.all([first.body.id, second.body.id].map(id => approveFreeBorrow(id, owner, '')));
  expect(approved.filter(Boolean)).toHaveLength(1);
  expect(await rows("SELECT status, COUNT(*)::int AS count FROM borrow_transactions GROUP BY status ORDER BY status")).toEqual([{ status: 'paid', count: 1 }, { status: 'pending', count: 1 }]);
});

it('shows booked requested dates even when no separate schedule was set', async () => {
  const created = await send(); await approveFreeBorrow(created.body.id, owner, '');
  const calendar = await request(app).get(`/listings/${listing}/availability?startDate=2026-10-01&endDate=2026-10-10`);
  expect(calendar.status).toBe(200);
  expect(calendar.body.booked).toEqual([{ startDate: expect.stringMatching(/^2026-10-01/), endDate: expect.stringMatching(/^2026-10-03/), borrowerName: null }]);
  expect((await request(app).get(`/listings/${listing}/check-availability?startDate=2026-10-02&endDate=2026-10-03`)).body.available).toBe(false);
  await state.db.exec("UPDATE borrow_transactions SET status='return_pending'");
  expect((await request(app).get(`/listings/${listing}/check-availability?startDate=2026-10-02&endDate=2026-10-03`)).body.available).toBe(false);
});

it('uses explicitly scheduled dates when they differ from the original request', async () => {
  const created = await send(); await approveFreeBorrow(created.body.id, owner, '');
  await state.db.exec("UPDATE borrow_transactions SET scheduled_pickup_date='2026-10-05',scheduled_return_date='2026-10-07'");
  const calendar = await request(app).get(`/listings/${listing}/availability?startDate=2026-10-01&endDate=2026-10-10`);
  expect(calendar.body.booked[0]).toMatchObject({ startDate: expect.stringMatching(/^2026-10-05/), endDate: expect.stringMatching(/^2026-10-07/) });
});

it('enforces owner blocks on the server for requests and approvals', async () => {
  const created = await send();
  await state.db.query("INSERT INTO listing_availability(listing_id,start_date,end_date,is_available) VALUES($1,'2026-10-02','2026-10-04',false)", [listing]);
  expect((await send(other)).status).toBe(409);
  expect(await approveFreeBorrow(created.body.id, owner, '')).toBe(false);
  expect((await rows('SELECT status FROM borrow_transactions'))[0].status).toBe('pending');
  expect((await rows('SELECT is_available FROM listings'))[0].is_available).toBe(true);
});

it.each([
  { startDate: '2026-02-30', endDate: '2026-03-03' },
  { startDate: '2026-10-03', endDate: '2026-10-01' },
  { startDate: '2026-10-03', endDate: '2026-10-03' },
])('rejects invalid borrow dates: %j', async dates => {
  expect((await send(borrower, dates)).status).toBe(400);
  expect(await rows('SELECT id FROM borrow_transactions')).toEqual([]);
});

it.each(['startDate=oops&endDate=2026-10-03', 'startDate=2026-10-05&endDate=2026-10-01'])('validates calendar queries instead of returning a server error: %s', async dates => {
  for (const suffix of ['availability', 'check-availability']) {
    expect((await request(app).get(`/listings/${listing}/${suffix}?${dates}`)).status).toBe(400);
  }
});

it('keeps endorsement retries immutable and participant-only', async () => {
  const created = await send();
  await state.db.exec("UPDATE borrow_transactions SET status='completed',endorsement_started_at=NOW()");
  expect(await submitEndorsement(created.body.id, other, true)).toMatchObject({ status: 404 });
  const outcomes = await Promise.all([true, true, false].map(vote => submitEndorsement(created.body.id, owner, vote)));
  expect(outcomes).toEqual([{ success: true }, { success: true }, { status: 409, error: 'Your endorsement has already been sent.' }]);
  expect(await rows('SELECT rater_id,ratee_id,positive FROM exchange_endorsements')).toEqual([{ rater_id: owner, ratee_id: borrower, positive: true }]);
});
