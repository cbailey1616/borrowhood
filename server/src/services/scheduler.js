import { cleanupFeedHistory } from './feedWindows.js';
import { query, withTransaction, withBackgroundDatabase } from '../utils/db.js';
import { sendNotification } from './notifications.js';
import logger from '../utils/logger.js';
import { checkRankChanges } from './rankNotifications.js';
import { processPushDeliveries } from './pushDelivery.js';
import { sendPickupFollowups } from './pickupFollowup.js';

/**
 * Check for rentals due back tomorrow or today and send reminders.
 * Runs every hour. Sends one reminder per type for each agreed return date.
 */
export async function sendReturnReminders() {
  try {
    // Find active rentals (picked_up) due back today or tomorrow
    const result = await query(
      `SELECT bt.id, bt.borrower_id, bt.lender_id, bt.requested_end_date,
              bt.reminder_day_before_sent, bt.reminder_day_of_sent,
              l.title as item_title
       FROM borrow_transactions bt
       JOIN listings l ON bt.listing_id = l.id
       WHERE bt.status = 'picked_up'
         AND bt.requested_end_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 1`
    );

    for (const txn of result.rows) {
      try {
        await withTransaction(async client => {
          const runQuery = client.query.bind(client);
          const { rows: [current] } = await runQuery(`SELECT *, requested_end_date::date=CURRENT_DATE AS due_today,
            requested_end_date::date::text AS reminder_date
            FROM borrow_transactions WHERE id=$1 AND status='picked_up'
            AND requested_end_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE+1 FOR UPDATE`, [txn.id]);
          if (!current) return;
          const flag = current.due_today ? 'reminder_day_of_sent' : 'reminder_day_before_sent';
          if (current[flag]) return;
          const recipients = current.due_today ? [current.borrower_id, current.lender_id] : [current.borrower_id];
          for (const recipient of new Set(recipients)) {
            const id = await sendNotification(recipient, 'return_reminder', {
              itemTitle: txn.item_title, dueDate: current.due_today ? 'today' : 'tomorrow',
              returnDate: current.reminder_date, transactionId: txn.id,
            }, { runQuery, throwOnError: true, dedupeKey: `${txn.id}:${current.reminder_date}:${flag}` });
            if (!id) throw new Error('Reminder was not persisted');
          }
          // Activity, durable pushes and flags are all-or-nothing, even with
          // concurrent schedulers or a failure notifying the second recipient.
          await runQuery(`UPDATE borrow_transactions SET ${flag}=true WHERE id=$1`, [txn.id]);
        });
      } catch (error) { logger.error('Could not queue return reminder', { transactionId: txn.id, error: error.message }); }
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
         AND l.listing_type IN ('giveaway', 'sell')
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
 * Start the scheduler — runs checks every hour.
 */
export function startScheduler() {
  const timers = new Set();
  const active = new Set();
  let stopped = false;
  const schedule = (name, work, interval) => {
    const run = () => {
      if (stopped) return;
      const started = Date.now();
      const task = withBackgroundDatabase(work).catch(error => {
        logger.error('Background job failed', { job: name, code: error.code || error.name });
      }).finally(() => {
        active.delete(task);
        logger.info('Background job finished', { job: name, durationMs: Date.now() - started });
        if (!stopped) {
          const timer = setTimeout(() => { timers.delete(timer); run(); }, interval);
          timers.add(timer);
        }
      });
      active.add(task);
    };
    run();
  };
  schedule('push', processPushDeliveries, 5000);
  schedule('ranks', checkRankChanges, 60000);
  schedule('feed retention', cleanupFeedHistory, 5 * 60 * 1000);
  schedule('hourly', async () => {
    // Avoid a startup burst of six maintenance jobs competing for connections.
    for (const job of [sendReturnReminders, autoAdvanceDisputes, autoReleaseDeposits,
      checkVerificationGraceExpiry, expireStaleGiveawayRequests, sendPickupFollowups]) await job();
  }, 60 * 60 * 1000);
  return async () => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    await Promise.allSettled([...active]);
  };
}
