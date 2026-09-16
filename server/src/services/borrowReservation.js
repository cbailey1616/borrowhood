import { withTransaction } from '../utils/db.js';

// Approval and reservation must commit together. Otherwise an approval racing
// cancellation could leave a cancelled item's availability switched off.
export async function approveFreeBorrow(id, lenderId, response) {
  return withTransaction(async client => {
    const { rows: [borrow] } = await client.query(`SELECT * FROM borrow_transactions
      WHERE id = $1 AND lender_id = $2 AND stripe_payment_intent_id IS NULL
      FOR UPDATE`, [id, lenderId]);
    if (!borrow) return false;
    if (['approved', 'paid', 'picked_up', 'return_pending', 'returned', 'completed'].includes(borrow.status)) {
      return { alreadyApproved: true };
    }
    if (borrow.status !== 'pending') return false;
    // Availability edits and request creation use the same inventory lock.
    // Check blocks in a fresh statement after acquiring it.
    await client.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE', [borrow.listing_id]);
    const reserved = await client.query(`UPDATE listings SET is_available = false
      WHERE id = $1 AND is_available = true AND status = 'active'
        AND (listing_type IN ('giveaway','sell') OR NOT EXISTS (
          SELECT 1 FROM listing_availability a WHERE a.listing_id=$1 AND a.is_available=false
            AND a.start_date <= $3 AND a.end_date >= $2))
      RETURNING id`, [borrow.listing_id, borrow.requested_start_date, borrow.requested_end_date]);
    if (!reserved.rowCount) return false;
    await client.query(`UPDATE borrow_transactions
      SET status = 'paid', accepted_at = COALESCE(accepted_at, NOW()), lender_response = $2, payment_status = 'none'
      WHERE id = $1`, [id, response]);
    return { alreadyApproved: false };
  });
}
