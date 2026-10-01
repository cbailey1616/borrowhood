import { query, withTransaction } from '../utils/db.js';
import { sendNotification } from './notifications.js';
import logger from '../utils/logger.js';

const eligible = `status='return_pending' AND return_requested_at<=NOW()-INTERVAL '48 hours'
  AND stripe_payment_intent_id IS NULL AND condition_at_return IS NULL
  AND COALESCE(rental_fee,0)=0 AND COALESCE(deposit_amount,0)=0`;

export async function autoCloseReturns() {
  const { rows } = await query(`SELECT id FROM borrow_transactions WHERE ${eligible}
    AND NOT EXISTS (SELECT 1 FROM disputes WHERE transaction_id=borrow_transactions.id)
    AND NOT EXISTS (SELECT 1 FROM return_reports WHERE transaction_id=borrow_transactions.id AND resolved_at IS NULL AND status!='dismissed')
    ORDER BY return_requested_at LIMIT 100`);
  for (const candidate of rows) {
    try {
      await withTransaction(async client => {
        const runQuery = client.query.bind(client);
        const { rows: [borrow] } = await runQuery(`SELECT * FROM borrow_transactions WHERE id=$1 AND ${eligible} FOR UPDATE`, [candidate.id]);
        if (!borrow) return;
        const { rows: [listing] } = await runQuery('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [borrow.listing_id]);
        if (!listing || ['giveaway','sell'].includes(listing.listing_type)) return;
        const { rows: [issue] } = await runQuery(`SELECT 1 WHERE EXISTS (SELECT 1 FROM disputes WHERE transaction_id=$1)
          OR EXISTS (SELECT 1 FROM return_reports WHERE transaction_id=$1 AND resolved_at IS NULL AND status!='dismissed')`, [borrow.id]);
        if (issue) return;
        await runQuery(`UPDATE borrow_transactions SET status='completed', actual_return_at=return_requested_at,
          return_auto_closed_at=NOW(), payment_status='none' WHERE id=$1`, [borrow.id]);
        await runQuery(`UPDATE listings l SET times_borrowed=COALESCE(times_borrowed,0)+1,
          is_available=CASE WHEN l.status='active' AND NOT EXISTS (SELECT 1 FROM borrow_transactions bt
            WHERE bt.listing_id=l.id AND bt.status IN ('approved','paid','picked_up','return_pending'))
            THEN true ELSE l.is_available END WHERE l.id=$1`, [borrow.listing_id]);
        for (const recipient of new Set([borrow.borrower_id, borrow.lender_id])) {
          const saved = await sendNotification(recipient, 'return_confirmed', { transactionId: borrow.id,
            listingId: borrow.listing_id, itemTitle: listing.title, autoClosed: true },
          { runQuery, throwOnError: true, dedupeKey: `auto-return:${borrow.id}` });
          if (!saved) throw new Error('Auto-return notification was not persisted');
        }
      });
    } catch (error) { logger.error('Could not close pending return', { transactionId: candidate.id, error: error.message }); }
  }
}
