// Real PostgreSQL policy checks, intentionally independent of app startup,
// migrations, .env loading, notifications, Stripe and production DATABASE_URL.
// Only temporary tables in a rollback-only transaction are used.
import assert from 'node:assert/strict';
import pg from 'pg';
import { listingAccessSql, requestAccessSql } from '../src/utils/sharingPolicy.js';

const connectionString = process.env.PRIVACY_TEST_DATABASE_URL;
if (!connectionString) {
  console.error('Not run: set PRIVACY_TEST_DATABASE_URL to a local borrowhood_privacy_test database. Production DATABASE_URL is never used.');
  process.exit(2);
}
const target = new URL(connectionString);
if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || target.pathname !== '/borrowhood_privacy_test' || target.search || target.hash) {
  console.error('Refusing connection: use a local database named borrowhood_privacy_test, with no URL options.');
  process.exit(2);
}

const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 3000 });
let checks = 0;
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL search_path TO pg_temp; SET LOCAL statement_timeout = '5s'");
  await client.query(`
    CREATE TEMP TABLE users (id text, is_verified boolean, city text, state text, status text DEFAULT 'pending');
    CREATE TEMP TABLE listings (id text, owner_id text, visibility text, privacy_version integer, status text, circle_id text, community_id text);
    CREATE TEMP TABLE friendships (user_id text, friend_id text, status text);
    CREATE TEMP TABLE lending_circle_members (circle_id text, user_id text, status text);
    CREATE TEMP TABLE community_memberships (community_id text, user_id text);
    CREATE TEMP TABLE item_requests (id text, user_id text, visibility text, community_id text, status text, expires_at timestamptz, needed_until date, time_zone text DEFAULT 'UTC');
    CREATE TEMP TABLE listing_shares (listing_id text, user_id text, request_id text, revoked_at timestamptz, expires_at timestamptz);
    CREATE TEMP TABLE borrow_transactions (listing_id text, borrower_id text, status text);
    INSERT INTO users (id, is_verified, city, state) VALUES ('owner', true, 'Upton', 'MA'), ('neighbor', true, ' upton ', 'ma'),
      ('friend', false, 'Upton', 'MA'), ('outsider', true, 'Upton', 'NY');
    INSERT INTO listings (id, owner_id, visibility, privacy_version, status, circle_id) VALUES ('private', 'owner', 'private', 1, 'active', NULL),
      ('friends', 'owner', 'close_friends', 1, 'active', NULL),
      ('group', 'owner', 'circle', 1, 'active', 'garden'),
      ('town', 'owner', 'town', 1, 'active', NULL),
      ('legacy', 'owner', 'town', 0, 'active', NULL),
      ('null-scope', 'owner', NULL, 1, 'active', NULL);
    INSERT INTO item_requests VALUES ('request', 'neighbor', 'town', NULL, 'open', NULL, NULL),
      ('group-request', 'owner', 'neighborhood', 'block', 'open', NULL, NULL);
  `);
  const checkItem = async (item, viewer, allowed, discovery = false) => {
    const result = await client.query(`SELECT ${listingAccessSql('l', '$2', { discovery })} AS allowed FROM listings l WHERE id = $1`, [item, viewer]);
    assert.equal(result.rows[0].allowed, allowed, `${item} / ${viewer} / discovery=${discovery}`);
    checks++;
  };
  await checkItem('private', 'owner', true);
  await checkItem('private', 'neighbor', false);
  await checkItem('null-scope', 'neighbor', false);
  await checkItem('legacy', 'neighbor', false);
  await checkItem('legacy', 'owner', true);
  await checkItem('town', 'neighbor', true);
  await checkItem('town', 'friend', false);
  await checkItem('town', 'outsider', false);
  await client.query("UPDATE users SET is_verified = false WHERE id = 'owner'");
  await checkItem('town', 'neighbor', true);
  await checkItem('town', 'friend', false);
  await client.query("UPDATE users SET status = 'suspended' WHERE id = 'owner'");
  await checkItem('town', 'neighbor', false);
  await client.query("UPDATE users SET is_verified = true, status = 'pending' WHERE id = 'owner'");
  await client.query("INSERT INTO friendships VALUES ('friend', 'owner', 'pending')");
  await checkItem('friends', 'friend', false);
  await client.query("UPDATE friendships SET status = 'accepted'");
  await checkItem('friends', 'friend', true);
  await checkItem('private', 'friend', false);
  await client.query("DELETE FROM friendships");
  await checkItem('friends', 'friend', false);
  await client.query("INSERT INTO lending_circle_members VALUES ('garden', 'owner', 'active'), ('garden', 'friend', 'pending')");
  await checkItem('group', 'friend', false);
  await client.query("UPDATE lending_circle_members SET status = 'active' WHERE user_id = 'friend'");
  await checkItem('group', 'friend', true);
  await client.query("UPDATE lending_circle_members SET status = 'removed' WHERE user_id = 'owner'");
  await checkItem('group', 'friend', false);
  await client.query("INSERT INTO listing_shares VALUES ('private', 'neighbor', 'request', NULL, NOW() + INTERVAL '1 day')");
  await checkItem('private', 'neighbor', true);
  await checkItem('private', 'neighbor', false, true);
  await checkItem('private', 'outsider', false);
  await client.query("UPDATE item_requests SET status = 'closed' WHERE id = 'request'");
  await checkItem('private', 'neighbor', false);
  await client.query("UPDATE item_requests SET status = 'open', needed_until = CURRENT_DATE - 1 WHERE id = 'request'");
  await checkItem('private', 'neighbor', false);
  await client.query("UPDATE item_requests SET needed_until = NULL WHERE id = 'request'; UPDATE listing_shares SET expires_at = NOW() - INTERVAL '1 minute'");
  await checkItem('private', 'neighbor', false);
  await client.query("UPDATE listing_shares SET expires_at = NOW() + INTERVAL '1 day', revoked_at = NOW()");
  await checkItem('private', 'neighbor', false);
  await client.query("INSERT INTO borrow_transactions VALUES ('private', 'neighbor', 'pending')");
  await checkItem('private', 'neighbor', false);
  await client.query("UPDATE borrow_transactions SET status = 'approved'");
  await checkItem('private', 'neighbor', true);
  await checkItem('private', 'neighbor', false, true);
  for (const status of ['paid', 'picked_up', 'return_pending', 'returned', 'completed', 'disputed']) {
    await client.query('UPDATE borrow_transactions SET status = $1', [status]);
    await checkItem('private', 'neighbor', true);
    await checkItem('private', 'neighbor', false, true);
  }
  for (const status of ['pending', 'rejected', 'cancelled', 'account_deleted']) {
    await client.query('UPDATE borrow_transactions SET status = $1', [status]);
    await checkItem('private', 'neighbor', false);
  }
  await client.query("UPDATE borrow_transactions SET status = 'completed'");
  await client.query("UPDATE listings SET status = 'deleted' WHERE id = 'private'");
  await checkItem('private', 'neighbor', false);
  await client.query("INSERT INTO community_memberships VALUES ('block', 'owner'), ('block', 'friend')");
  await client.query(`INSERT INTO listings (id, owner_id, visibility, privacy_version, status, community_id)
    VALUES ('neighborhood', 'owner', 'neighborhood', 1, 'active', 'block'),
      ('combined', 'owner', 'close_friends,neighborhood', 1, 'active', 'block'),
      ('legacy-neighborhood', 'owner', 'neighborhood', 0, 'active', 'block')`);
  await checkItem('neighborhood', 'friend', true, true);
  await checkItem('neighborhood', 'neighbor', false, true);
  await checkItem('combined', 'friend', true, true);
  await checkItem('legacy-neighborhood', 'friend', false, true);
  await client.query("INSERT INTO community_memberships VALUES ('other-block', 'outsider')");
  await checkItem('neighborhood', 'outsider', false, true);
  await client.query("DELETE FROM community_memberships WHERE user_id = 'friend'");
  await checkItem('neighborhood', 'friend', false, true);
  await client.query("INSERT INTO friendships VALUES ('owner', 'friend', 'accepted')");
  await checkItem('combined', 'friend', true, true);
  await checkItem('neighborhood', 'friend', false, true);
  await client.query("INSERT INTO community_memberships VALUES ('block', 'friend'); DELETE FROM community_memberships WHERE user_id = 'owner'");
  await checkItem('neighborhood', 'friend', false, true);
  await client.query("INSERT INTO community_memberships VALUES ('block', 'owner')");
  for (const [viewer, expected] of [['friend', true], ['neighbor', false]]) {
    const result = await client.query(`SELECT ${requestAccessSql('r', '$1')} AS allowed FROM item_requests r WHERE id = 'group-request'`, [viewer]);
    assert.equal(result.rows[0].allowed, expected, `group request / ${viewer}`);
    checks++;
  }
  console.log(`Passed ${checks} PostgreSQL policy checks using temporary fixtures. No application data changed.`);
} catch (error) {
  console.error(`Privacy PostgreSQL checks failed: ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
} finally {
  try { await client.query('ROLLBACK'); } catch { /* Connection may not have opened. */ }
  await client.end();
}
