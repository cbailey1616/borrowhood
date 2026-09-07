import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { body } from 'express-validator';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn().mockResolvedValue('notification') }));
vi.mock('../../src/services/stripe.js', () => ({ cancelPaymentIntent: vi.fn(), getPaymentIntent: vi.fn(), refundPayment: vi.fn() }));
import { sendNotification } from '../../src/services/notifications.js';
import { ensureExchangeCompletionSchema } from '../../src/services/exchangeCompletionSchema.js';
import { confirmBorrowPickup } from '../../src/services/borrowPickup.js';
import { completeFreeReturn } from '../../src/services/borrowReturn.js';
import { declineBorrow } from '../../src/services/borrowDecline.js';
import { cancelBorrow } from '../../src/services/borrowCancellation.js';
import { approveFreeBorrow } from '../../src/services/borrowReservation.js';
let app;
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TYPE listing_status AS ENUM ('active','paused','deleted');
    CREATE TABLE listings(id TEXT PRIMARY KEY, title TEXT DEFAULT 'Test item', listing_type TEXT DEFAULT 'lend',
      condition TEXT DEFAULT 'good', status listing_status DEFAULT 'active', is_available BOOLEAN DEFAULT false,
      updated_at TIMESTAMPTZ DEFAULT NOW(), times_borrowed INT DEFAULT 0);
    CREATE TABLE borrow_transactions(id TEXT PRIMARY KEY, listing_id TEXT REFERENCES listings(id),
      borrower_id TEXT DEFAULT 'borrower', lender_id TEXT DEFAULT 'owner', status TEXT DEFAULT 'approved',
      actual_pickup_at TIMESTAMPTZ, actual_return_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ,
      requested_end_date DATE, condition_at_pickup TEXT DEFAULT 'good', condition_at_return TEXT,
      condition_notes TEXT, lender_response TEXT, payment_status TEXT DEFAULT 'none', stripe_payment_intent_id TEXT);`);
  app = express(); app.use(express.json()); app.use((req,res,next) => { req.user = { id: req.headers['x-user'] || 'borrower' }; next(); });
  app.post('/rentals/:id/pickup', body('condition').optional().isIn(['like_new','good','fair','worn']), confirmBorrowPickup());
  app.post('/transactions/:id/pickup', confirmBorrowPickup({ borrowerOnly: true }));
  app.post('/:id/decline', declineBorrow); app.post('/:id/cancel', cancelBorrow);
}, 20000);
afterAll(async () => { await state.db?.close(); });
beforeEach(async () => {
  vi.clearAllMocks(); sendNotification.mockResolvedValue('notification');
  await state.db.exec('TRUNCATE borrow_transactions, listings; DROP TRIGGER IF EXISTS fail_listing_write ON listings');
});
const seed = async (type = 'lend', status = 'approved', id = 'exchange') => {
  await state.db.query('INSERT INTO listings(id,listing_type,is_available) VALUES($1,$2,$3)', [id,type,status === 'pending']);
  await state.db.query(`INSERT INTO borrow_transactions(id,listing_id,status,actual_pickup_at)
    VALUES($1,$1,$2,CASE WHEN $2 IN ('picked_up','return_pending') THEN NOW() ELSE NULL END)`, [id,status]);
};
const snapshot = async (id = 'exchange') => (await state.db.query(`SELECT bt.status,bt.actual_pickup_at,bt.actual_return_at,
  l.status AS listing_status,l.is_available,l.times_borrowed FROM borrow_transactions bt JOIN listings l ON l.id=bt.listing_id WHERE bt.id=$1`, [id])).rows[0];
const failListingWrite = () => state.db.exec(`CREATE OR REPLACE FUNCTION fail_listing_write() RETURNS trigger AS $$
  BEGIN RAISE EXCEPTION 'simulated storage failure'; END $$ LANGUAGE plpgsql;
  CREATE TRIGGER fail_listing_write BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION fail_listing_write()`);

it('upgrades the real legacy enum and repairs only untouched, partially completed handoffs', async () => {
  await seed('sell','returned');
  await state.db.exec(`UPDATE listings SET updated_at = NOW() - INTERVAL '1 hour';
    UPDATE borrow_transactions SET actual_pickup_at=NOW(),actual_return_at=NOW()`);
  await expect(state.db.query("UPDATE listings SET status='given_away'")).rejects.toMatchObject({ code:'22P02' });
  for (const id of ['edited','relisted','paused','deleted','lend','reserved','not-handed-over']) {
    await seed(id === 'lend' ? 'lend' : 'giveaway','returned',id);
    await state.db.query(`UPDATE borrow_transactions SET actual_pickup_at=NOW()-INTERVAL '1 hour',actual_return_at=NOW()-INTERVAL '1 hour' WHERE id=$1`,[id]);
    if (id !== 'edited') await state.db.query("UPDATE listings SET updated_at=NOW()-INTERVAL '2 hours' WHERE id=$1",[id]);
  }
  await state.db.exec(`UPDATE listings SET is_available=true WHERE id='relisted';
    UPDATE listings SET status='paused' WHERE id='paused'; UPDATE listings SET status='deleted' WHERE id='deleted';
    UPDATE borrow_transactions SET actual_pickup_at=NULL WHERE id='not-handed-over';
    INSERT INTO borrow_transactions(id,listing_id,status) VALUES('another','reserved','paid')`);
  await ensureExchangeCompletionSchema(); await ensureExchangeCompletionSchema();
  expect((await snapshot()).listing_status).toBe('given_away');
  expect((await state.db.query("SELECT id FROM listings WHERE status='given_away'")).rows).toEqual([{ id:'exchange' }]);
});

it.each(['giveaway','sell'])('rolls back a %s handoff when the listing save fails', async type => {
  await seed(type); await failListingWrite();
  const response = await request(app).post('/rentals/exchange/pickup').send({});
  expect(response.status).toBe(500);
  expect(await snapshot()).toMatchObject({ status:'approved',actual_pickup_at:null,actual_return_at:null,listing_status:'active' });
  expect(sendNotification).not.toHaveBeenCalled();
});

it.each(['lend','giveaway','sell'])('confirms %s pickup once across retries and both API paths', async type => {
  await seed(type);
  const first = await request(app).post('/rentals/exchange/pickup').set('x-user','owner').send({});
  expect(first.status).toBe(200); const saved = await snapshot();
  expect(saved.status).toBe(type === 'lend' ? 'picked_up' : 'returned');
  expect(saved.listing_status).toBe(type === 'lend' ? 'active' : 'given_away');
  const retry = await request(app).post('/transactions/exchange/pickup').send({});
  expect(retry.status).toBe(200); expect(retry.body.alreadyConfirmed).toBe(true);
  expect(await snapshot()).toEqual(saved); expect(sendNotification).toHaveBeenCalledTimes(1);
});

it('does not report a saved pickup as failed when notification delivery fails', async () => {
  await seed('sell'); sendNotification.mockRejectedValueOnce(new Error('push unavailable'));
  expect((await request(app).post('/rentals/exchange/pickup').send({})).status).toBe(200);
  expect((await snapshot()).status).toBe('returned');
});

it('checks participants and state before changing a pickup', async () => {
  await seed('sell');
  expect((await request(app).post('/rentals/exchange/pickup').set('x-user','outsider').send({})).status).toBe(404);
  expect((await request(app).post('/transactions/exchange/pickup').set('x-user','owner').send({})).status).toBe(403);
  expect((await request(app).post('/rentals/exchange/pickup').send({ condition:'broken' })).status).toBe(400);
  await state.db.exec("UPDATE borrow_transactions SET status='cancelled'");
  expect((await request(app).post('/rentals/exchange/pickup').send({})).status).toBe(409);
  expect((await snapshot()).actual_pickup_at).toBeNull();
});

it('declining a competing pending request preserves the active reservation', async () => {
  await seed('lend','paid');
  await state.db.exec("INSERT INTO borrow_transactions(id,listing_id,status) VALUES('competing','exchange','pending')");
  for (let attempt=0;attempt<2;attempt++) expect((await request(app).post('/competing/decline').set('x-user','owner').send({})).status).toBe(200);
  expect((await snapshot()).is_available).toBe(false);
  expect((await snapshot()).status).toBe('paid'); expect(sendNotification).toHaveBeenCalledTimes(1);
});

it('rolls back approval when reserving the item fails and accepts a safe repeat', async () => {
  await seed('lend','pending'); await failListingWrite();
  await expect(approveFreeBorrow('exchange','owner','Yes')).rejects.toThrow();
  expect((await snapshot()).status).toBe('pending');
  await state.db.exec('DROP TRIGGER fail_listing_write ON listings');
  expect(await approveFreeBorrow('exchange','owner','Yes')).toEqual({ alreadyApproved:false });
  expect(await approveFreeBorrow('exchange','owner','Yes')).toEqual({ alreadyApproved:true });
  expect((await snapshot()).is_available).toBe(false);
});

it('rolls back a return if inventory cannot update, then counts retries once', async () => {
  await seed('lend','picked_up'); await failListingWrite();
  await expect(completeFreeReturn('exchange','owner','good')).rejects.toThrow();
  expect(await snapshot()).toMatchObject({ status:'picked_up',actual_return_at:null,times_borrowed:0 });
  await state.db.exec('DROP TRIGGER fail_listing_write ON listings');
  await completeFreeReturn('exchange','owner','good'); const saved = await snapshot();
  expect(saved).toMatchObject({ status:'completed',times_borrowed:1,is_available:true });
  expect(await completeFreeReturn('exchange','borrower','good')).toEqual({ alreadyConfirmed:true });
  expect(await snapshot()).toEqual(saved);
});

it('does not return a transfer, a pending exchange, or an unrelated person’s item', async () => {
  await seed('sell','picked_up');
  expect((await completeFreeReturn('exchange','owner','good')).status).toBe(400);
  expect((await completeFreeReturn('exchange','outsider','good')).status).toBe(404);
  await state.db.exec("UPDATE listings SET listing_type='lend'; UPDATE borrow_transactions SET status='pending'");
  expect((await completeFreeReturn('exchange','owner','good')).status).toBe(409);
});

it('keeps cancellation atomic when the inventory release fails', async () => {
  await seed('lend','paid'); await failListingWrite();
  expect((await request(app).post('/exchange/cancel').send({})).status).toBe(500);
  expect((await snapshot()).status).toBe('paid');
  await state.db.exec('DROP TRIGGER fail_listing_write ON listings');
  expect((await request(app).post('/exchange/cancel').send({})).status).toBe(200);
  expect((await request(app).post('/exchange/cancel').send({})).status).toBe(200);
  expect(sendNotification).toHaveBeenCalledTimes(1);
});
