import { query } from '../utils/db.js';
import { sendNotification } from './notifications.js';
import logger from '../utils/logger.js';

/**
 * Check for rentals due back tomorrow or today and send reminders.
 * Runs every hour. Only sends one reminder per type per transaction
 * by tracking via the reminder_sent_at columns.
 */
async function sendReturnReminders() {
  try {
    // Find active rentals (picked_up) due back today or tomorrow
    const result = await query(
      `SELECT bt.id, bt.borrower_id, bt.lender_id, bt.requested_end_date,
              bt.reminder_day_before_sent, bt.reminder_day_of_sent,
              l.title as item_title
       FROM borrow_transactions bt
       JOIN listings l ON bt.listing_id = l.id
       WHERE bt.status = 'picked_up'
         AND bt.requested_end_date <= NOW() + INTERVAL '1 day'`
    );

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (const txn of result.rows) {
      const dueDate = new Date(txn.requested_end_date);
      const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

      // Due tomorrow — send day-before reminder
      if (dueDateOnly.getTime() === tomorrow.getTime() && !txn.reminder_day_before_sent) {
        await sendNotification(txn.borrower_id, 'return_reminder', {
          itemTitle: txn.item_title,
          dueDate: dueDate.toLocaleDateString(),
          transactionId: txn.id,
        });

        await query(
          'UPDATE borrow_transactions SET reminder_day_before_sent = true WHERE id = $1',
          [txn.id]
        );

        logger.info(`Sent day-before return reminder for transaction ${txn.id}`);
      }

      // Due today — send day-of reminder
      if (dueDateOnly.getTime() === today.getTime() && !txn.reminder_day_of_sent) {
        await sendNotification(txn.borrower_id, 'return_reminder', {
          itemTitle: txn.item_title,
          dueDate: 'today',
          transactionId: txn.id,
        });

        // Also notify the lender
        await sendNotification(txn.lender_id, 'return_reminder', {
          itemTitle: txn.item_title,
          dueDate: 'today',
          transactionId: txn.id,
        });

        await query(
          'UPDATE borrow_transactions SET reminder_day_of_sent = true WHERE id = $1',
          [txn.id]
        );

        logger.info(`Sent day-of return reminder for transaction ${txn.id}`);
      }
    }
  } catch (err) {
    logger.error('Return reminder check error:', err);
  }
}

/**
 * Auto-advance disputes from awaitingResponse to underReview
 * after 48 hours with no response from the respondent.
 */
async function autoAdvanceDisputes() {
  try {
    const result = await query(
      `UPDATE disputes
       SET status = 'underReview'
       WHERE status = 'awaitingResponse'
         AND created_at < NOW() - INTERVAL '48 hours'
       RETURNING id, claimant_user_id, respondent_user_id, transaction_id`
    );

    for (const d of result.rows) {
      await sendNotification(d.claimant_user_id, 'dispute_under_review', {
        disputeId: d.id,
        transactionId: d.transaction_id,
      });

      // Notify respondent they missed the window
      await sendNotification(d.respondent_user_id, 'dispute_auto_advanced', {
        disputeId: d.id,
        transactionId: d.transaction_id,
      });

      // Notify community organizers
      const listing = await query(
        `SELECT l.community_id FROM borrow_transactions t
         JOIN listings l ON t.listing_id = l.id
         WHERE t.id = $1`,
        [d.transaction_id]
      );
      if (listing.rows[0]?.community_id) {
        const organizers = await query(
          `SELECT user_id FROM community_memberships
           WHERE community_id = $1 AND role = 'organizer'`,
          [listing.rows[0].community_id]
        );
        for (const org of organizers.rows) {
          await sendNotification(org.user_id, 'dispute_ready_for_review', {
            disputeId: d.id,
            transactionId: d.transaction_id,
          });
        }
      }

      logger.info(`Auto-advanced dispute ${d.id} to underReview`);
    }
  } catch (err) {
    logger.error('Auto-advance disputes error:', err);
  }
}

/**
 * Auto-release security deposit holds for returned rentals
 * where 72 hours have passed with no dispute filed.
 */
async function autoReleaseDeposits() {
  try {
    const { cancelPaymentIntent } = await import('../services/stripe.js');

    const result = await query(
      `SELECT bt.id, bt.stripe_payment_intent_id, bt.deposit_amount, bt.borrower_id
       FROM borrow_transactions bt
       WHERE bt.status IN ('returned', 'completed')
         AND bt.actual_return_at < NOW() - INTERVAL '7 days'
         AND bt.payment_status = 'authorized'
         AND NOT EXISTS (SELECT 1 FROM disputes WHERE transaction_id = bt.id)`
    );

    for (const t of result.rows) {
      try {
        if (t.stripe_payment_intent_id) {
          await cancelPaymentIntent(t.stripe_payment_intent_id);
        }
        await query(
          `UPDATE borrow_transactions SET payment_status = 'deposit_released' WHERE id = $1`,
          [t.id]
        );
        await sendNotification(t.borrower_id, 'deposit_released', { transactionId: t.id });
        logger.info(`Auto-released deposit for transaction ${t.id}`);
      } catch (err) {
        logger.error(`Auto-release deposit failed for txn ${t.id}:`, err);
      }
    }

    // Second pass: lender ghosted — return marked 48+ hours ago but lender never confirmed
    const ghosted = await query(
      `SELECT bt.id, bt.stripe_payment_intent_id, bt.deposit_amount, bt.borrower_id
       FROM borrow_transactions bt
       WHERE bt.status = 'returned'
         AND bt.actual_return_at < NOW() - INTERVAL '48 hours'
         AND bt.payment_status = 'authorized'
         AND NOT EXISTS (SELECT 1 FROM disputes WHERE transaction_id = bt.id)`
    );

    for (const t of ghosted.rows) {
      try {
        if (t.stripe_payment_intent_id) {
          await cancelPaymentIntent(t.stripe_payment_intent_id);
        }
        await query(
          `UPDATE borrow_transactions SET payment_status = 'deposit_released' WHERE id = $1`,
          [t.id]
        );
        await sendNotification(t.borrower_id, 'deposit_released', { transactionId: t.id });
        logger.info(`Auto-released deposit (lender ghosted) for transaction ${t.id}`);
      } catch (err) {
        logger.error(`Auto-release (lender ghosted) failed for txn ${t.id}:`, err);
      }
    }
  } catch (err) {
    logger.error('Auto-release deposits error:', err);
  }
}

