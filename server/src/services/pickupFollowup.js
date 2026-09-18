import { readFile } from 'node:fs/promises';
import { validationResult } from 'express-validator';
import { query, withTransaction } from '../utils/db.js';
import { sendNotification } from './notifications.js';
import logger from '../utils/logger.js';

export async function ensurePickupFollowupSchema() {
  const sql = await readFile(new URL('../../migrations/022_pickup_followup.sql', import.meta.url), 'utf8');
  await withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(812769)');
    await client.query(sql);
  });
}

export function pickupReviewState(transaction, userId, now = new Date()) {
  const dueAt = transaction.pickup_review_at;
  const waiting = ['approved', 'paid'].includes(transaction.status) && !transaction.actual_pickup_at;
  if (!waiting || !dueAt) return null;
  return { dueAt, needed: transaction.lender_id === userId && !transaction.has_dispute && !transaction.dispute_id
    && new Date(dueAt).getTime() <= now.getTime() };
}

// One durable reminder per pickup window. A missed confirmation never releases
// the item: the owner decides whether handoff happened or plans changed.
export async function sendPickupFollowups() {
  try {
    const due = await query(`SELECT t.id, l.title FROM borrow_transactions t
      JOIN listings l ON l.id=t.listing_id WHERE t.status IN ('approved','paid') AND t.actual_pickup_at IS NULL
      AND t.pickup_review_at <= NOW() AND (t.pickup_review_notified_at IS NULL OR t.pickup_review_notified_at < t.pickup_review_at)
      AND l.status <> 'deleted' AND NOT EXISTS (SELECT 1 FROM disputes WHERE transaction_id=t.id)`);
    for (const candidate of due.rows) {
      try {
        await withTransaction(async client => {
          const runQuery = client.query.bind(client);
          const { rows: [current] } = await runQuery(`SELECT * FROM borrow_transactions t WHERE id=$1
            AND status IN ('approved','paid') AND actual_pickup_at IS NULL AND pickup_review_at <= NOW()
            AND (pickup_review_notified_at IS NULL OR pickup_review_notified_at < pickup_review_at)
            AND NOT EXISTS (SELECT 1 FROM disputes WHERE transaction_id=t.id) FOR UPDATE`, [candidate.id]);
          if (!current) return;
          const receipt = await sendNotification(current.lender_id, 'pickup_check', {
            transactionId: current.id, listingId: current.listing_id, itemTitle: candidate.title,
          }, { runQuery, throwOnError: true, dedupeKey: `pickup-check:${current.id}:${new Date(current.pickup_review_at).toISOString()}` });
          if (!receipt) throw new Error('Pickup reminder was not saved');
          await runQuery('UPDATE borrow_transactions SET pickup_review_notified_at=NOW() WHERE id=$1', [current.id]);
        });
      } catch (error) { logger.error('Could not save pickup reminder', { transactionId: candidate.id, error: error.message }); }
    }
  } catch (error) { logger.error('Pickup follow-up check failed', { error: error.message }); }
}

export async function givePickupMoreTime(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const result = await withTransaction(async client => {
      const runQuery = client.query.bind(client);
      const { rows: [current] } = await runQuery(`SELECT t.*, l.title, t.pickup_review_at > NOW() AS deferred,
        EXISTS(SELECT 1 FROM disputes WHERE transaction_id=t.id) AS has_dispute
        FROM borrow_transactions t JOIN listings l ON l.id=t.listing_id
        WHERE t.id=$1 AND t.lender_id=$2 FOR UPDATE OF t`, [req.params.id, req.user.id]);
      if (!current) return { status: 404, error: 'Exchange not found.' };
      if (!['approved', 'paid'].includes(current.status) || current.actual_pickup_at || current.has_dispute || !current.pickup_review_at) {
        return { status: 409, error: 'This pickup has changed. Refresh to see its latest status.' };
      }
      const expected = new Date(req.body.reviewAt).getTime();
      const saved = new Date(current.pickup_review_at).getTime();
      // A retry from the same confirmation must not keep adding another day.
      if (current.deferred && expected < saved) return { success: true, alreadyExtended: true, pickupReviewAt: current.pickup_review_at };
      if (current.deferred || expected !== saved) return { status: 409, error: 'Pickup plans changed. Refresh before giving more time.' };
      const { rows: [updated] } = await runQuery(`UPDATE borrow_transactions
        SET pickup_review_at=NOW()+INTERVAL '24 hours' WHERE id=$1 RETURNING pickup_review_at`, [current.id]);
      const notice = await sendNotification(current.borrower_id, 'pickup_extended', {
        transactionId: current.id, listingId: current.listing_id, itemTitle: current.title, fromUserId: current.lender_id,
      }, { runQuery, throwOnError: true, dedupeKey: `pickup-extension:${current.id}:${new Date(updated.pickup_review_at).toISOString()}` });
      if (!notice) throw new Error('Pickup update was not saved');
      return { success: true, pickupReviewAt: updated.pickup_review_at };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    logger.error('Could not extend pickup', { code: error.code || error.name });
    return res.status(500).json({ error: 'Could not give more time. Please try again.' });
  }
}
