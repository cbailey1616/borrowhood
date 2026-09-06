import { withTransaction } from '../utils/db.js';
import { getPaymentIntent, cancelPaymentIntent, refundPayment } from './stripe.js';
import { sendNotification } from './notifications.js';
import logger from '../utils/logger.js';

// Both API paths use the same participant check and pre-pickup transition.
// Lock the borrow until its reservation is released, so retries cannot cancel
// twice or overwrite a pickup that finished first.
export async function cancelBorrow(req, res) {
  try {
    const result = await withTransaction(async client => {
      const { rows: [borrow] } = await client.query(`
        SELECT bt.*, l.title AS item_title FROM borrow_transactions bt
        JOIN listings l ON l.id = bt.listing_id
        WHERE bt.id = $1 AND (bt.borrower_id = $2 OR bt.lender_id = $2)
        FOR UPDATE OF bt`, [req.params.id, req.user.id]);
      if (!borrow) return { error: 'Borrow not found.', status: 404 };
      if (borrow.status === 'cancelled') return { alreadyCancelled: true };
      if (!['pending', 'approved', 'paid'].includes(borrow.status) || borrow.actual_pickup_at) {
        return { error: 'This borrow can no longer be cancelled. Refresh to see its latest status.', status: 409 };
      }

      let paymentStatus = 'none';
      // Preserve settlement for legacy in-app payments. Offline prices never
      // create a Stripe payment intent and do not pass through this branch.
      if (borrow.stripe_payment_intent_id) {
        const payment = await getPaymentIntent(borrow.stripe_payment_intent_id);
        if (payment.status === 'succeeded') {
          await refundPayment(borrow.stripe_payment_intent_id);
          paymentStatus = 'refunded';
        } else {
          if (payment.status !== 'canceled') await cancelPaymentIntent(borrow.stripe_payment_intent_id);
          paymentStatus = 'cancelled';
        }
      }
      await client.query(`UPDATE borrow_transactions SET status = 'cancelled', payment_status = $2 WHERE id = $1`, [borrow.id, paymentStatus]);
      // A pending free request never reserved the item. Do not undo an owner's
      // manual availability choice, or release another active reservation.
      if (borrow.status !== 'pending' || borrow.stripe_payment_intent_id) {
        await client.query('SELECT id FROM listings WHERE id = $1 FOR UPDATE', [borrow.listing_id]);
        await client.query(`UPDATE listings l SET is_available = true
          WHERE l.id = $1 AND l.status = 'active' AND NOT EXISTS (
            SELECT 1 FROM borrow_transactions bt WHERE bt.listing_id = l.id
            AND (bt.status IN ('approved', 'paid', 'picked_up', 'return_pending')
              OR (bt.status = 'pending' AND bt.stripe_payment_intent_id IS NOT NULL)))`, [borrow.listing_id]);
      }
      return { borrow };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (result.borrow) {
      const t = result.borrow;
      const recipient = req.user.id === t.lender_id ? t.borrower_id : t.lender_id;
      await sendNotification(recipient, 'borrow_cancelled', {
        transactionId: t.id, listingId: t.listing_id, itemTitle: t.item_title, fromUserId: req.user.id,
      });
    }
    return res.json({ success: true });
  } catch (error) {
    logger.error('Cancel borrow failed', { code: error.code || error.name });
    return res.status(500).json({ error: 'Could not cancel this borrow. Please try again.' });
  }
}
