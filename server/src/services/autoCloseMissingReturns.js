import { query, withTransaction } from '../utils/db.js';
import logger from '../utils/logger.js';

// Archiving an exchange is not a finding against either neighbor or a return.
export async function autoCloseMissingReturns() {
  const { rows } = await query(`SELECT t.id FROM borrow_transactions t
    JOIN return_reports r ON r.transaction_id=t.id
    WHERE t.status IN ('picked_up','return_pending') AND t.actual_return_at IS NULL
      AND t.stripe_payment_intent_id IS NULL AND COALESCE(t.rental_fee,0)=0 AND COALESCE(t.deposit_amount,0)=0
      AND r.status IN ('open','confirmed') AND r.resolved_at IS NULL AND r.response_due_at<=NOW()
    ORDER BY r.response_due_at LIMIT 100`);
  for (const candidate of rows) {
    try {
      await withTransaction(async db => {
        const t = (await db.query('SELECT * FROM borrow_transactions WHERE id=$1 FOR UPDATE', [candidate.id])).rows[0];
        if (!t || !['picked_up','return_pending'].includes(t.status) || t.actual_return_at
          || t.stripe_payment_intent_id || Number(t.rental_fee) || Number(t.deposit_amount)) return;
        const listing = (await db.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [t.listing_id])).rows[0];
        if (!listing || ['sell','giveaway'].includes(listing.listing_type)) return;
        const report = (await db.query(`SELECT 1 FROM return_reports WHERE transaction_id=$1
          AND status IN ('open','confirmed') AND resolved_at IS NULL AND response_due_at<=NOW() FOR UPDATE`, [t.id])).rows[0];
        if (!report) return;
        await db.query("UPDATE borrow_transactions SET status='closed_not_returned',missing_closed_at=NOW() WHERE id=$1", [t.id]);
        await db.query('UPDATE listings SET is_available=false WHERE id=$1', [t.listing_id]);
      });
    } catch (error) { logger.error('Could not archive missing return', { transactionId: candidate.id, error: error.message }); }
  }
}
