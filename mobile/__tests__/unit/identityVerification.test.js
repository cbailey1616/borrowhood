import { openAuthSessionAsync } from 'expo-web-browser';
import api from '../../src/services/api';
import { verifyIdentityInBrowser } from '../../src/services/identityVerification';
import * as store from 'expo-iap';

const eligibility = { mode: 'free_launch', productId: 'com.borrowhood.app.verification',
  appAccountToken: '11111111-1111-4111-8111-111111111111', paymentRequired: false,
  canStartVerification: true, hasVerificationPurchase: false, isVerified: false };

beforeEach(() => {
  jest.clearAllMocks();
  api.getVerificationEligibility.mockResolvedValue(eligibility);
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

it('does not start or bill for another identity check when already verified', async () => {
  api.getVerificationEligibility.mockResolvedValue({ ...eligibility, isVerified: true });
  api.getVerificationStatus.mockResolvedValue({ status: 'verified', verified: true });
  await expect(verifyIdentityInBrowser()).resolves.toEqual({ status: 'verified', verified: true });
  expect(api.startIdentityVerification).not.toHaveBeenCalled();
  expect(openAuthSessionAsync).not.toHaveBeenCalled();
});

it('refreshes status if the webhook completes verification before session creation', async () => {
  api.startIdentityVerification.mockRejectedValueOnce(Object.assign(new Error('Already verified'), { code: 'ALREADY_VERIFIED' }));
  api.getVerificationStatus.mockResolvedValue({ status: 'verified', verified: true });
  await expect(verifyIdentityInBrowser()).resolves.toEqual({ status: 'verified', verified: true });
  expect(openAuthSessionAsync).not.toHaveBeenCalled();
});

it('does not turn a successful Apple payment into verified identity', async () => {
  const paid = { ...eligibility, mode: 'apple_iap', paymentRequired: true, canStartVerification: false };
  const entitled = { ...paid, paymentRequired: false, canStartVerification: true, hasVerificationPurchase: true };
  api.getVerificationEligibility.mockResolvedValue(paid);
  api.confirmAppleVerificationPurchase.mockResolvedValue(entitled);
  store.requestPurchase.mockResolvedValue({ productId: eligibility.productId, appAccountToken: eligibility.appAccountToken,
    purchaseState: 'purchased', purchaseToken: 'signed.purchase', id: '1' });
  await expect(verifyIdentityInBrowser(() => true, { allowPurchase: true })).resolves.toBeNull();
  expect(api.confirmAppleVerificationPurchase).toHaveBeenCalledTimes(1);
  expect(api.startIdentityVerification).toHaveBeenCalledTimes(1);
  expect(api.getVerificationStatus).toHaveBeenCalledTimes(1);
});
