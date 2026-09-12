import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args) }));
import { offerListing, canViewListing, canViewRequest } from '../../src/services/listingAccess.js';
import { requestActiveSql, validRequestTimeZone } from '../../src/utils/requestState.js';
import { requestAccessSql } from '../../src/utils/sharingPolicy.js';

beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`
    CREATE TABLE users (id text PRIMARY KEY, is_verified boolean, city text, state text, status text DEFAULT 'active');
    CREATE TABLE listings (id text PRIMARY KEY, owner_id text, visibility text DEFAULT 'private', privacy_version int DEFAULT 1,
      status text DEFAULT 'active', is_available boolean DEFAULT true, circle_id text, community_id text, listing_type text DEFAULT 'lend', town_preview_enabled boolean DEFAULT false);
    CREATE TABLE friendships (user_id text, friend_id text, status text);
    CREATE TABLE lending_circle_members (circle_id text, user_id text, status text);
    CREATE TABLE community_memberships (community_id text, user_id text);
    CREATE TABLE item_requests (id text PRIMARY KEY, user_id text, visibility text, community_id text,
      status text DEFAULT 'open', expires_at timestamptz, needed_until date, time_zone text DEFAULT 'UTC', town_preview_enabled boolean DEFAULT false);
    CREATE TABLE listing_shares (listing_id text, user_id text, request_id text, revoked_at timestamptz, expires_at timestamptz,
      UNIQUE(listing_id,user_id,request_id));
    CREATE TABLE borrow_transactions (listing_id text, borrower_id text, status text);
  `);
}, 20000);
afterAll(async () => { await state.db?.close(); });
beforeEach(async () => {
  await state.db.exec(`TRUNCATE users,listings,item_requests,listing_shares,friendships,borrow_transactions;
    INSERT INTO users(id,is_verified,city,state) VALUES ('owner',true,'Upton','MA'), ('neighbor',true,' upton ','ma'), ('outsider',true,'Upton','NY');
    INSERT INTO listings(id,owner_id) VALUES ('drill','owner'), ('private-saw','owner');
    INSERT INTO item_requests(id,user_id,visibility) VALUES ('request','neighbor','town');`);
});

it('requires Town identity verification only for borrow listings', async () => {
  await state.db.exec("UPDATE users SET is_verified=false WHERE id='neighbor'; UPDATE listings SET visibility='town', town_preview_enabled=true WHERE id='drill'");
  expect(await canViewListing('drill', 'neighbor')).toBe(false);
  for (const type of ['giveaway', 'sell']) {
    await state.db.query('UPDATE listings SET listing_type=$1 WHERE id=$2', [type, 'drill']);
    expect(await canViewListing('drill', 'neighbor')).toBe(true);
    expect(await canViewListing('drill', 'outsider')).toBe(false);
  }
  await state.db.exec("UPDATE listings SET visibility='private' WHERE id='drill'");
  expect(await canViewListing('drill', 'neighbor')).toBe(false);
  await state.db.exec("UPDATE listings SET visibility='town', town_preview_enabled=false WHERE id='drill'");
  expect(await canViewListing('drill', 'neighbor')).toBe(false);
});

it('shows Town request identities without verification while keeping their selected audience', async () => {
  await state.db.exec("UPDATE users SET is_verified=false WHERE id='owner'; UPDATE item_requests SET town_preview_enabled=true");
  expect(await canViewRequest('request', 'owner')).toBe(true);
  expect(await canViewRequest('request', 'outsider')).toBe(false);
  for (const visibility of ['close_friends', 'neighborhood']) {
    await state.db.query('UPDATE item_requests SET visibility=$1', [visibility]);
    expect(await canViewRequest('request', 'owner')).toBe(false);
  }
  await state.db.exec("UPDATE item_requests SET visibility='town'; UPDATE users SET status='suspended' WHERE id='owner'");
  expect(await canViewRequest('request', 'owner')).toBe(false);
});

