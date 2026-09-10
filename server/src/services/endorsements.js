import { readFile } from 'node:fs/promises';
import { query, withTransaction } from '../utils/db.js';

export async function ensureEndorsementSchema() {
  await query(await readFile(new URL('../../migrations/020_exchange_endorsements.sql', import.meta.url), 'utf8'));
}
export const endorsementVisibleSql = (alias = 'e') => `(
  NOW() >= t.endorsement_started_at + INTERVAL '14 days' OR
  (SELECT COUNT(*) FROM exchange_endorsements paired WHERE paired.transaction_id = ${alias}.transaction_id) = 2)`;
export async function endorsementSummary(userId) {
  const { rows: [row] } = await query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER(WHERE e.positive)::int AS positive
    FROM exchange_endorsements e JOIN borrow_transactions t ON t.id=e.transaction_id
    WHERE e.ratee_id=$1 AND ${endorsementVisibleSql()}`, [userId]);
  const total = Number(row?.total) || 0;
  return { percent: total ? Math.round(Number(row.positive) / total * 100) : null, count: total };
}
export async function endorsementState(id, userId) {
  const { rows: [row] } = await query(`SELECT t.endorsement_started_at + INTERVAL '14 days' AS deadline,
    t.endorsement_started_at IS NOT NULL AND NOW() < t.endorsement_started_at + INTERVAL '14 days'
      AND (t.status IN ('returned','completed') AND COALESCE(t.payment_status::text,'none') != 'authorized'
        OR t.status='cancelled' AND t.accepted_at IS NOT NULL) AS eligible,
    e.positive, e.rater_id IS NOT NULL AS submitted
    FROM borrow_transactions t LEFT JOIN exchange_endorsements e ON e.transaction_id=t.id AND e.rater_id=$2
    WHERE t.id=$1 AND (t.borrower_id=$2 OR t.lender_id=$2)`, [id,userId]);
  return { canRate: !!row?.eligible && !row?.submitted, submitted: !!row?.submitted, positive: row?.submitted ? row.positive : null, deadline: row?.deadline || null };
}
export async function submitEndorsement(id, userId, positive) {
  return withTransaction(async client => {
    const { rows: [t] } = await client.query(`SELECT *, NOW() < endorsement_started_at + INTERVAL '14 days' AS in_window
      FROM borrow_transactions WHERE id=$1 AND (borrower_id=$2 OR lender_id=$2) FOR UPDATE`, [id,userId]);
    if (!t) return { status:404, error:'Exchange not found.' };
    const previous = await client.query('SELECT positive FROM exchange_endorsements WHERE transaction_id=$1 AND rater_id=$2', [id,userId]);
    if (previous.rows.length) return previous.rows[0].positive === positive ? { success:true } : { status:409, error:'Your endorsement has already been sent.' };
    const eligible = (['returned','completed'].includes(t.status) && t.payment_status !== 'authorized') || (t.status === 'cancelled' && t.accepted_at);
    if (!eligible || !t.in_window) return { status:409, error:'This exchange is not open for feedback.' };
    await client.query(`INSERT INTO exchange_endorsements(transaction_id,rater_id,ratee_id,positive) VALUES($1,$2,$3,$4)`, [id,userId,t.borrower_id === userId ? t.lender_id : t.borrower_id,positive]);
    // No notification containing the vote: the other participant cannot infer it before reveal.
    return { success:true };
  });
}
