import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args) }));
import { canViewListing, canViewRequest, offerListing } from '../../src/services/listingAccess.js';
import { canPreviewTownPost } from '../../src/services/townPreview.js';
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, city TEXT, state TEXT, is_verified BOOLEAN, status TEXT DEFAULT 'active');
    CREATE TABLE listings(id TEXT PRIMARY KEY, owner_id TEXT, visibility TEXT, community_id TEXT, circle_id TEXT,
      status TEXT DEFAULT 'active', listing_type TEXT DEFAULT 'lend', privacy_version INT DEFAULT 1,
      town_preview_enabled BOOLEAN DEFAULT true, is_available BOOLEAN DEFAULT true);
    CREATE TABLE item_requests(id TEXT PRIMARY KEY, user_id TEXT, visibility TEXT DEFAULT 'town', community_id TEXT,
      status TEXT DEFAULT 'open', expires_at TIMESTAMPTZ, needed_until DATE, time_zone TEXT DEFAULT 'UTC', town_preview_enabled BOOLEAN DEFAULT false);
    CREATE TABLE friendships(user_id TEXT, friend_id TEXT, status TEXT);
    CREATE TABLE community_memberships(community_id TEXT, user_id TEXT);
    CREATE TABLE lending_circle_members(circle_id TEXT, user_id TEXT, status TEXT);
    CREATE TABLE listing_shares(listing_id TEXT, user_id TEXT, request_id TEXT, revoked_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
      UNIQUE(listing_id,user_id,request_id));
    CREATE TABLE borrow_transactions(listing_id TEXT, borrower_id TEXT, status TEXT);`);
}, 20000);
beforeEach(async () => {
  await state.db.exec(`TRUNCATE users,listings,item_requests,friendships,community_memberships,lending_circle_members,listing_shares,borrow_transactions;
    INSERT INTO users(id,city,state,is_verified) VALUES('owner','Upton','MA',true),('friend','Upton','MA',false),
      ('neighbor','Upton','MA',false),('verified',' upton ','ma',true),('other-town','Upton','NY',true);
    INSERT INTO listings(id,owner_id,visibility,community_id,circle_id) VALUES
      ('private','owner','private',NULL,NULL),('friends','owner','close_friends',NULL,NULL),
      ('neighborhood','owner','neighborhood','block',NULL),('town','owner','town',NULL,NULL),
      ('circle','owner','circle',NULL,'garden');
    INSERT INTO friendships VALUES('owner','friend','accepted');
    INSERT INTO community_memberships VALUES('block','owner'),('block','neighbor');
    INSERT INTO lending_circle_members VALUES('garden','owner','active'),('garden','neighbor','active');
    INSERT INTO item_requests(id,user_id,expires_at) VALUES('need','verified',NOW()+INTERVAL '1 day');`);
});
afterAll(async () => state.db.close());

it.each([
  ['owner', ['private','friends','neighborhood','town','circle']],
  ['friend', ['friends']], ['neighbor', ['neighborhood','circle']], ['verified', ['town']], ['other-town', []],
])('enforces all listing audiences for %s', async (viewer, allowed) => {
  for (const id of ['private','friends','neighborhood','town','circle']) {
    expect(await canViewListing(id, viewer), `${viewer}/${id}`).toBe(allowed.includes(id));
  }
});

it('permits town previews while keeping town borrow and discussion access gated', async () => {
  expect(await canPreviewTownPost('town','friend')).toBe(true);
  expect(await canViewListing('town','friend')).toBe(false);
  expect(await canPreviewTownPost('town','other-town')).toBe(false);
  await state.db.exec("UPDATE listings SET listing_type='giveaway' WHERE id='town'");
  expect(await canViewListing('town','friend')).toBe(true);
  await state.db.exec("UPDATE listings SET town_preview_enabled=false WHERE id='town'");
  expect(await canViewListing('town','friend')).toBe(false);
});

it('revokes relationship access when friendship or membership ends', async () => {
  await state.db.exec("DELETE FROM friendships; DELETE FROM community_memberships WHERE user_id='neighbor'; UPDATE lending_circle_members SET status='pending' WHERE user_id='neighbor'");
  expect(await canViewListing('friends','friend')).toBe(false);
  expect(await canViewListing('neighborhood','neighbor')).toBe(false);
  expect(await canViewListing('circle','neighbor')).toBe(false);
});

it('limits a private offer to its recipient and live request without adding it to discovery', async () => {
  await offerListing('need','private','owner');
  expect(await canViewListing('private','verified')).toBe(true);
  expect(await canViewListing('private','verified',{ discovery: true })).toBe(false);
  expect(await canViewListing('private','friend')).toBe(false);
  await state.db.exec("UPDATE listing_shares SET revoked_at=NOW()");
  expect(await canViewListing('private','verified')).toBe(false);
  await state.db.exec("UPDATE listing_shares SET revoked_at=NULL,expires_at=NOW()-INTERVAL '1 second'");
  expect(await canViewListing('private','verified')).toBe(false);
  await state.db.exec("UPDATE listing_shares SET expires_at=NOW()+INTERVAL '1 day'; UPDATE item_requests SET status='closed'");
  expect(await canViewListing('private','verified')).toBe(false);
});

it('keeps established exchange access while preventing discovery of private inventory', async () => {
  await state.db.exec("INSERT INTO borrow_transactions VALUES('private','friend','paid')");
  expect(await canViewListing('private','friend')).toBe(true);
  expect(await canViewListing('private','friend',{ discovery: true })).toBe(false);
  expect(await canViewListing('private','neighbor')).toBe(false);
});

it('uses request membership and hides suspended owners from audiences and previews', async () => {
  await state.db.exec("INSERT INTO item_requests(id,user_id,visibility,community_id) VALUES('group','owner','neighborhood','block')");
  expect(await canViewRequest('group','neighbor')).toBe(true);
  expect(await canViewRequest('group','verified')).toBe(false);
  await state.db.exec("UPDATE users SET status='suspended' WHERE id='owner'");
  expect(await canViewRequest('group','neighbor')).toBe(false);
  expect(await canViewListing('friends','friend')).toBe(false);
  expect(await canPreviewTownPost('town','verified')).toBe(false);
});