it('sends a private offer and grants the requester access to only that item', async () => {
  expect(await canViewListing('drill','neighbor')).toBe(false);
  expect(await offerListing('request','drill','owner')).toBe('neighbor');
  expect(await canViewListing('drill','neighbor')).toBe(true);
  expect(await canViewListing('private-saw','neighbor')).toBe(false);
  expect(await canViewListing('drill','outsider')).toBe(false);
  expect(await canViewListing('drill','neighbor',{ discovery: true })).toBe(false);
  await offerListing('request','drill','owner');
  expect((await state.db.query('SELECT * FROM listing_shares')).rows).toHaveLength(1);
});

it.each(["status='closed'", "expires_at=NOW()-INTERVAL '1 second'", 'needed_until=(NOW() AT TIME ZONE time_zone)::date-1'])('explains ended requests without creating an offer: %s', async change => {
  await state.db.exec(`UPDATE item_requests SET ${change}`);
  await expect(offerListing('request','drill','owner')).rejects.toMatchObject({ status: 410, code: 'REQUEST_ENDED' });
  expect((await state.db.query('SELECT * FROM listing_shares')).rows).toHaveLength(0);
});

it('rejects unavailable inventory and requests outside the lender audience', async () => {
  await state.db.exec('UPDATE listings SET is_available=false');
  await expect(offerListing('request','drill','owner')).rejects.toMatchObject({ status: 409, code: 'OFFER_UNAVAILABLE' });
  await expect(offerListing('request','drill','outsider')).rejects.toMatchObject({ status: 404 });
  await expect(offerListing('request','drill','neighbor')).rejects.toMatchObject({ code: 'OWN_REQUEST' });
});

it('ends private offer access when the request expires', async () => {
  await offerListing('request','drill','owner');
  await state.db.exec("UPDATE item_requests SET expires_at=NOW()-INTERVAL '1 second'");
  expect(await canViewListing('drill','neighbor')).toBe(false);
});

it('keeps Today requests visible through local midnight, including daylight saving time', async () => {
  for (const [date, before, after] of [
    ['2026-09-06','2026-09-07T03:59:59Z','2026-09-07T04:00:00Z'],
    ['2026-11-01','2026-11-02T04:59:59Z','2026-11-02T05:00:00Z'],
  ]) {
    await state.db.query("UPDATE item_requests SET needed_until=$1, time_zone='America/New_York'",[date]);
    const visibleAt = async now => (await state.db.query(`SELECT id FROM item_requests r
      WHERE ${requestActiveSql('r','$1::timestamptz')} AND ${requestAccessSql('r',"'owner'")}`, [now])).rows;
    expect(await visibleAt(before)).toHaveLength(1);
    expect(await visibleAt(after)).toHaveLength(0);
  }
});

it('allows requests shared through either friendship or town, without exposing them to outsiders', async () => {
  await state.db.exec("UPDATE item_requests SET visibility='close_friends,town'; UPDATE users SET is_verified=false WHERE id='owner'; INSERT INTO friendships VALUES ('owner','neighbor','accepted')");
  expect(await offerListing('request','drill','owner')).toBe('neighbor');
  await state.db.exec('DELETE FROM friendships');
  await expect(offerListing('request','drill','owner')).rejects.toMatchObject({ status: 404 });
});

it('rejects invalid timezone names', () => {
  expect(validRequestTimeZone('America/New_York')).toBe(true);
  for (const value of [null, '', 'Not/A_Timezone', 'UTC; SELECT 1']) expect(validRequestTimeZone(value)).toBe(false);
});

it('hides a suspended owner from friends and private offers while retaining an existing exchange record', async () => {
  await offerListing('request','drill','owner');
  await state.db.exec("UPDATE listings SET visibility='close_friends'; INSERT INTO friendships VALUES ('owner','neighbor','accepted')");
  expect(await canViewListing('drill','neighbor',{ discovery:true })).toBe(true);
  await state.db.exec("UPDATE users SET status='suspended' WHERE id='owner'");
  expect(await canViewListing('drill','neighbor',{ discovery:true })).toBe(false);
  expect(await canViewListing('drill','neighbor')).toBe(false);
  await state.db.exec("INSERT INTO borrow_transactions VALUES ('drill','neighbor','picked_up')");
  expect(await canViewListing('drill','neighbor')).toBe(true);
});
