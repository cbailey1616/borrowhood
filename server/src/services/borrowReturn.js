import { withTransaction } from '../utils/db.js';
import { sendNotification } from './notifications.js';

// Current exchanges have no platform payments. Keep their return and inventory
// update together and count the exchange once, even if both neighbors confirm.
export async function completeFreeReturn(id, userId, condition, notes) {
  const result = await withTransaction(async client => {
    const { rows: [borrow] } = await client.query(`SELECT * FROM borrow_transactions
      WHERE id = $1 AND (borrower_id = $2 OR lender_id = $2) FOR UPDATE`, [id, userId]);
    if (!borrow) return { status: 404, error: 'Exchange not found.' };
    if (borrow.stripe_payment_intent_id) return { status: 409, error: 'Refresh this exchange before confirming its return.' };
    const { rows: [listing] } = await client.query('SELECT * FROM listings WHERE id = $1 FOR UPDATE', [borrow.listing_id]);
    if (['giveaway', 'sell'].includes(listing?.listing_type)) return { status: 400, error: 'Sales and giveaways do not have a return step.' };
    if (['returned', 'completed'].includes(borrow.status) && borrow.actual_return_at) return { alreadyConfirmed: true };
    if (!['picked_up', 'return_pending'].includes(borrow.status)) return { status: 409, error: 'This item is not currently borrowed. Refresh to see its latest status.' };
    const order = ['like_new', 'good', 'fair', 'worn'];
    if (order.indexOf(condition) > order.indexOf(borrow.condition_at_pickup)) {
      await client.query(`UPDATE borrow_transactions SET condition_at_return = $2, condition_notes = $3 WHERE id = $1`, [id, condition, notes]);
      return { conditionDegraded: true };
    }
    await client.query(`UPDATE borrow_transactions SET status = 'completed', actual_return_at = NOW(),
      condition_at_return = $2, condition_notes = $3, payment_status = 'none' WHERE id = $1`, [id, condition, notes]);
    await client.query(`UPDATE listings l SET times_borrowed = COALESCE(times_borrowed, 0) + 1,
      is_available = CASE WHEN l.status = 'active' AND NOT EXISTS (
        SELECT 1 FROM borrow_transactions bt WHERE bt.listing_id = l.id
        AND bt.status IN ('approved', 'paid', 'picked_up', 'return_pending')) THEN true ELSE l.is_available END
      WHERE l.id = $1`, [borrow.listing_id]);
    return { borrow };
  });
  return result;
}

export function notifyFreeReturn(borrow, userId) {
  return sendNotification(userId === borrow.lender_id ? borrow.borrower_id : borrow.lender_id, 'return_confirmed', {
    transactionId: borrow.id, listingId: borrow.listing_id,
  });
}
