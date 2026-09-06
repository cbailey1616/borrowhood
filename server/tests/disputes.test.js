// New formal disputes are retired; historical records retain access controls.
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, createTestListing, cleanupTestUser } from './helpers/stripe.js';
import { createTestCommunity, addCommunityMember, createTestTransaction, createTestDispute } from './helpers/fixtures.js';
let app, borrower, lender, organizer, outsider, communityId, listingId, transactionId, disputeId;
beforeAll(async () => {
  app = await createTestApp({ path: '/api/disputes', module: '../../src/routes/disputes.js' });
  [borrower,lender,organizer,outsider] = await Promise.all(['borrower','lender','organizer','outsider'].map(role => createTestUser({ email: `dispute-${role}@borrowhood.test` })));
  communityId = await createTestCommunity({ name: 'History neighborhood', city: 'Upton', state: 'MA' });
  await addCommunityMember(organizer.userId, communityId, 'organizer');
  listingId = await createTestListing(lender.userId);
  await query('UPDATE listings SET community_id=$1 WHERE id=$2', [communityId,listingId]);
  transactionId = await createTestTransaction(borrower.userId,lender.userId,listingId,{ status: 'picked_up', depositAmount: 50 });
  disputeId = await createTestDispute(transactionId,borrower.userId,lender.userId,{ description: 'Historical condition concern', status: 'underReview' });
});
afterAll(async () => {
  await query('DELETE FROM disputes WHERE transaction_id=$1', [transactionId]);
  await query('DELETE FROM borrow_transactions WHERE id=$1', [transactionId]);
  await query('DELETE FROM listing_photos WHERE listing_id=$1', [listingId]);
  await query('DELETE FROM listings WHERE id=$1', [listingId]);
  await query('DELETE FROM community_memberships WHERE community_id=$1', [communityId]);
  await query('DELETE FROM communities WHERE id=$1', [communityId]);
  for (const user of [borrower,lender,organizer,outsider]) if (user) await cleanupTestUser(user.userId);
});
const get = (path,user) => request(app).get('/api/disputes' + path).set('Authorization', `Bearer ${user.token}`);
describe('Retired disputes and private history', () => {
  it('requires authentication', async () => { expect((await request(app).get('/api/disputes')).status).toBe(401); });
  it('rejects creating a new formal dispute without adding a record', async () => {
    const res = await request(app).post('/api/disputes').set('Authorization', `Bearer ${borrower.token}`).send({ transactionId, reason: 'New concern' });
    expect(res.status).toBe(410);
    expect((await query('SELECT COUNT(*)::int AS count FROM disputes WHERE transaction_id=$1', [transactionId])).rows[0].count).toBe(1);
  });
  it.each(['borrower','lender','organizer'])('allows the %s to read relevant history', async role => {
    const user = { borrower,lender,organizer }[role];
    const list = await get('',user);
    expect(list.status).toBe(200);
    expect(list.body.find(d => d.id === disputeId)).toMatchObject({ description: 'Historical condition concern', claimant: { id: borrower.userId }, respondent: { id: lender.userId } });
    const detail = await get('/' + disputeId,user);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: disputeId, description: 'Historical condition concern', transaction: { depositAmount: 50 } });
  });
  it('does not expose history to an unrelated member', async () => {
    expect((await get('',outsider)).body.find(d => d.id === disputeId)).toBeUndefined();
    expect((await get('/' + disputeId,outsider)).status).toBe(403);
  });
  it('returns 404 for missing history', async () => {
    expect((await get('/00000000-0000-0000-0000-000000000000',borrower)).status).toBe(404);
  });
  it('prevents a participant from impersonating a resolver', async () => {
    const res = await request(app).post('/api/disputes/' + disputeId + '/resolve').set('Authorization', `Bearer ${borrower.token}`).send({ outcome: 'claimant', notes: 'Trying to resolve my own claim' });
    expect(res.status).toBe(403);
    expect((await query('SELECT status FROM disputes WHERE id=$1', [disputeId])).rows[0].status).toBe('underReview');
  });
});
