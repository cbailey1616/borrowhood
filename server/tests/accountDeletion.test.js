import { beforeAll, afterEach, expect, it } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, createTestListing, cleanupTestUser } from './helpers/stripe.js';
import { sendNotification } from '../src/services/notifications.js';
let app;
const users = [];
beforeAll(async () => { app = await createTestApp({ path:'/api/auth',module:'../../src/routes/auth.js' }); });
afterEach(async () => {
  for (const user of users.splice(0)) await cleanupTestUser(user.userId);
});
async function fixture(status) {
  const owner = await createTestUser(), borrower = await createTestUser();
  users.push(borrower,owner);
  const listing = await createTestListing(owner.userId,{ isFree:true });
  await query('UPDATE listings SET is_available=false WHERE id=$1',[listing]);
  const { rows:[exchange] } = await query(`INSERT INTO borrow_transactions
    (listing_id,borrower_id,lender_id,status,requested_start_date,requested_end_date,rental_days,daily_rate,rental_fee,deposit_amount,platform_fee,lender_payout)
    VALUES($1,$2,$3,$4,CURRENT_DATE,CURRENT_DATE+1,1,0,0,0,0,0) RETURNING id`,[listing,borrower.userId,owner.userId,status]);
  await sendNotification(owner.userId,'borrow_request',{ transactionId:exchange.id,listingId:listing,fromUserId:borrower.userId });
  return { owner,borrower,listing,exchange:exchange.id };
}
it('deletes a pending requester with real notification foreign keys without reopening the item', async () => {
  const f = await fixture('pending');
  const response = await request(app).delete('/api/auth/account').set('Authorization',`Bearer ${f.borrower.token}`);
  expect(response.status,JSON.stringify(response.body)).toBe(200);
  expect((await query('SELECT id FROM users WHERE id=$1',[f.borrower.userId])).rows).toHaveLength(0);
  expect((await query('SELECT is_available FROM listings WHERE id=$1',[f.listing])).rows[0].is_available).toBe(false);
});
it('releases an offline approved reservation using the production schema', async () => {
  const f = await fixture('paid');
  const response = await request(app).delete('/api/auth/account').set('Authorization',`Bearer ${f.borrower.token}`);
  expect(response.status,JSON.stringify(response.body)).toBe(200);
  expect((await query('SELECT is_available FROM listings WHERE id=$1',[f.listing])).rows[0].is_available).toBe(true);
});
it('keeps the record and support notification when an owner leaves during a return', async () => {
  const f = await fixture('return_pending');
  const response = await request(app).delete('/api/auth/account').set('Authorization',`Bearer ${f.owner.token}`);
  expect(response.status,JSON.stringify(response.body)).toBe(200);
  expect((await query('SELECT status FROM borrow_transactions WHERE id=$1',[f.exchange])).rows[0].status).toBe('account_deleted');
  expect((await query('SELECT status FROM listings WHERE id=$1',[f.listing])).rows[0].status).toBe('paused');
  const notices = (await query("SELECT transaction_id,body FROM notifications WHERE user_id=$1 AND type='exchange_account_deleted'",[f.borrower.userId])).rows;
  expect(notices).toHaveLength(1); expect(notices[0].transaction_id).toBe(f.exchange);
  expect(notices[0].body).toContain('Contact support');
});
