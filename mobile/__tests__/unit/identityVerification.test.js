import { openAuthSessionAsync } from 'expo-web-browser';
import api from '../../src/services/api';
import { verifyIdentityInBrowser } from '../../src/services/identityVerification';

beforeEach(() => {
  jest.clearAllMocks();
  api.startIdentityVerification.mockResolvedValue({ verificationUrl: 'https://verify.stripe.com/start/test_session' });
  api.getVerificationStatus.mockResolvedValue({ status: 'requires_input', verified: false });
  openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
});

it.each(['https://verify.stripe.com.evil.example/start/x', 'http://verify.stripe.com/start/x',
  'https://name:secret@verify.stripe.com/start/x', null])('rejects an unsafe verification URL: %s', async verificationUrl => {
  api.startIdentityVerification.mockResolvedValue({ verificationUrl });
  await expect(verifyIdentityInBrowser()).rejects.toThrow('secure verification session');
  expect(openAuthSessionAsync).not.toHaveBeenCalled();
});

it('does not treat a successful browser callback as completed verification', async () => {
  openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'borrowhood://verification-complete?verified=true' });
  await expect(verifyIdentityInBrowser()).rejects.toThrow('isn’t complete');
  expect(api.getVerificationStatus).toHaveBeenCalledTimes(1);
});

it('keeps cancellation available without marking the account verified', async () => {
  await expect(verifyIdentityInBrowser()).resolves.toBeNull();
});

it('recognizes a submitted check even when the user closes the browser manually', async () => {
  api.getVerificationStatus.mockResolvedValue({ status: 'processing', verified: false });
  await expect(verifyIdentityInBrowser()).resolves.toEqual({ status: 'processing', verified: false });
});

it('uses the server-confirmed verified result', async () => {
  api.getVerificationStatus.mockResolvedValue({ status: 'verified', verified: true });
  await expect(verifyIdentityInBrowser()).resolves.toEqual({ status: 'verified', verified: true });
});

it('ignores a late browser return after leaving the screen', async () => {
  let current = true;
  openAuthSessionAsync.mockImplementationOnce(async () => { current = false; return { type: 'success' }; });
  await expect(verifyIdentityInBrowser(() => current)).resolves.toBeNull();
  expect(api.getVerificationStatus).not.toHaveBeenCalled();
});
