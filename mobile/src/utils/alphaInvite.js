import { Share } from 'react-native';
import * as SMS from 'expo-sms';

export function alphaInviteMessage(link = process.env.EXPO_PUBLIC_TESTFLIGHT_INVITE_URL || 'https://testflight.apple.com/join/5715EMZP') {
  const publicLink = typeof link === 'string' && /^https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]+$/.test(link.trim()) ? link.trim() : null;
  return publicLink
    ? `I'm trying the Borrowhood iPhone alpha to lend, give away, and find things nearby. Join me! Open this link on your iPhone to install through TestFlight: ${publicLink}`
    : `I'm trying the Borrowhood iPhone alpha to lend, give away, and find things nearby. Want to join me? Request a TestFlight invite here: https://borrowhood.net/#join`;
}

// Only opens the system composer. The person inviting chooses when to send.
export async function inviteToAlpha(phone) {
  const message = alphaInviteMessage();
  if (await SMS.isAvailableAsync()) {
    return SMS.sendSMSAsync(phone ? [phone] : [], message);
  }
  return Share.share({ message });
}
