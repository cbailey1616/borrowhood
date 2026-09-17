import { Share } from 'react-native';
import * as SMS from 'expo-sms';
import { createProfileLink } from './profileLinks';

export const APP_STORE_URL = 'https://apps.apple.com/app/id6758581435';

export function inviteMessage(userId) {
  const profileLink = createProfileLink(userId);
  const introduction = 'Join me on Borrowhood to borrow, share, and find things nearby.';
  return profileLink
    ? `${introduction}\n\nOpen my profile to add me: ${profileLink}\n\nNew here? Download the app from that link, then tap this invite again after signing up.`
    : `${introduction}\n\nDownload Borrowhood: ${APP_STORE_URL}`;
}

// Only opens the system composer. The person inviting chooses when to send.
export async function inviteToBorrowhood(phone, message = inviteMessage()) {
  if (await SMS.isAvailableAsync()) {
    return SMS.sendSMSAsync(phone ? [phone] : [], message);
  }
  return Share.share({ message });
}
