import * as Notifications from 'expo-notifications';

const REMINDER_IDS = {
  dayBefore: (txId) => `return-reminder-1d-${txId}`,
  dueToday: (txId) => `return-due-${txId}`,
  overdue1: (txId) => `return-overdue-1d-${txId}`,
  overdue3: (txId) => `return-overdue-3d-${txId}`,
};

/**
 * Schedule local notifications for an active rental:
 * - 1 day before return date
 * - On the return date
 * - 1 day after (overdue)
 * - 3 days after (overdue)
 */
export async function scheduleReturnReminders(transactionId, endDate, listingTitle) {
  try {
    // Cancel any existing reminders for this transaction first
    await cancelReturnReminders(transactionId);

    const due = new Date(endDate);
    const now = new Date();

    const reminders = [
      {
        id: REMINDER_IDS.dayBefore(transactionId),
        date: new Date(due.getTime() - 24 * 60 * 60 * 1000),
        title: 'Return Reminder',
        body: `"${listingTitle}" is due back tomorrow.`,
      },
      {
        id: REMINDER_IDS.dueToday(transactionId),
        date: due,
        title: 'Return Due Today',
        body: `"${listingTitle}" is due back today. Please arrange the return.`,
      },
      {
        id: REMINDER_IDS.overdue1(transactionId),
        date: new Date(due.getTime() + 24 * 60 * 60 * 1000),
        title: 'Rental Overdue',
        body: `"${listingTitle}" was due yesterday. Please return it as soon as possible.`,
      },
      {
        id: REMINDER_IDS.overdue3(transactionId),
        date: new Date(due.getTime() + 3 * 24 * 60 * 60 * 1000),
        title: 'Rental Overdue — 3 Days Late',
        body: `"${listingTitle}" is 3 days overdue. The lender may file a dispute.`,
      },
    ];

    for (const reminder of reminders) {
      // Only schedule if the date is in the future
      if (reminder.date > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: reminder.id,
          content: {
            title: reminder.title,
            body: reminder.body,
            sound: true,
            data: { type: 'return_reminder', transactionId },
          },
          trigger: { date: reminder.date },
        });
      }
    }
  } catch (e) {
    console.log('Failed to schedule return reminders:', e);
  }
}

/**
 * Cancel all return reminders for a transaction (e.g. when item is returned).
 */
export async function cancelReturnReminders(transactionId) {
  try {
    for (const key of Object.keys(REMINDER_IDS)) {
      await Notifications.cancelScheduledNotificationAsync(
        REMINDER_IDS[key](transactionId)
      );
    }
  } catch (e) {
    // Ignore — notification may not exist
  }
}
