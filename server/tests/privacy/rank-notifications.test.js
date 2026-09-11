import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({
  query: (...args) => state.db.query(...args),
  withTransaction: fn => state.db.transaction(tx => fn({ query: tx.query.bind(tx) })),
}));
import { ensureRankNotificationSchema, checkRankChanges, rankChange, rankTier } from '../../src/services/rankNotifications.js';
import { shouldSendPush } from '../../src/services/notificationPreferences.js';
const owner = randomUUID(), borrower = randomUUID();
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, push_token TEXT, notification_preferences JSONB);
    CREATE TABLE borrow_transactions(id UUID PRIMARY KEY, borrower_id UUID, lender_id UUID, status TEXT, payment_status TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TYPE notification_type AS ENUM ('new_message');
    CREATE TABLE notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, type notification_type, title TEXT, body TEXT,
      from_user_id UUID, transaction_id UUID, listing_id UUID, request_id UUID, conversation_id UUID, dispute_id UUID);`);
  await state.db.exec(await readFile(new URL('../../migrations/020_exchange_endorsements.sql', import.meta.url), 'utf8'));
  await state.db.exec(await readFile(new URL('../../migrations/021_neutral_endorsements.sql', import.meta.url), 'utf8'));
  await state.db.query('INSERT INTO users(id) VALUES($1),($2)', [owner, borrower]);
}, 15000);
afterAll(async () => state.db.close());

it('classifies first ratings and real tier changes without point-level alerts', () => {
  expect([null, 59, 60, 74, 75, 89, 90, 96, 97, 100].map(rankTier)).toEqual([null, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  expect(rankChange(null, null)).toBeNull();
  expect(rankChange(2, 2)).toBeNull();
  expect(rankChange(null, 2).type).toBe('rank_ready');
  expect(rankChange(2, 3).body).toContain('Ranger');
  expect(rankChange(2, 1).body).toContain('Fair');
  expect(shouldSendPush('rank_down')).toBe(false);
  expect(shouldSendPush('rank_ready')).toBe(false);
  expect(shouldSendPush('rank_up')).toBe(true);
  expect(shouldSendPush('rank_up', { push_enabled: false })).toBe(false);
  expect(shouldSendPush('rank_up', { borrow_updates: false })).toBe(false);
});

it('baselines existing members, announces graduation once, and persists only tier transitions', async () => {
  const existing = randomUUID(), partner = randomUUID();
  await state.db.query('INSERT INTO users(id) VALUES($1),($2)', [existing, partner]);
  for (let i = 0; i < 3; i++) await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'completed')", [randomUUID(), existing, partner]);
  await ensureRankNotificationSchema();
  await checkRankChanges();
  expect((await state.db.query('SELECT id FROM notifications')).rows).toHaveLength(0);
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const id = randomUUID(); ids.push(id);
    await state.db.query("INSERT INTO borrow_transactions(id, borrower_id, lender_id, status) VALUES($1,$2,$3,'completed')", [id, borrower, owner]);
  }
  await checkRankChanges();
  await checkRankChanges();
  expect((await state.db.query('SELECT type FROM notifications WHERE user_id=$1', [borrower])).rows).toEqual([{ type: 'rank_ready' }]);
  // Three negatives take Good to Fair, with no author or individual vote exposed.
  for (const id of ids) await state.db.query('INSERT INTO exchange_endorsements(transaction_id,rater_id,ratee_id,positive) VALUES($1,$2,$3,false)', [id, owner, borrower]);
  await checkRankChanges();
  await checkRankChanges();
  const { rows } = await state.db.query('SELECT type,body,from_user_id,transaction_id FROM notifications WHERE user_id=$1', [borrower]);
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatchObject({ type: 'rank_down', from_user_id: null, transaction_id: null });
  expect(rows[1].body).toContain('Fair');
  for (let i = 0; i < 8; i++) {
    const id = randomUUID();
    await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'completed')", [id, borrower, owner]);
    await state.db.query('INSERT INTO exchange_endorsements(transaction_id,rater_id,ratee_id,positive) VALUES($1,$2,$3,true)', [id, owner, borrower]);
  }
  await checkRankChanges();
  expect((await state.db.query("SELECT body FROM notifications WHERE user_id=$1 AND type='rank_up'", [borrower])).rows).toEqual([{ body: 'You’ve reached Ranger! Thanks for making exchanges great.' }]);
  await ensureRankNotificationSchema();
  await checkRankChanges();
  expect((await state.db.query("SELECT id FROM notifications WHERE user_id=$1 AND type='rank_up'", [borrower])).rows).toHaveLength(1);
});

it('rolls back the tier snapshot if its activity cannot be saved, then retries once', async () => {
  const newcomer = randomUUID();
  await state.db.query('INSERT INTO users(id) VALUES($1)', [newcomer]);
  for (let i = 0; i < 3; i++) await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'completed')", [randomUUID(), newcomer, owner]);
  await state.db.exec(`ALTER TABLE notifications ADD CONSTRAINT reject_test_member CHECK(user_id != '${newcomer}')`);
  await checkRankChanges();
  expect((await state.db.query('SELECT tier FROM neighbor_rank_notifications WHERE user_id=$1', [newcomer])).rows).toHaveLength(0);
  await state.db.exec('ALTER TABLE notifications DROP CONSTRAINT reject_test_member');
  await checkRankChanges();
  await checkRankChanges();
  expect((await state.db.query('SELECT type FROM notifications WHERE user_id=$1', [newcomer])).rows).toEqual([{ type: 'rank_ready' }]);
});
