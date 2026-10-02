import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const state = vi.hoisted(() => ({ db: null, failRecipient: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: async (user, type, data, options) => {
  if (user === state.failRecipient) throw new Error('Notification unavailable');
  await options.runQuery('INSERT INTO notifications(transaction_id,type,user_id,created_at) VALUES($1,$2,$3,NOW())', [data.transactionId,type,user]);
  return 'saved';
} }));
import { autoCloseReturns } from '../../src/services/autoCloseReturns.js';
import { completeFreeReturn } from '../../src/services/borrowReturn.js';
import { ensureExchangeCompletionSchema } from '../../src/services/exchangeCompletionSchema.js';
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE listings(id TEXT PRIMARY KEY, title TEXT DEFAULT 'Leaf blower', listing_type TEXT DEFAULT 'lend',
    status TEXT DEFAULT 'active', is_available BOOLEAN DEFAULT false, times_borrowed INT DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE borrow_transactions(id TEXT PRIMARY KEY, listing_id TEXT, borrower_id TEXT DEFAULT 'borrower', lender_id TEXT DEFAULT 'owner',
      status TEXT DEFAULT 'picked_up', actual_pickup_at TIMESTAMPTZ DEFAULT NOW()-INTERVAL '7 days', actual_return_at TIMESTAMPTZ,
      stripe_payment_intent_id TEXT, payment_status TEXT DEFAULT 'none', rental_fee NUMERIC DEFAULT 0, deposit_amount NUMERIC DEFAULT 0,
      condition_at_pickup TEXT DEFAULT 'good', condition_at_return TEXT, condition_notes TEXT);
    CREATE TABLE notifications(transaction_id TEXT, type TEXT, user_id TEXT, created_at TIMESTAMPTZ);
    CREATE TABLE disputes(transaction_id TEXT);
    CREATE TABLE return_reports(transaction_id TEXT,status TEXT,resolved_at TIMESTAMPTZ);
    CREATE TABLE safety_reports(content_type TEXT,content_id TEXT,status TEXT);`);
  await ensureExchangeCompletionSchema();
}, 15000);
afterAll(async () => state.db.close());
beforeEach(async () => {
  state.failRecipient = null;
  await state.db.exec('TRUNCATE listings,borrow_transactions,notifications,disputes,return_reports,safety_reports');
  await state.db.exec("INSERT INTO listings(id) VALUES('item'); INSERT INTO borrow_transactions(id,listing_id) VALUES('borrow','item')");
});
const ageReturn = () => state.db.exec("UPDATE borrow_transactions SET status='return_pending',return_requested_at=NOW()-INTERVAL '49 hours' WHERE id='borrow'");
const row = async () => (await state.db.query("SELECT * FROM borrow_transactions WHERE id='borrow'")).rows[0];
const listing = async () => (await state.db.query("SELECT * FROM listings WHERE id='item'")).rows[0];

it('starts the timer when the borrower marks returned, without resetting it on retry', async () => {
  await completeFreeReturn('borrow','borrower','good');
  const first = await row();
  expect(first.status).toBe('return_pending');
  expect(first.return_requested_at).toBeTruthy();
  expect(first.actual_return_at).toBeNull();
  await completeFreeReturn('borrow','borrower','good');
  expect((await row()).return_requested_at).toEqual(first.return_requested_at);
  await autoCloseReturns();
  expect((await row()).status).toBe('return_pending');
});
it('closes after 48 hours, restores inventory and notifies both once', async () => {
  await ageReturn();
  await autoCloseReturns();
  expect(await row()).toMatchObject({status:'completed',payment_status:'none'});
  expect((await row()).actual_return_at).toEqual((await row()).return_requested_at);
  expect((await row()).return_auto_closed_at).toBeTruthy();
  expect(await listing()).toMatchObject({is_available:true,times_borrowed:1});
  await autoCloseReturns();
  expect((await listing()).times_borrowed).toBe(1);
  expect((await state.db.query('SELECT user_id FROM notifications ORDER BY user_id')).rows.map(r=>r.user_id)).toEqual(['borrower','owner']);
});
it.each(['dispute','report','damage','condition','paid'])('keeps a %s return open for review', async kind => {
  await ageReturn();
  if(kind==='dispute') await state.db.exec("INSERT INTO disputes VALUES('borrow')");
  if(kind==='report') await state.db.exec("INSERT INTO return_reports VALUES('borrow','open',NULL)");
  if(kind==='damage') await state.db.exec("INSERT INTO safety_reports VALUES('exchange','borrow','open')");
  if(kind==='condition') await state.db.exec("UPDATE borrow_transactions SET condition_at_return='worn'");
  if(kind==='paid') await state.db.exec('UPDATE borrow_transactions SET rental_fee=5');
  await autoCloseReturns();
  expect((await row()).status).toBe('return_pending');
  expect((await listing()).times_borrowed).toBe(0);
});
it('allows an automatic return after a damage report is dismissed',async()=>{
  await ageReturn();
  await state.db.exec("INSERT INTO safety_reports VALUES('exchange','borrow','dismissed')");
  await autoCloseReturns();
  expect((await row()).status).toBe('completed');
});
it('never closes an overdue borrow that has not been marked returned', async () => {
  await state.db.exec("UPDATE borrow_transactions SET return_requested_at=NOW()-INTERVAL '10 days'");
  await autoCloseReturns();
  expect((await row()).status).toBe('picked_up');
});
it.each(['paused','reserved'])('does not make %s inventory available', async kind => {
  await ageReturn();
  if(kind==='paused') await state.db.exec("UPDATE listings SET status='paused'");
  else await state.db.exec("INSERT INTO borrow_transactions(id,listing_id,status) VALUES('next','item','approved')");
  await autoCloseReturns();
  expect((await row()).status).toBe('completed');
  expect((await listing()).is_available).toBe(false);
});
it('rolls back completion if either notification cannot be saved and retries safely', async () => {
  await ageReturn();state.failRecipient='owner';
  await autoCloseReturns();
  expect((await row()).status).toBe('return_pending');
  expect((await listing()).times_borrowed).toBe(0);
  expect((await state.db.query('SELECT * FROM notifications')).rows).toHaveLength(0);
  state.failRecipient=null;await autoCloseReturns();
  expect((await row()).status).toBe('completed');
});
it('backfills old pending returns from the original return notice', async () => {
  await state.db.exec("UPDATE borrow_transactions SET status='return_pending'; INSERT INTO notifications(transaction_id,type,created_at) VALUES('borrow','return_requested',NOW()-INTERVAL '3 days')");
  await ensureExchangeCompletionSchema();
  const first=(await row()).return_requested_at;
  await ensureExchangeCompletionSchema();
  expect((await row()).return_requested_at).toEqual(first);
  await autoCloseReturns();
  expect((await row()).status).toBe('completed');
});
