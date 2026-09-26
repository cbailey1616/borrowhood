import { query, withTransaction } from '../utils/db.js';
import { endorsementSummary, endorsementSummaries } from './endorsements.js';
import { sendNotification } from './notifications.js';
import logger from '../utils/logger.js';

const ranks = [
  { min: 0, name: 'Outlaw', tone: 'Needs work' },
  { min: 60, name: 'Jester', tone: 'Fair' },
  { min: 75, name: 'Archer', tone: 'Good' },
  { min: 90, name: 'Ranger', tone: 'Great' },
  { min: 97, name: 'Robin', tone: 'Excellent' },
];
export const rankTier = score => score === null ? null : ranks.findLastIndex(rank => score >= rank.min);
export function rankChange(previous, current) {
  if (current === null || current === previous) return null;
  const rank = ranks[current];
  if (previous === null) return { type: 'rank_ready', body: 'Your neighbor rating is ready. See how you’re doing.' };
  return current > previous
    ? { type: 'rank_up', body: `You’ve reached ${rank.name}! Thanks for making exchanges great.` }
    : { type: 'rank_down', body: `Your neighbor rating is now ${rank.tone}. Positive exchanges can help you move up.` };
}

export async function ensureRankNotificationSchema() {
  // Seed existing members once so deployment never announces historical changes.
  await withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(812761)');
    const { rows: [existing] } = await client.query("SELECT to_regclass('neighbor_rank_notifications') AS name");
    if (!existing.name) {
      await client.query(`CREATE TABLE neighbor_rank_notifications (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, tier INTEGER
      )`);
      const { rows } = await client.query('SELECT id FROM users');
      for (const { id } of rows) {
        const { score } = await endorsementSummary(id, client.query.bind(client));
        await client.query('INSERT INTO neighbor_rank_notifications(user_id,tier) VALUES($1,$2)', [id, rankTier(score)]);
      }
    }
    const { rows: [queue] } = await client.query("SELECT to_regclass('neighbor_rank_pending') AS name");
    await client.query(`CREATE TABLE IF NOT EXISTS neighbor_rank_pending (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      dirty_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await client.query(`CREATE INDEX IF NOT EXISTS neighbor_rank_pending_order ON neighbor_rank_pending(dirty_at,user_id)`);
    await client.query(`CREATE OR REPLACE FUNCTION enqueue_neighbor_rank() RETURNS trigger AS $$
      DECLARE members UUID[] := ARRAY[]::UUID[];
      BEGIN
        IF TG_TABLE_NAME='borrow_transactions' THEN
          IF TG_OP!='DELETE' THEN members := members || ARRAY[NEW.borrower_id,NEW.lender_id]; END IF;
          IF TG_OP!='INSERT' THEN members := members || ARRAY[OLD.borrower_id,OLD.lender_id]; END IF;
        ELSE
          IF TG_OP!='DELETE' THEN members := members || ARRAY[NEW.ratee_id]; END IF;
          IF TG_OP!='INSERT' THEN members := members || ARRAY[OLD.ratee_id]; END IF;
        END IF;
        INSERT INTO neighbor_rank_pending(user_id) SELECT id FROM users WHERE id=ANY(members)
          ORDER BY id ON CONFLICT(user_id) DO UPDATE SET dirty_at=NOW();
        RETURN NULL;
      END; $$ LANGUAGE plpgsql`);
    await client.query('DROP TRIGGER IF EXISTS queue_transaction_rank ON borrow_transactions');
    await client.query(`CREATE TRIGGER queue_transaction_rank AFTER INSERT OR DELETE OR UPDATE OF
        status,payment_status,accepted_at,borrower_id,lender_id ON borrow_transactions
        FOR EACH ROW EXECUTE FUNCTION enqueue_neighbor_rank()`);
    await client.query('DROP TRIGGER IF EXISTS queue_endorsement_rank ON exchange_endorsements');
    await client.query(`CREATE TRIGGER queue_endorsement_rank AFTER INSERT OR UPDATE OR DELETE ON exchange_endorsements
        FOR EACH ROW EXECUTE FUNCTION enqueue_neighbor_rank()`);
    if (!queue.name) await client.query(`INSERT INTO neighbor_rank_pending(user_id)
      SELECT DISTINCT id FROM users WHERE id IN (SELECT borrower_id FROM borrow_transactions UNION SELECT lender_id FROM borrow_transactions)
      ON CONFLICT DO NOTHING`);
  });
  for (const type of ['rank_ready', 'rank_up', 'rank_down']) {
    await query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '${type}'`);
  }
}

let running = false;
export async function checkRankChanges() {
  if (running) return;
  running = true;
  try {
    await withTransaction(async client => {
      const run = client.query.bind(client);
      const { rows } = await run(`SELECT p.user_id FROM neighbor_rank_pending p
        JOIN (SELECT user_id FROM neighbor_rank_pending ORDER BY dirty_at,user_id LIMIT 100) oldest USING(user_id)
        ORDER BY p.user_id FOR UPDATE OF p SKIP LOCKED`);
      if (!rows.length) return;
      const summaries = await endorsementSummaries(rows.map(row => row.user_id), run);
      for (const { user_id } of rows) {
        await run('INSERT INTO neighbor_rank_notifications(user_id,tier) VALUES($1,NULL) ON CONFLICT DO NOTHING', [user_id]);
        const { rows: [previous] } = await run('SELECT tier FROM neighbor_rank_notifications WHERE user_id=$1 FOR UPDATE', [user_id]);
        const tier = rankTier(summaries.get(user_id).score);
        const change = rankChange(previous.tier, tier);
        if (change) await sendNotification(user_id, change.type, { body: change.body }, {
          runQuery: run, activityOnly: change.type !== 'rank_up', throwOnError: true,
        });
        if (tier !== previous.tier) await run('UPDATE neighbor_rank_notifications SET tier=$2 WHERE user_id=$1', [user_id,tier]);
        await run('DELETE FROM neighbor_rank_pending WHERE user_id=$1', [user_id]);
      }
    });
  } catch (error) {
    logger.error('Rank notification check failed', { code: error.code || error.name });
  } finally { running = false; }
}