/**
 * Notify users whose verification grace period expires within the next hour
 * and who still aren't fully verified.
 */
async function checkVerificationGraceExpiry() {
  try {
    const result = await query(
      `SELECT id FROM users
       WHERE is_verified = false
         AND verification_grace_until IS NOT NULL
         AND verification_grace_until > NOW()
         AND verification_grace_until <= NOW() + INTERVAL '1 hour'
         AND grace_expiry_notified IS NOT TRUE`
    );

    for (const user of result.rows) {
      await sendNotification(user.id, 'verification_expiring', {});
      await query(
        'UPDATE users SET grace_expiry_notified = true WHERE id = $1',
        [user.id]
      );
      logger.info(`Sent verification grace expiry warning to user ${user.id}`);
    }
  } catch (err) {
    logger.error('Verification grace expiry check error:', err);
  }
}

/**
 * Expire giveaway requests that the owner hasn't responded to
 * within 48 hours. Cancels the transaction and notifies the requester.
 */
async function expireStaleGiveawayRequests() {
  try {
    const result = await query(
      `UPDATE borrow_transactions bt
       SET status = 'cancelled'
       FROM listings l
       WHERE bt.listing_id = l.id
         AND l.listing_type = 'giveaway'
         AND bt.status = 'pending'
         AND bt.created_at < NOW() - INTERVAL '48 hours'
       RETURNING bt.id, bt.borrower_id, bt.lender_id, l.title as item_title`
    );

    for (const t of result.rows) {
      await sendNotification(t.borrower_id, 'giveaway_expired', {
        itemTitle: t.item_title,
        transactionId: t.id,
      });
      logger.info(`Expired stale giveaway request ${t.id}`);
    }
  } catch (err) {
    logger.error('Expire stale giveaway requests error:', err);
  }
}

/**
 * Expire approved giveaway transactions where nobody picked up
 * within 7 days. Cancels the transaction and relists the item.
 */
async function expireGiveawayPickups() {
  try {
    const result = await query(
      `SELECT bt.id, bt.borrower_id, bt.lender_id, bt.listing_id, l.title as item_title
       FROM borrow_transactions bt
       JOIN listings l ON bt.listing_id = l.id
       WHERE l.listing_type = 'giveaway'
         AND bt.status = 'paid'
         AND bt.actual_pickup_at IS NULL
         AND bt.updated_at < NOW() - INTERVAL '7 days'`
    );

    for (const t of result.rows) {
      await query(
        `UPDATE borrow_transactions SET status = 'cancelled' WHERE id = $1`,
        [t.id]
      );
      await query(
        `UPDATE listings SET is_available = true, status = 'active' WHERE id = $1`,
        [t.listing_id]
      );

      await sendNotification(t.borrower_id, 'giveaway_pickup_expired', {
        itemTitle: t.item_title,
        transactionId: t.id,
      });
      await sendNotification(t.lender_id, 'giveaway_pickup_expired', {
        itemTitle: t.item_title,
        transactionId: t.id,
      });
      logger.info(`Expired giveaway pickup ${t.id}, relisted item ${t.listing_id}`);
    }
  } catch (err) {
    logger.error('Expire giveaway pickups error:', err);
  }
}

/**
 * Start the scheduler — runs checks every hour.
 */
export function startScheduler() {
  // Run immediately on startup
  sendReturnReminders();
  autoAdvanceDisputes();
  autoReleaseDeposits();
  checkVerificationGraceExpiry();
  expireStaleGiveawayRequests();
  expireGiveawayPickups();

  // Then run every hour
  setInterval(sendReturnReminders, 60 * 60 * 1000);
  setInterval(autoAdvanceDisputes, 60 * 60 * 1000);
  setInterval(autoReleaseDeposits, 60 * 60 * 1000);
  setInterval(checkVerificationGraceExpiry, 60 * 60 * 1000);
  setInterval(expireStaleGiveawayRequests, 60 * 60 * 1000);
  setInterval(expireGiveawayPickups, 60 * 60 * 1000);

  logger.info('Scheduler started: return reminders, dispute auto-advance, deposit auto-release, verification grace expiry, giveaway expiry every hour');
}
