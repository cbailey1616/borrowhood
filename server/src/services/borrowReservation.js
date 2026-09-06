import { withTransaction } from '../utils/db.js';

// Approval and reservation must commit together. Otherwise an approval racing
// cancellation could leave a cancelled item's availability switched off.
export async function approveFreeBorrow(id, lenderId, response) {
  return withTransaction(async client => {
    const { rows: [borrow] } = await client.query(`SELECT * FROM borrow_transactions
      WHERE id = $1 AND lender_id = $2 AND status = 'pending' AND stripe_payment_intent_id IS NULL
      FOR UPDATE`, [id, lenderId]);
    if (!borrow) return false;
    const reserved = await client.query(`UPDATE listings SET is_available = false
      WHERE id = $1 AND is_available = true AND status = 'active' RETURNING id`, [borrow.listing_id]);
    if (!reserved.rowCount) return false;
    await client.query(`UPDATE borrow_transactions
      SET status = 'paid', accepted_at = COALESCE(accepted_at, NOW()), lender_response = $2, payment_status = 'none'
      WHERE id = $1`, [id, response]);
    return true;
  });
}
