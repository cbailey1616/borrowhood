import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { body } from 'express-validator';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({
  query: (...args) => state.db.query(...args),
  withTransaction: fn => state.db.transaction(client => fn({ query: (sql, params) =>
    // PGlite uses exec for the same multi-statement schema that pg.query accepts.
    sql.includes('CREATE OR REPLACE FUNCTION pickup_review_time') ? client.exec(sql) : client.query(sql, params) })),
}));
vi.mock('../../src/utils/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('../../src/services/stripe.js', () => ({ getPaymentIntent: vi.fn(), refundPayment: vi.fn(), cancelPaymentIntent: vi.fn() }));
import { ensurePickupFollowupSchema, sendPickupFollowups, givePickupMoreTime, pickupReviewState } from '../../src/services/pickupFollowup.js';
import { shouldSendPush } from '../../src/services/notificationPreferences.js';
import { confirmBorrowPickup } from '../../src/services/borrowPickup.js';
import { cancelBorrow } from '../../src/services/borrowCancellation.js';
let app;
const rows = async (sql, params) => (await state.db.query(sql, params)).rows;
const current = async () => (await rows('SELECT * FROM borrow_transactions WHERE id=$1', ['exchange']))[0];
const post = (path, user = 'owner', data = {}) => request(app).post(`/exchange/${path}`).set('x-user', user).send(data);
const seed = async (type = 'lend', status = 'paid') => {
  await state.db.query('INSERT INTO listings(id,listing_type) VALUES($1,$2)', ['item', type]);
  await state.db.query(`INSERT INTO borrow_transactions(id,listing_id,status,accepted_at,requested_start_date,requested_end_date)
    VALUES('exchange','item',$1,NOW()-INTERVAL '10 days',CURRENT_DATE-4,CURRENT_DATE+2)`, [status]);
};

beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE listings(id TEXT PRIMARY KEY, title TEXT DEFAULT 'Ladder', listing_type TEXT DEFAULT 'lend',
    status TEXT DEFAULT 'active', is_available BOOLEAN DEFAULT false, condition TEXT DEFAULT 'good');
    CREATE TABLE borrow_transactions(id TEXT PRIMARY KEY, listing_id TEXT REFERENCES listings(id),
      lender_id TEXT DEFAULT 'owner', borrower_id TEXT DEFAULT 'borrower', status TEXT DEFAULT 'paid',
      actual_pickup_at TIMESTAMPTZ, actual_return_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ,
      requested_start_date DATE, requested_end_date DATE, condition_at_pickup TEXT, stripe_payment_intent_id TEXT,
      payment_status TEXT DEFAULT 'none', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE disputes(id TEXT PRIMARY KEY, transaction_id TEXT);
    CREATE TABLE notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT, type TEXT, title TEXT, body TEXT,
      from_user_id TEXT, transaction_id TEXT, listing_id TEXT, request_id TEXT, conversation_id TEXT, dispute_id TEXT,
      discussion_id TEXT, thread_id TEXT, circle_id TEXT, push_data JSONB, dedupe_key TEXT, is_read BOOLEAN DEFAULT false);
    CREATE UNIQUE INDEX notification_dedupe ON notifications(user_id,dedupe_key) WHERE dedupe_key IS NOT NULL;`);
  await ensurePickupFollowupSchema();
  app = express(); app.use(express.json());
  app.use((req, res, next) => { req.user = { id: req.headers['x-user'] }; next(); });
  app.post('/:id/extend', body('reviewAt').isISO8601({ strict: true }), givePickupMoreTime);
  app.post('/:id/pickup', confirmBorrowPickup());
  app.post('/:id/cancel', cancelBorrow);
}, 20000);
afterAll(async () => { await state.db.close(); });
beforeEach(async () => {
  await state.db.exec('DROP TRIGGER IF EXISTS fail_notice ON notifications; TRUNCATE borrow_transactions, listings, disputes, notifications');
});

it.each(['lend', 'giveaway', 'sell'])('checks an overdue %s pickup once and keeps it reserved', async type => {
  await seed(type);
  await sendPickupFollowups(); await sendPickupFollowups();
  expect(await rows('SELECT user_id,type FROM notifications')).toEqual([{ user_id: 'owner', type: 'pickup_check' }]);
  expect(await current()).toMatchObject({ status: 'paid', actual_pickup_at: null });
  expect((await current()).pickup_review_notified_at).toBeTruthy();
  expect(await rows('SELECT is_available FROM listings')).toEqual([{ is_available: false }]);
});

it('schedules after the pickup calendar day and gives a late approval a full day', async () => {
  await seed();
  const values = await rows(`SELECT pickup_review_time('lend','2026-09-20','2026-09-18T10:00:00Z') AS planned,
    pickup_review_time('lend','2026-09-01','2026-09-18T15:00:00Z') AS late,
    pickup_review_time('sell','2026-09-01','2026-09-18T15:00:00Z') AS sale`);
  expect(values[0]).toEqual({ planned: new Date('2026-09-21T12:00:00Z'), late: new Date('2026-09-19T15:00:00Z'), sale: new Date('2026-09-25T15:00:00Z') });
  await state.db.exec("UPDATE borrow_transactions SET pickup_review_at=NOW()+INTERVAL '2 days'");
  const before = (await current()).pickup_review_at;
  await ensurePickupFollowupSchema(); await ensurePickupFollowupSchema();
  expect((await current()).pickup_review_at).toEqual(before);
  await sendPickupFollowups(); expect(await rows('SELECT id FROM notifications')).toHaveLength(0);
});

it('backfills an already approved pickup on upgrade without changing its reservation', async () => {
  await state.db.exec('DROP TRIGGER schedule_pickup_review ON borrow_transactions');
  await seed('giveaway');
  expect((await current()).pickup_review_at).toBeNull();
  await ensurePickupFollowupSchema();
  expect((await current()).pickup_review_at.getTime()).toBeLessThan(Date.now());
  expect(await current()).toMatchObject({ status: 'paid', actual_pickup_at: null });
  expect(await rows('SELECT is_available FROM listings')).toEqual([{ is_available: false }]);
});

it.each(['pending', 'picked_up', 'return_pending', 'returned', 'completed', 'cancelled', 'declined', 'disputed'])('does not prompt for %s exchanges', async status => {
  await seed('lend', status);
  await state.db.exec("UPDATE borrow_transactions SET pickup_review_at=NOW()-INTERVAL '1 day'");
  await sendPickupFollowups(); expect(await rows('SELECT id FROM notifications')).toHaveLength(0);
});

it('does not prompt when a handoff or dispute has already been recorded', async () => {
  await seed();
  await state.db.exec("UPDATE borrow_transactions SET actual_pickup_at=NOW()");
  await sendPickupFollowups();
  await state.db.exec("UPDATE borrow_transactions SET actual_pickup_at=NULL; INSERT INTO disputes VALUES('issue','exchange')");
  await sendPickupFollowups(); expect(await rows('SELECT id FROM notifications')).toHaveLength(0);
});

it('only the owner gets the review controls, and pickup push preferences apply', async () => {
  await seed(); const t = await current();
  expect(pickupReviewState(t, 'owner').needed).toBe(true);
  expect(pickupReviewState(t, 'borrower').needed).toBe(false);
  expect(pickupReviewState({ ...t, has_dispute: true }, 'owner').needed).toBe(false);
  expect(pickupReviewState({ ...t, actual_pickup_at: new Date() }, 'owner')).toBeNull();
  for (const type of ['pickup_check', 'pickup_extended']) {
    expect(shouldSendPush(type, { pickup_updates: false })).toBe(false);
    expect(shouldSendPush(type, { borrow_updates: false })).toBe(false);
    expect(shouldSendPush(type, { push_enabled: false })).toBe(false);
    expect(shouldSendPush(type, {})).toBe(true);
  }
});

it('extends once, clears the old reminder, and preserves the return date and reservation', async () => {
  await seed(); await sendPickupFollowups(); const before = await current();
  const payload = { reviewAt: before.pickup_review_at.toISOString() };
  expect((await post('extend', 'owner', payload)).status).toBe(200);
  const after = await current();
  expect(after.pickup_review_at.getTime() - Date.now()).toBeGreaterThan(86390000);
  expect(after.requested_end_date).toEqual(before.requested_end_date);
  expect(after.status).toBe('paid');
  expect(await rows('SELECT is_available FROM listings')).toEqual([{ is_available: false }]);
  expect(await rows('SELECT user_id,type,is_read FROM notifications ORDER BY type')).toEqual([
    { user_id: 'owner', type: 'pickup_check', is_read: true }, { user_id: 'borrower', type: 'pickup_extended', is_read: false },
  ]);
  expect((await post('extend', 'owner', payload)).body.alreadyExtended).toBe(true);
  expect((await current()).pickup_review_at).toEqual(after.pickup_review_at);
  await sendPickupFollowups(); expect(await rows('SELECT id FROM notifications')).toHaveLength(2);
  // The new window can produce one new check; the original stays read.
  await state.db.exec("UPDATE borrow_transactions SET pickup_review_at=NOW()-INTERVAL '1 second',pickup_review_notified_at=NOW()-INTERVAL '1 day'");
  await sendPickupFollowups(); await sendPickupFollowups();
  expect(await rows("SELECT is_read FROM notifications WHERE type='pickup_check' ORDER BY is_read")).toEqual([{ is_read: false }, { is_read: true }]);
});

it('rejects non-owners, invalid dates, early extensions, and stale decisions after pickup', async () => {
  await seed(); const payload = { reviewAt: (await current()).pickup_review_at.toISOString() };
  for (const user of ['borrower', 'stranger']) expect((await post('extend', user, payload)).status).toBe(404);
  expect((await post('extend', 'owner', { reviewAt: 'bad' })).status).toBe(400);
  expect((await post('extend', 'owner', {})).status).toBe(400);
  await state.db.exec("UPDATE borrow_transactions SET pickup_review_at=NOW()+INTERVAL '1 day'");
  expect((await post('extend', 'owner', { reviewAt: (await current()).pickup_review_at.toISOString() })).status).toBe(409);
  expect((await post('pickup')).status).toBe(200);
  expect((await post('extend', 'owner', payload)).status).toBe(409);
  expect((await post('cancel')).status).toBe(409);
  expect((await current()).status).toBe('picked_up');
});

it.each(['pickup', 'cancel'])('clears the owner’s reminder when they confirm %s', async action => {
  await seed(); await sendPickupFollowups();
  expect((await post(action)).status).toBe(200);
  expect(await rows("SELECT is_read FROM notifications WHERE type='pickup_check'")).toEqual([{ is_read: true }]);
  expect(await rows('SELECT is_available FROM listings')).toEqual([{ is_available: action === 'cancel' }]);
});

it('rolls back a failed extension notification, including the cleared unread badge', async () => {
  await seed(); await sendPickupFollowups(); const before = await current();
  await state.db.exec(`CREATE OR REPLACE FUNCTION reject_notice() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'Notification storage unavailable'; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER fail_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_notice()`);
  expect((await post('extend', 'owner', { reviewAt: before.pickup_review_at.toISOString() })).status).toBe(500);
  expect((await current()).pickup_review_at).toEqual(before.pickup_review_at);
  expect(await rows("SELECT is_read FROM notifications WHERE type='pickup_check'")).toEqual([{ is_read: false }]);
});

it('retries failed reminders instead of consuming the notification receipt', async () => {
  await seed();
  await state.db.exec(`CREATE OR REPLACE FUNCTION reject_notice() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'Notification storage unavailable'; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER fail_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_notice()`);
  await sendPickupFollowups(); expect((await current()).pickup_review_notified_at).toBeNull();
  await state.db.exec('DROP TRIGGER fail_notice ON notifications');
  await sendPickupFollowups(); expect(await rows('SELECT id FROM notifications')).toHaveLength(1);
});
