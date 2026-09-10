import * as Notifications from 'expo-notifications';
import { cancelLegacyReturnReminders } from '../src/utils/returnReminders';

it('removes only legacy return timers so muted reminders cannot bypass server preferences', async () => {
  Notifications.getAllScheduledNotificationsAsync = jest.fn().mockResolvedValue([
    { identifier: 'return-reminder-1d-tx1' }, { identifier: 'return-due-tx1' },
    { identifier: 'return-overdue-1d-tx1' }, { identifier: 'return-overdue-3d-tx1' },
    { identifier: 'unrelated-local-notification' },
  ]);
  Notifications.cancelScheduledNotificationAsync.mockClear();
  await cancelLegacyReturnReminders();
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(4);
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('unrelated-local-notification');
});
