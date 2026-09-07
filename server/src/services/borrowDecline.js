import { validationResult } from 'express-validator';
import { withTransaction } from '../utils/db.js';
import { cancelPaymentIntent } from './stripe.js';
import { sendNotification } from './notifications.js';
import logger from '../utils/logger.js';

export async function declineBorrow(req, res) {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ errors: validationResult(req).array() });
  try {
    const result = await withTransaction(async client => {
      const { rows: [borrow] } = await client.query(`SELECT * FROM borrow_transactions
        WHERE id = $1 AND lender_id = $2 FOR UPDATE`, [req.params.id, req.user.id]);
      if (!borrow) return { status: 404, error: 'Request not found.' };
      if (borrow.status === 'cancelled') return { alreadyDeclined: true };
      if (borrow.status !== 'pending') return { status: 409, error: 'This request is no longer pending. Refresh to see its latest status.' };
      if (borrow.stripe_payment_intent_id) await cancelPaymentIntent(borrow.stripe_payment_intent_id);
      await client.query(`UPDATE borrow_transactions SET status = 'cancelled', lender_response = $2,
        payment_status = $3 WHERE id = $1`, [borrow.id, req.body.reason, borrow.stripe_payment_intent_id ? 'cancelled' : 'none']);
      // Free pending requests do not reserve the item. Declining one must not
      // release a different neighbor's reservation or undo an owner's choice.
      if (borrow.stripe_payment_intent_id) {
        await client.query('SELECT id FROM listings WHERE id = $1 FOR UPDATE', [borrow.listing_id]);
        await client.query(`UPDATE listings l SET is_available = true WHERE l.id = $1 AND l.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM borrow_transactions bt WHERE bt.listing_id = l.id
            AND (bt.status IN ('approved', 'paid', 'picked_up', 'return_pending')
              OR (bt.status = 'pending' AND bt.stripe_payment_intent_id IS NOT NULL)))`, [borrow.listing_id]);
      }
      return { borrow };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ success: true });
    if (result.borrow) await sendNotification(result.borrow.borrower_id, 'request_declined', {
      transactionId: result.borrow.id, listingId: result.borrow.listing_id,
    }).catch(error => logger.error('Decline notification failed', { code: error.code || error.name }));
  } catch (error) {
    logger.error('Decline request failed', { code: error.code || error.name });
    if (!res.headersSent) res.status(500).json({ error: 'Could not decline this request. Please try again.' });
  }
}
