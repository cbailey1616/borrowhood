import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/services/stripe.js', () => ({ createStripeCustomer: vi.fn(), createIdentityVerificationSession: vi.fn(),
  getIdentityVerificationSession: vi.fn(), cancelPaymentIntent: vi.fn().mockResolvedValue({}) }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn().mockResolvedValue('notice') }));
vi.mock('../../src/services/email.js', () => ({ sendResetCodeEmail: vi.fn(), sendAccountHintEmail: vi.fn(), sendSignupCodeEmail: vi.fn(), sendSocialLinkCodeEmail: vi.fn() }));
vi.mock('../../src/middleware/auth.js', () => ({ generateTokens: vi.fn(), authenticate: (req,res,next) => {
  if (!req.headers['x-user']) return res.sendStatus(401);
  req.user = { id: req.headers['x-user'] }; next();
} }));
import routes from '../../src/routes/auth.js';
import { sendNotification } from '../../src/services/notifications.js';
import { cancelPaymentIntent } from '../../src/services/stripe.js';
let app;
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, display_name TEXT, email TEXT,
    password_hash TEXT, phone TEXT, bio TEXT, profile_photo_url TEXT, status TEXT DEFAULT 'verified',
    stripe_customer_id TEXT, stripe_connect_account_id TEXT, stripe_identity_session_id TEXT,
    date_of_birth DATE, address_line1 TEXT, referred_by TEXT REFERENCES users(id));
    CREATE TABLE listings(id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id), title TEXT DEFAULT 'Ladder',
      status TEXT DEFAULT 'active', is_available BOOLEAN DEFAULT false);
    CREATE TABLE borrow_transactions(id TEXT PRIMARY KEY, listing_id TEXT REFERENCES listings(id),
      borrower_id TEXT REFERENCES users(id), lender_id TEXT REFERENCES users(id), status TEXT,
      stripe_payment_intent_id TEXT, actual_pickup_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE disputes(transaction_id TEXT REFERENCES borrow_transactions(id), claimant_user_id TEXT REFERENCES users(id), respondent_user_id TEXT REFERENCES users(id));
    CREATE TABLE return_reports(transaction_id TEXT REFERENCES borrow_transactions(id));
    CREATE TABLE ratings(rater_id TEXT, ratee_id TEXT);
    CREATE TABLE listing_discussions(user_id TEXT, listing_id TEXT);
    CREATE TABLE listing_photos(listing_id TEXT);
    CREATE TABLE listing_availability(listing_id TEXT);
    CREATE TABLE saved_listings(user_id TEXT, listing_id TEXT);
    CREATE TABLE bundle_items(listing_id TEXT, bundle_id TEXT);
    CREATE TABLE community_library_items(donated_by TEXT);
    CREATE TABLE rto_contracts(borrower_id TEXT, lender_id TEXT);
    CREATE TABLE conversations(id TEXT, listing_id TEXT, user1_id TEXT, user2_id TEXT);
    CREATE TABLE messages(id TEXT, conversation_id TEXT, sender_id TEXT);
    CREATE TABLE message_reactions(user_id TEXT, message_id TEXT);
    CREATE TABLE friendships(user_id TEXT, friend_id TEXT);
    CREATE TABLE community_memberships(user_id TEXT);
    CREATE TABLE user_badges(user_id TEXT);
    CREATE TABLE bundles(id TEXT, owner_id TEXT);
    CREATE TABLE lending_circle_members(user_id TEXT);
    CREATE TABLE subscription_history(user_id TEXT);
    CREATE TABLE audit_log(actor_id TEXT);
    CREATE TABLE item_requests(user_id TEXT);
    CREATE TABLE notifications(user_id TEXT, from_user_id TEXT,
      transaction_id TEXT REFERENCES borrow_transactions(id), listing_id TEXT REFERENCES listings(id));`);
  app = express(); app.use(express.json()); app.use('/auth', routes);
}, 20000);
afterAll(async () => { await state.db?.close(); });
beforeEach(async () => {
  vi.clearAllMocks(); cancelPaymentIntent.mockResolvedValue({}); sendNotification.mockResolvedValue('notice');
  await state.db.exec(`DROP TRIGGER IF EXISTS fail_delete ON users; TRUNCATE users, listings, borrow_transactions, disputes CASCADE;
    INSERT INTO users(id,email,first_name) VALUES('owner','owner@example.test','Owner'),('borrower','borrower@example.test','Borrower'),('other','other@example.test','Other');
    INSERT INTO listings(id,owner_id) VALUES('item','owner');`);
});
const del = (user = 'borrower') => request(app).delete('/auth/account').set('x-user',user);
const rows = async (sql, params = []) => (await state.db.query(sql,params)).rows;
const seed = (status, borrower = 'borrower', id = 'exchange', payment = null) => state.db.query(
  'INSERT INTO borrow_transactions(id,listing_id,borrower_id,lender_id,status,stripe_payment_intent_id) VALUES($1,$2,$3,$4,$5,$6)',
  [id,'item',borrower,'owner',status,payment]);

it('requires authentication before deleting an account', async () => {
  expect((await request(app).delete('/auth/account')).status).toBe(401);
  expect(await rows('SELECT id FROM users')).toHaveLength(3);
});
it('deleting a pending requester preserves another borrower’s reservation', async () => {
  await seed('pending'); await seed('picked_up','other','active');
  await state.db.exec("INSERT INTO notifications VALUES('owner','borrower','exchange','item')");
  expect((await del()).status).toBe(200);
  expect(await rows('SELECT is_available FROM listings')).toEqual([{ is_available:false }]);
  expect(await rows('SELECT id,status FROM borrow_transactions')).toEqual([{ id:'active',status:'picked_up' }]);
});
it('deleting a pending requester preserves an owner’s manual availability choice', async () => {
  await seed('pending'); expect((await del()).status).toBe(200);
  expect(await rows('SELECT is_available FROM listings')).toEqual([{ is_available:false }]);
});
it.each(['approved','paid'])('releases a %s offline reservation when its borrower deletes their account', async status => {
  await seed(status); expect((await del()).status).toBe(200);
  expect(await rows('SELECT is_available FROM listings')).toEqual([{ is_available:true }]);
  expect(await rows('SELECT id FROM users WHERE id=$1',['borrower'])).toEqual([]);
  expect(cancelPaymentIntent).not.toHaveBeenCalled();
});
it.each(['picked_up','return_pending','disputed'])('retains a %s exchange and anonymizes the departing borrower', async status => {
  await seed(status);
  if (status === 'disputed') await state.db.exec("INSERT INTO disputes VALUES('exchange','owner','borrower')");
  expect((await del()).status).toBe(200);
  expect(await rows('SELECT status FROM borrow_transactions')).toEqual([{ status:'account_deleted' }]);
  expect(await rows('SELECT status,email,display_name FROM users WHERE id=$1',['borrower'])).toEqual([
    { status:'suspended',email:'deleted_borrower@deleted.borrowhood.com',display_name:'Deleted User' },
  ]);
  expect(await rows('SELECT is_available FROM listings')).toEqual([{ is_available:false }]);
  if (status === 'disputed') expect(await rows('SELECT * FROM disputes')).toHaveLength(1);
});
it('hides a retained listing when its owner deletes their account', async () => {
  await seed('picked_up'); expect((await del('owner')).status).toBe(200);
  expect(await rows('SELECT status,is_available FROM listings')).toEqual([{ status:'paused',is_available:false }]);
});
it('rolls back all deletion work if final account removal fails, without notifying the other person', async () => {
  await seed('approved');
  await state.db.exec(`CREATE OR REPLACE FUNCTION fail_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END $$ LANGUAGE plpgsql;
    CREATE TRIGGER fail_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION fail_delete()`);
  expect((await del()).status).toBe(500);
  expect(await rows('SELECT status FROM borrow_transactions')).toEqual([{ status:'approved' }]);
  expect(await rows('SELECT is_available FROM listings')).toEqual([{ is_available:false }]);
  expect(sendNotification).not.toHaveBeenCalled();
});
it('keeps the account and payment record when a legacy payment cancellation fails', async () => {
  await seed('approved','borrower','exchange','pi_local_test');
  cancelPaymentIntent.mockRejectedValueOnce(new Error('provider unavailable'));
  expect((await del()).status).toBe(500);
  expect(await rows('SELECT status FROM borrow_transactions')).toEqual([{ status:'approved' }]);
  expect(await rows('SELECT id FROM users WHERE id=$1',['borrower'])).toHaveLength(1);
  expect(sendNotification).not.toHaveBeenCalled();
});
it('retains legacy settled payments for support instead of erasing payment history', async () => {
  await seed('paid','borrower','exchange','pi_local_test');
  expect((await del()).status).toBe(200);
  expect(await rows('SELECT status,stripe_payment_intent_id FROM borrow_transactions')).toEqual([
    { status:'account_deleted',stripe_payment_intent_id:'pi_local_test' },
  ]);
  expect(cancelPaymentIntent).not.toHaveBeenCalled();
});
it('does not report a committed deletion as failed when a notification fails', async () => {
  await seed('pending'); sendNotification.mockRejectedValueOnce(new Error('notifications unavailable'));
  expect((await del()).status).toBe(200);
  expect(await rows('SELECT id FROM users WHERE id=$1',['borrower'])).toHaveLength(0);
});
