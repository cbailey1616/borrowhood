// Deterministic permission state and inert notification delivery for the isolated simulator bundle.
export const getPermissionsAsync = async () => ({ status: 'granted' });
export const requestPermissionsAsync = getPermissionsAsync;
export const setNotificationHandler = () => {};
export const addNotificationReceivedListener = () => ({ remove() {} });
export const addNotificationResponseReceivedListener = () => ({ remove() {} });
export const getLastNotificationResponseAsync = async () => null;
export const getExpoPushTokenAsync = async () => ({ data: null });
export const getAllScheduledNotificationsAsync = async () => [];
export const getPresentedNotificationsAsync = async () => [];
export const setBadgeCountAsync = async () => {};
export const dismissAllNotificationsAsync = async () => {};
export const dismissNotificationAsync = async () => {};
export const cancelScheduledNotificationAsync = async () => {};
export const setNotificationChannelAsync = async () => {};
export const AndroidImportance = { MAX: 5 };
