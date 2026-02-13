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
 * Start the scheduler — runs return reminder checks every hour.
 */
export function startScheduler() {
  // Run immediately on startup
  sendReturnReminders();

  // Then run every hour
  setInterval(sendReturnReminders, 60 * 60 * 1000);

  logger.info('Scheduler started: return reminders every hour');
}
