import { query, withTransaction } from '../utils/db.js';
import { endorsementSummary } from './endorsements.js';
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
    if (existing.name) return;
    await client.query(`CREATE TABLE neighbor_rank_notifications (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, tier INTEGER
    )`);
    const { rows } = await client.query('SELECT id FROM users');
    for (const { id } of rows) {
      const { score } = await endorsementSummary(id, client.query.bind(client));
      await client.query('INSERT INTO neighbor_rank_notifications(user_id,tier) VALUES($1,$2)', [id, rankTier(score)]);
    }
  });
  for (const type of ['rank_ready', 'rank_up', 'rank_down']) {
    await query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '${type}'`);
  }
}

export async function checkRankChanges() {
  try {
    const { rows } = await query(`SELECT DISTINCT user_id FROM (
      SELECT borrower_id AS user_id FROM borrow_transactions
      UNION SELECT lender_id FROM borrow_transactions
    ) members JOIN users ON users.id = members.user_id`);
    for (const { user_id } of rows) {
      const pending = await withTransaction(async client => {
        await client.query('INSERT INTO neighbor_rank_notifications(user_id,tier) VALUES($1,NULL) ON CONFLICT DO NOTHING', [user_id]);
        const { rows: [previous] } = await client.query('SELECT tier FROM neighbor_rank_notifications WHERE user_id=$1 FOR UPDATE', [user_id]);
        const { score } = await endorsementSummary(user_id, client.query.bind(client));
        const tier = rankTier(score);
        const change = rankChange(previous.tier, tier);
        if (change) {
          // Persist the activity and its snapshot together; concurrent workers cannot duplicate it.
          const id = await sendNotification(user_id, change.type, { body: change.body }, {
            runQuery: client.query.bind(client), activityOnly: true, throwOnError: true,
          });
          await client.query('UPDATE neighbor_rank_notifications SET tier=$2 WHERE user_id=$1', [user_id, tier]);
          return { ...change, id };
        }
        if (tier !== previous.tier) await client.query('UPDATE neighbor_rank_notifications SET tier=$2 WHERE user_id=$1', [user_id, tier]);
        return null;
      });
      if (pending?.type === 'rank_up') {
        // The activity is durable before attempting optional push delivery.
        await sendNotification(user_id, pending.type, { body: pending.body }, { existingNotificationId: pending.id });
      }
    }
  } catch (error) {
    logger.error('Rank notification check failed:', error);
  }
}
