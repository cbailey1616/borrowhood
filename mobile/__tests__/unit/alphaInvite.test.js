import { Share } from 'react-native';
import * as SMS from 'expo-sms';
import { alphaInviteMessage, inviteToAlpha } from '../../src/utils/alphaInvite';

beforeEach(() => { jest.clearAllMocks(); SMS.isAvailableAsync.mockResolvedValue(true); });
it('uses an alpha signup link when no public TestFlight link is configured', () => {
  expect(alphaInviteMessage('')).toContain('https://borrowhood.net/#join');
  expect(alphaInviteMessage('')).not.toContain('borrowhood.com/download');
});
it('uses a public TestFlight invite, never a build dashboard URL', () => {
  expect(alphaInviteMessage('https://testflight.apple.com/join/AbCd1234')).toContain('https://testflight.apple.com/join/AbCd1234');
  expect(alphaInviteMessage('https://expo.dev/builds/example')).toContain('https://borrowhood.net/#join');
});
it('opens a text composer for the selected contact', async () => {
  await inviteToAlpha('+15555550123');
  expect(SMS.sendSMSAsync).toHaveBeenCalledWith(['+15555550123'], expect.stringContaining('alpha'));
});
it('offers sharing when text messaging is unavailable', async () => {
  SMS.isAvailableAsync.mockResolvedValue(false);
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  await inviteToAlpha();
  expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('alpha') });
  expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  share.mockRestore();
});
