import { Share } from 'react-native';
import * as SMS from 'expo-sms';
import { APP_STORE_URL, inviteMessage, inviteToBorrowhood } from '../../src/utils/invites';
import { createProfileLink } from '../../src/utils/profileLinks';
import eas from '../../eas.json';

const userId = '10000000-0000-4000-8000-000000000001';
beforeEach(() => { jest.clearAllMocks(); SMS.isAvailableAsync.mockResolvedValue(true); });

it('links to the production App Store app when no profile is available', () => {
  expect(APP_STORE_URL).toBe(`https://apps.apple.com/app/id${eas.submit.production.ios.ascAppId}`);
  expect(inviteMessage()).toContain(APP_STORE_URL);
  expect(inviteMessage()).not.toMatch(/alpha|testflight|#join/i);
});

it('carries the inviter’s public profile and explains how to return after installation', () => {
  const message = inviteMessage(userId);
  expect(message).toContain(createProfileLink(userId));
  expect(message).toContain('tap this invite again after signing up');
  expect(message).not.toMatch(/alpha|testflight|automatically|token=|email=/i);
});

it('does not embed an arbitrary URL or invalid profile ID in an invitation', () => {
  expect(inviteMessage('https://example.com/')).toContain(APP_STORE_URL);
  expect(inviteMessage('https://example.com/')).not.toContain('example.com');
});

it('opens the selected contact’s composer with the personal invite', async () => {
  const message = inviteMessage(userId);
  await inviteToBorrowhood('+15555550123', message);
  expect(SMS.sendSMSAsync).toHaveBeenCalledWith(['+15555550123'], message);
});

it('allows choosing recipients and keeps cancellation as cancellation', async () => {
  SMS.sendSMSAsync.mockResolvedValueOnce({ result: 'cancelled' });
  await expect(inviteToBorrowhood()).resolves.toEqual({ result: 'cancelled' });
  expect(SMS.sendSMSAsync).toHaveBeenCalledWith([], expect.stringContaining(APP_STORE_URL));
});

it('offers sharing when text messaging is unavailable', async () => {
  SMS.isAvailableAsync.mockResolvedValue(false);
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  await inviteToBorrowhood(undefined, inviteMessage(userId));
  expect(share).toHaveBeenCalledWith({ message: expect.stringContaining(createProfileLink(userId)) });
  expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  share.mockRestore();
});
