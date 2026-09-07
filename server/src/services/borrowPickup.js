import { validationResult } from 'express-validator';
import { withTransaction } from '../utils/db.js';
import { sendNotification } from './notifications.js';
import logger from '../utils/logger.js';

// Both routes use one atomic handoff. A repeated confirmation acknowledges the
// original pickup without changing timestamps or sending another notification.
export function confirmBorrowPickup({ borrowerOnly = false } = {}) {
  return async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const result = await withTransaction(async client => {
        const { rows: [borrow] } = await client.query(`SELECT * FROM borrow_transactions
          WHERE id = $1 AND (borrower_id = $2 OR lender_id = $2) FOR UPDATE`, [req.params.id, req.user.id]);
        if (!borrow) return { error: 'Exchange not found.', httpStatus: 404 };
        if (borrowerOnly && borrow.borrower_id !== req.user.id) {
          return { error: 'Only the borrower can confirm pickup', httpStatus: 403 };
        }
        const { rows: [listing] } = await client.query(
          'SELECT id, title, listing_type, condition FROM listings WHERE id = $1 FOR UPDATE', [borrow.listing_id]);
        if (!listing) return { error: 'Item not found.', httpStatus: 404 };
        const isGiveaway = ['giveaway', 'sell'].includes(listing.listing_type);
        if (borrow.actual_pickup_at && ['picked_up', 'return_pending', 'returned', 'completed', 'disputed'].includes(borrow.status)) {
          return { isGiveaway, status: borrow.status, alreadyConfirmed: true };
        }
        if (!['paid', 'approved'].includes(borrow.status) || borrow.actual_pickup_at) {
          return { error: 'This exchange is not ready for pickup. Refresh to see its latest status.', httpStatus: 409 };
        }
        const condition = req.body.condition || borrow.condition_at_pickup || listing.condition || 'good';
        if (isGiveaway) {
          await client.query(`UPDATE borrow_transactions SET status = 'returned', actual_pickup_at = NOW(),
            actual_return_at = NOW(), condition_at_pickup = $1 WHERE id = $2`, [condition, borrow.id]);
          await client.query(`UPDATE listings SET status = 'given_away', is_available = false WHERE id = $1`, [listing.id]);
        } else {
          await client.query(`UPDATE borrow_transactions SET status = 'picked_up', actual_pickup_at = NOW(),
            condition_at_pickup = $1 WHERE id = $2`, [condition, borrow.id]);
        }
        return { borrow, listing, isGiveaway, status: isGiveaway ? 'returned' : 'picked_up' };
      });
      if (result.error) return res.status(result.httpStatus).json({ error: result.error });
      // The saved handoff is authoritative; delivery of a push must not delay or
      // turn its successful response into an error.
      res.json({ success: true, isGiveaway: result.isGiveaway, status: result.status, alreadyConfirmed: !!result.alreadyConfirmed });
      if (result.borrow) {
        const { borrow, listing, isGiveaway } = result;
        try {
          await sendNotification(req.user.id === borrow.borrower_id ? borrow.lender_id : borrow.borrower_id,
            isGiveaway ? 'giveaway_complete' : 'pickup_confirmed', {
              itemTitle: listing.title, listingId: listing.id, transactionId: borrow.id,
              ...(isGiveaway ? {} : { returnDate: borrow.requested_end_date }),
            });
        } catch (error) {
          logger.error('Pickup notification failed after confirmation', { code: error.code || error.name });
        }
      }
    } catch (error) {
      logger.error('Confirm pickup failed', { code: error.code || error.name });
      return res.status(500).json({ error: 'Could not confirm pickup. Please try again.' });
    }
  };
}
