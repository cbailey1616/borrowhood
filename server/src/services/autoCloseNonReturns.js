import { query, withTransaction } from '../utils/db.js';
import { sendNotification } from './notifications.js';
import logger from '../utils/logger.js';

const eligible = `t.status IN ('picked_up','return_pending') AND t.actual_return_at IS NULL
  AND t.actual_pickup_at IS NOT NULL AND t.requested_end_date<CURRENT_DATE
  AND t.stripe_payment_intent_id IS NULL AND COALESCE(t.rental_fee,0)=0 AND COALESCE(t.deposit_amount,0)=0
  AND EXISTS (SELECT 1 FROM return_reports r WHERE r.transaction_id=t.id
    AND r.status IN ('open','confirmed') AND r.resolved_at IS NULL AND r.response_due_at<=NOW())
  AND NOT EXISTS (SELECT 1 FROM disputes WHERE transaction_id=t.id)`;

// Closing the exchange is independent of confirming an allegation or banning
// an account. Keep the report, evidence and response/appeal process intact.
export async function autoCloseNonReturns() {
  const { rows } = await query(`SELECT t.id FROM borrow_transactions t WHERE ${eligible} ORDER BY t.id LIMIT 100`);
  for (const candidate of rows) {
    try {
      await withTransaction(async db => {
        const runQuery = db.query.bind(db);
        const { rows: [borrow] } = await runQuery(`SELECT t.* FROM borrow_transactions t WHERE t.id=$1 AND ${eligible} FOR UPDATE OF t`, [candidate.id]);
        if (!borrow) return;
        const { rows: [listing] } = await runQuery('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [borrow.listing_id]);
        if (!listing || ['sell','giveaway'].includes(listing.listing_type)) return;
        await runQuery("UPDATE borrow_transactions SET status='closed_unreturned', non_return_closed_at=NOW() WHERE id=$1", [borrow.id]);
        // The missing item cannot be advertised as available or counted returned.
        await runQuery('UPDATE listings SET is_available=false WHERE id=$1', [borrow.listing_id]);
        for (const recipient of new Set([borrow.lender_id, borrow.borrower_id])) {
          const saved = await sendNotification(recipient, 'return_case_updated', {
            transactionId: borrow.id, listingId: borrow.listing_id, closedUnreturned: true,
          }, { runQuery, throwOnError: true, dedupeKey: `closed-unreturned:${borrow.id}` });
          if (!saved) throw new Error('Closure notification was not persisted');
        }
      });
    } catch (error) { logger.error('Could not close missing-item exchange', { transactionId: candidate.id, error: error.message }); }
  }
}
