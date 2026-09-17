import { withTransaction } from '../utils/db.js';
import { cancelPaymentIntent } from './stripe.js';
import { sendNotification } from './notifications.js';

// Keep deletion and inventory changes atomic. Other participants retain records
// for exchanges that need a return, dispute resolution, or legacy settlement.
export async function deleteAccount(userId) {
  const notices = await withTransaction(async client => {
    const query = client.query.bind(client);
    const notifications = [];
    await query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const activeTxns = await query(`SELECT bt.id, bt.status, bt.stripe_payment_intent_id,
      bt.actual_pickup_at, bt.listing_id, bt.borrower_id, bt.lender_id, l.title AS item_title
      FROM borrow_transactions bt JOIN listings l ON l.id = bt.listing_id
      WHERE (bt.borrower_id = $1 OR bt.lender_id = $1)
        AND bt.status IN ('pending', 'approved', 'paid', 'picked_up', 'return_pending', 'disputed')
      ORDER BY bt.id FOR UPDATE OF bt`, [userId]);
    for (const txn of activeTxns.rows) {
      const otherPartyId = txn.borrower_id === userId ? txn.lender_id : txn.borrower_id;
      const canCancel = ['pending', 'approved', 'paid'].includes(txn.status)
        && !txn.actual_pickup_at && !(txn.status === 'paid' && txn.stripe_payment_intent_id);
      if (canCancel) {
        // A provider failure must preserve the account and its payment record.
        if (txn.stripe_payment_intent_id) await cancelPaymentIntent(txn.stripe_payment_intent_id);
        await query("UPDATE borrow_transactions SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [txn.id]);
        // Free pending requests did not reserve inventory. Preserve the owner's
        // availability choice and any other participant's active reservation.
        if (txn.status !== 'pending' || txn.stripe_payment_intent_id) {
          await query('SELECT id FROM listings WHERE id = $1 FOR UPDATE', [txn.listing_id]);
          await query(`UPDATE listings l SET is_available = true WHERE l.id = $1 AND l.status = 'active'
            AND NOT EXISTS (SELECT 1 FROM borrow_transactions bt WHERE bt.listing_id = l.id
              AND (bt.status IN ('approved','paid','picked_up','return_pending','disputed','account_deleted')
                OR (bt.status = 'pending' AND bt.stripe_payment_intent_id IS NOT NULL)))`, [txn.listing_id]);
        }
        notifications.push([otherPartyId, 'borrow_cancelled', { itemTitle: txn.item_title, accountDeleted: true }]);
      } else {
        // Do not erase a current handoff, dispute, or settled legacy payment.
        await query("UPDATE borrow_transactions SET status = 'account_deleted', updated_at = NOW() WHERE id = $1", [txn.id]);
        notifications.push([otherPartyId, 'exchange_account_deleted', {
          itemTitle: txn.item_title, transactionId: txn.id, listingId: txn.listing_id,
        }]);
      }
    }

    // Delete in dependency order to avoid FK violations
    // Notifications can reference both transactions and listings without cascading.
    await query(`DELETE FROM notifications WHERE user_id = $1 OR from_user_id = $1
      OR transaction_id IN (SELECT id FROM borrow_transactions
        WHERE (borrower_id = $1 OR lender_id = $1) AND status <> 'account_deleted')
      OR listing_id IN (SELECT id FROM listings WHERE owner_id = $1)`, [userId]);
    // 1. Tables referencing borrow_transactions
    await query(`DELETE FROM disputes WHERE (claimant_user_id = $1 OR respondent_user_id = $1)
      AND transaction_id NOT IN (SELECT id FROM borrow_transactions WHERE status = 'account_deleted')`, [userId]);
    await query('DELETE FROM ratings WHERE rater_id = $1 OR ratee_id = $1', [userId]);
    // 2. Transactions — only hard-delete completed/cancelled ones where user is sole party of interest
    //    Keep account_deleted transactions so the other party retains a record
    await query(
      `DELETE FROM borrow_transactions
       WHERE (borrower_id = $1 OR lender_id = $1)
         AND status NOT IN ('account_deleted', 'picked_up')`,
      [userId]
    );
    // 3. Tables referencing listings
    await query('DELETE FROM listing_discussions WHERE user_id = $1', [userId]);
    await query('DELETE FROM listing_discussions WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM listing_photos WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM listing_availability WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM saved_listings WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM saved_listings WHERE user_id = $1', [userId]);
    await query('DELETE FROM bundle_items WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM community_library_items WHERE donated_by = $1', [userId]);
    await query('DELETE FROM rto_contracts WHERE borrower_id = $1 OR lender_id = $1', [userId]);
    await query('DELETE FROM conversations WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    // 4. Listings — keep any referenced by account_deleted transactions
    await query(
      `DELETE FROM listings WHERE owner_id = $1
       AND id NOT IN (SELECT listing_id FROM borrow_transactions WHERE status = 'account_deleted')`,
      [userId]
    );
    // Retained items must not remain discoverable under an anonymized owner.
    await query("UPDATE listings SET status = 'paused', is_available = false WHERE owner_id = $1", [userId]);
    // 5. Messages & conversations (messages/participants reference conversations)
    await query('DELETE FROM message_reactions WHERE user_id = $1', [userId]);
    await query('DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE sender_id = $1)', [userId]);
    await query('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user1_id = $1 OR user2_id = $1)', [userId]);
    await query('DELETE FROM conversations WHERE user1_id = $1 OR user2_id = $1', [userId]);
    // 6. Remaining user-referenced tables
    await query('DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1', [userId]);
    await query('DELETE FROM community_memberships WHERE user_id = $1', [userId]);
    await query('DELETE FROM user_badges WHERE user_id = $1', [userId]);
    await query('DELETE FROM bundle_items WHERE bundle_id IN (SELECT id FROM bundles WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM bundles WHERE owner_id = $1', [userId]);
    await query('DELETE FROM lending_circle_members WHERE user_id = $1', [userId]);
    await query('DELETE FROM subscription_history WHERE user_id = $1', [userId]);
    await query('DELETE FROM audit_log WHERE actor_id = $1', [userId]);
    await query('DELETE FROM item_requests WHERE user_id = $1', [userId]);
    // Clear self-referencing FK and delete or anonymize user
    await query('UPDATE users SET referred_by = NULL WHERE referred_by = $1', [userId]);

    // Check if any account_deleted transactions still reference this user
    const retainedTxns = await query(
      `SELECT 1 FROM borrow_transactions
       WHERE (borrower_id = $1 OR lender_id = $1) AND status = 'account_deleted' LIMIT 1`,
      [userId]
    );

    if (retainedTxns.rows.length > 0) {
      // Anonymize instead of delete — retained transactions have NOT NULL FKs to this user
      await query(
        `UPDATE users SET
          first_name = 'Deleted', last_name = 'User', display_name = 'Deleted User',
          email = 'deleted_' || id || '@deleted.borrowhood.com',
          password_hash = '', phone = NULL, bio = NULL,
          profile_photo_url = NULL, status = 'suspended',
          stripe_customer_id = NULL, stripe_connect_account_id = NULL,
          stripe_identity_session_id = NULL, date_of_birth = NULL,
          address_line1 = NULL
        WHERE id = $1`,
        [userId]
      );
    } else {
      await query('DELETE FROM users WHERE id = $1', [userId]);
    }

    return notifications;
  });
  // Delivery failures cannot undo deletion or tell a neighbor it happened before commit.
  for (const notice of notices) {
    try { await sendNotification(...notice); }
    catch { console.error('Account deletion notification failed'); }
  }
}
