import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { query } from '../src/utils/db.js';
import * as db from '../src/utils/db.js';
import { expireGiveawayPickups } from '../src/services/scheduler.js';

describe('Current workflow failure and retry behavior on PostgreSQL', () => {
  let app, owner, neighbor, ownerToken, neighborToken;
  const testCommunityIds = [];
  const auth = token => ({ Authorization: `Bearer ${token}` });
  const ownedPhoto = suffix => `https://borrowhood-uploads.s3.us-east-1.amazonaws.com/listings/${owner}/${suffix}.jpg`;
  const createListing = body => request(app).post('/listings').set(auth(ownerToken)).send({
    title: 'Atomic item', condition: 'good', isFree: true, visibility: ['private'], listingType: 'lend', ...body,
  });
  const seedExchange = async (type = 'lend', status = 'paid', listingId) => {
    const listing = listingId || (await query(`INSERT INTO listings(owner_id,title,condition,is_free,visibility,privacy_version,listing_type,is_available)
      VALUES($1,'Atomic item','good',true,'private',1,$2,false) RETURNING id`, [owner,type])).rows[0].id;
    const exchange = (await query(`INSERT INTO borrow_transactions(listing_id,borrower_id,lender_id,requested_start_date,requested_end_date,
      rental_days,daily_rate,rental_fee,deposit_amount,platform_fee,lender_payout,status,payment_status,condition_at_pickup,actual_pickup_at)
      VALUES($1,$2,$3,CURRENT_DATE,CURRENT_DATE+1,1,0,0,0,0,0,$4::varchar,'none','good',CASE WHEN $4::varchar='picked_up' THEN NOW() ELSE NULL END)
      RETURNING id`, [listing,neighbor,owner,status])).rows[0].id;
    return { listing, exchange };
  };
  const failWrites = async (table, operation = 'INSERT') => {
    await query(`CREATE OR REPLACE FUNCTION mutation_test_failure() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'simulated mutation failure'; END $$ LANGUAGE plpgsql`);
    await query(`CREATE TRIGGER mutation_test_failure BEFORE ${operation} ON ${table}
      FOR EACH ROW EXECUTE FUNCTION mutation_test_failure()`);
  };
  beforeAll(async () => {
    app = express(); app.use(express.json());
    app.use('/messages', (await import('../src/routes/messages.js')).default);
    app.use('/listings', (await import('../src/routes/listings.js')).default);
    app.use('/requests', (await import('../src/routes/requests.js')).default);
    app.use('/rentals', (await import('../src/routes/rentals.js')).default);
    app.use('/transactions', (await import('../src/routes/transactions.js')).default);
    app.use('/auth', (await import('../src/routes/auth.js')).default);
    const tag = randomUUID();
    [owner,neighbor] = (await query(`INSERT INTO users(email,password_hash,first_name,last_name,status,is_verified,city,state)
      VALUES($1,'unused','Atomic','Owner','verified',true,'Upton','MA'),($2,'unused','Atomic','Neighbor','verified',true,'Upton','MA') RETURNING id`,
      [`atomic-owner-${tag}@example.invalid`,`atomic-neighbor-${tag}@example.invalid`])).rows.map(row => row.id);
    ownerToken = jwt.sign({ userId:owner },process.env.JWT_SECRET,{ expiresIn:'1h' });
    neighborToken = jwt.sign({ userId:neighbor },process.env.JWT_SECRET,{ expiresIn:'1h' });
  });
  afterEach(async () => {
    for (const table of ['listing_photos','listing_shares','item_requests','listings']) {
      await query(`DROP TRIGGER IF EXISTS mutation_test_failure ON ${table}`);
    }
    await query('DROP FUNCTION IF EXISTS mutation_test_failure()');
  });
  afterAll(async () => {
    await query('DELETE FROM notifications WHERE user_id IN ($1,$2) OR from_user_id IN ($1,$2)',[owner,neighbor]);
    await query('DELETE FROM conversations WHERE user1_id IN ($1,$2) OR user2_id IN ($1,$2)',[owner,neighbor]);
    await query('DELETE FROM borrow_transactions WHERE lender_id=$1',[owner]);
    await query('DELETE FROM listing_shares WHERE listing_id IN (SELECT id FROM listings WHERE owner_id=$1)',[owner]);
    await query('DELETE FROM listings WHERE owner_id=$1',[owner]);
    await query('DELETE FROM item_requests WHERE user_id IN ($1,$2)',[owner,neighbor]);
    await query('DELETE FROM users WHERE id IN ($1,$2)',[owner,neighbor]);
    await query('DELETE FROM communities WHERE id = ANY($1::uuid[])', [testCommunityIds]);
  });

  it('does not leave a new listing behind if a photo save fails', async () => {
    await failWrites('listing_photos');
    const title = `Failed photo ${randomUUID()}`;
    expect((await createListing({ title, photos:[ownedPhoto('new')] })).status).toBe(500);
    expect((await query('SELECT id FROM listings WHERE title=$1',[title])).rows).toHaveLength(0);
  });
  it('preserves the original title and photos when replacing photos fails', async () => {
    const created = await createListing({ photos:[ownedPhoto('original')] }); expect(created.status).toBe(201);
    await failWrites('listing_photos');
    expect((await request(app).patch(`/listings/${created.body.id}`).set(auth(ownerToken)).send({ title:'Changed title',photos:[ownedPhoto('replacement')] })).status).toBe(500);
    expect((await query('SELECT title FROM listings WHERE id=$1',[created.body.id])).rows[0].title).toBe('Atomic item');
    expect((await query('SELECT url FROM listing_photos WHERE listing_id=$1',[created.body.id])).rows).toEqual([{ url:ownedPhoto('original') }]);
  });
  it('can explicitly remove all listing photos without leaving old images', async () => {
    const created = await createListing({ photos:[ownedPhoto('remove')] });
    expect((await request(app).patch(`/listings/${created.body.id}`).set(auth(ownerToken)).send({ photos:[] })).status).toBe(200);
    expect((await query('SELECT id FROM listing_photos WHERE listing_id=$1',[created.body.id])).rows).toHaveLength(0);
  });
  it('rolls back a new item if its requested private offer cannot save', async () => {
    const needed = (await query(`INSERT INTO item_requests(user_id,title,visibility,status,expires_at)
      VALUES($1,'Atomic request','town','open',NOW()+INTERVAL '1 day') RETURNING id`,[neighbor])).rows[0].id;
    await failWrites('listing_shares'); const title = `Failed offer ${randomUUID()}`;
    const response = await createListing({ title,requestMatchId:needed,photos:[ownedPhoto('offer')] });
    expect(response.status, JSON.stringify(response.body)).toBe(500);
    expect((await query('SELECT id FROM listings WHERE title=$1',[title])).rows).toHaveLength(0);
  });
  it('retires automatic matching while preserving deliberate item offers', async () => {
    const community = (await query(`INSERT INTO communities(name,slug,city,state)
      VALUES('Request test',$1,'Upton','MA') RETURNING id`, [`requests-${randomUUID()}`])).rows[0].id;
    testCommunityIds.push(community);
    await query('INSERT INTO community_memberships(user_id,community_id) VALUES($1,$3),($2,$3)', [owner,neighbor,community]);
    const needed = (await query(`INSERT INTO item_requests(user_id,community_id,title,visibility,privacy_version,status,expires_at)
      VALUES($1,$2,'Cordless drill','town',1,'open',NOW()+INTERVAL '1 day') RETURNING id`, [neighbor,community])).rows[0].id;
    const listed = await createListing({ title: 'Cordless drill', communityId: community, visibility: ['town'], sharingConfirmed: true });
    expect(listed.status).toBe(201);
    expect((await query('SELECT id FROM notifications WHERE listing_id=$1', [listed.body.id])).rows).toHaveLength(0);
    const suggestions = await request(app).get('/requests/suggestions?title=Cordless%20drill').set(auth(neighborToken));
    expect(suggestions.status).toBe(200);
    expect(suggestions.body).toEqual({ suggestions: [] });
    expect((await request(app).post(`/requests/${needed}/offers`).set(auth(ownerToken)).send({ listingId: listed.body.id })).status).toBe(201);
    const createdOffer = await createListing({ title: 'A privately offered drill', requestMatchId: needed });
    expect(createdOffer.status).toBe(201);
    const notices = await query('SELECT type,request_id,listing_id FROM notifications WHERE request_id=$1 ORDER BY created_at', [needed]);
    expect(notices.rows).toEqual([
      { type: 'request_offer', request_id: needed, listing_id: listed.body.id },
      { type: 'request_offer', request_id: needed, listing_id: createdOffer.body.id },
    ]);
  });
  it('does not leave a request behind if its town preview choice cannot save', async () => {
    await failWrites('item_requests','UPDATE'); const title = `Failed request ${randomUUID()}`;
    expect((await request(app).post('/requests').set(auth(ownerToken)).send({ title,visibility:['town'],townPreviewEnabled:true })).status).toBe(500);
    expect((await query('SELECT id FROM item_requests WHERE title=$1',[title])).rows).toHaveLength(0);
  });
  it.each(['giveaway','sell'])('makes simultaneous %s pickups succeed as one handoff', async type => {
    const { listing,exchange } = await seedExchange(type);
    const responses = await Promise.all([request(app).post(`/rentals/${exchange}/pickup`).set(auth(ownerToken)).send({}),
      request(app).post(`/transactions/${exchange}/pickup`).set(auth(neighborToken)).send({})]);
    expect(responses.map(res => res.status)).toEqual([200,200]);
    expect(responses.filter(res => res.body.alreadyConfirmed)).toHaveLength(1);
    expect((await query('SELECT status,is_available FROM listings WHERE id=$1',[listing])).rows[0]).toEqual({ status:'given_away',is_available:false });
    expect((await query('SELECT status FROM borrow_transactions WHERE id=$1',[exchange])).rows[0].status).toBe('returned');
  });
  it('confirms a return once when both neighbors tap together', async () => {
    const { listing,exchange } = await seedExchange('lend','picked_up');
    const responses = await Promise.all([ownerToken,neighborToken].map(token => request(app).post(`/rentals/${exchange}/return`).set(auth(token)).send({ condition:'good' })));
    expect(responses.map(res => res.status)).toEqual([200,200]);
    expect((await query('SELECT times_borrowed,is_available FROM listings WHERE id=$1',[listing])).rows[0]).toEqual({ times_borrowed:1,is_available:true });
  });
  it('does not release an active reservation when another request is declined', async () => {
    const { listing } = await seedExchange(); const { exchange } = await seedExchange('lend','pending',listing);
    expect((await request(app).post(`/rentals/${exchange}/decline`).set(auth(ownerToken)).send({})).status).toBe(200);
    expect((await query('SELECT is_available FROM listings WHERE id=$1',[listing])).rows[0].is_available).toBe(false);
  });
  it('acknowledges duplicate approvals without duplicating notifications', async () => {
    const { listing,exchange } = await seedExchange('lend','pending'); await query('UPDATE listings SET is_available=true WHERE id=$1',[listing]);
    const responses = await Promise.all(['/rentals','/transactions'].map(prefix => request(app).post(`${prefix}/${exchange}/approve`).set(auth(ownerToken)).send({})));
    expect(responses.map(res => res.status)).toEqual([200,200]);
    expect((await query("SELECT id FROM notifications WHERE transaction_id=$1 AND type='request_approved'",[exchange])).rows).toHaveLength(1);
  });
  it('never lets a cancellation race overwrite a confirmed sale pickup', async () => {
    const { listing,exchange } = await seedExchange('sell');
    const responses = await Promise.all([request(app).post(`/rentals/${exchange}/pickup`).set(auth(ownerToken)).send({}),
      request(app).post(`/rentals/${exchange}/cancel`).set(auth(neighborToken)).send({})]);
    expect(responses.map(res => res.status).sort()).toEqual([200,409]);
    const current = (await query(`SELECT bt.status,l.status AS listing_status,l.is_available
      FROM borrow_transactions bt JOIN listings l ON l.id=bt.listing_id WHERE bt.id=$1`,[exchange])).rows[0];
    expect(current).toEqual(current.status === 'cancelled'
      ? { status:'cancelled',listing_status:'active',is_available:true }
      : { status:'returned',listing_status:'given_away',is_available:false });
  });
  it('never revives a paused listing when an uncollected sale expires', async () => {
    const { listing,exchange } = await seedExchange('sell');
    // The baseline updated_at trigger replaces ordinary UPDATE timestamps.
    await query('ALTER TABLE borrow_transactions DISABLE TRIGGER USER');
    try { await query("UPDATE borrow_transactions SET updated_at=NOW()-INTERVAL '8 days' WHERE id=$1",[exchange]); }
    finally { await query('ALTER TABLE borrow_transactions ENABLE TRIGGER USER'); }
    await query("UPDATE listings SET status='paused' WHERE id=$1",[listing]);
    await expireGiveawayPickups();
    expect((await query('SELECT status FROM borrow_transactions WHERE id=$1',[exchange])).rows[0].status).toBe('cancelled');
    expect((await query('SELECT status FROM listings WHERE id=$1',[listing])).rows[0].status).toBe('paused');
  });
  it('returns a delivered message even if preparing its notification fails', async () => {
    const original = db.query;
    const spy = vi.spyOn(db,'query').mockImplementation((sql, params) =>
      sql.includes('SELECT first_name, display_name FROM users')
        ? Promise.reject(new Error('simulated notification lookup failure')) : original(sql,params));
    try {
      const result = await request(app).post('/messages').set(auth(ownerToken)).send({ recipientId:neighbor,content:'Already sent',clientRequestId:randomUUID() });
      expect(result.status).toBe(201);
      expect((await original('SELECT content FROM messages WHERE id=$1',[result.body.id])).rows[0].content).toBe('Already sent');
    } finally { spy.mockRestore(); }
  });
  it('resets identity verification using a supported account status', async () => {
    const response = await request(app).post('/auth/reset-verification').set(auth(ownerToken)).send({});
    expect(response.status).toBe(200);
    expect((await query('SELECT status,is_verified FROM users WHERE id=$1',[owner])).rows[0]).toEqual({ status:'pending',is_verified:false });
  });
});
