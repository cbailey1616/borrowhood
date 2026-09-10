import * as Notifications from 'expo-notifications';

const REMINDER_IDS = {
  dayBefore: (txId) => `return-reminder-1d-${txId}`,
  dueToday: (txId) => `return-due-${txId}`,
  overdue1: (txId) => `return-overdue-1d-${txId}`,
  overdue3: (txId) => `return-overdue-3d-${txId}`,
};

// Retire reminders scheduled by older apps. Server reminders respect push,
// sound and reminder preferences; leaving these timers would bypass those mutes.
export async function cancelLegacyReturnReminders() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      if (/^return-(reminder-1d|due|overdue-1d|overdue-3d)-/.test(notification.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch { /* Retry at the next authenticated launch. */ }
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
