import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ read: vi.fn(), constructors: vi.fn(), transactions: new Map(), notifications: new Map() }));
vi.mock('node:fs', async original => ({ ...await original(), readFileSync: state.read }));
vi.mock('@apple/app-store-server-library', async original => {
  const library = await original();
  return { ...library, SignedDataVerifier: class {
    constructor(...args) { state.constructors(...args); this.environment = args[2]; }
    verifyAndDecodeTransaction(token) { return state.transactions.get(this.environment)(token); }
    verifyAndDecodeNotification(token) { return state.notifications.get(this.environment)(token); }
  } };
});
import { Environment, VerificationException, VerificationStatus } from '@apple/app-store-server-library';
import { verifyAppleTransaction, verifyAppleNotification, assertAppleVerificationConfigured } from '../../src/services/appleVerification.js';

const userId = '11111111-1111-4111-8111-111111111111';
const decoded = (overrides = {}) => ({
  environment: 'Production', bundleId: 'com.borrowhood.app', productId: 'com.borrowhood.app.verification',
  appAccountToken: userId, type: 'Non-Consumable', transactionId: '90071992547409931234',
  originalTransactionId: '90071992547409931234', purchaseDate: Date.now() - 2000, signedDate: Date.now() - 1000,
  ...overrides,
});
const signed = 'header.payload.signature';
let testCount = 0;
beforeEach(() => {
  vi.clearAllMocks();
  // A unique non-existent certificate path per test isolates the module cache;
  // only the injected read function runs. No certificate/network/secret access.
  vi.stubEnv('APPLE_IAP_ROOT_CERT_PATHS', `/test/apple-root-${testCount++}.cer`);
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', '');
  state.read.mockReturnValue(Buffer.from('isolated-certificate'));
  state.constructors.mockReset();
  for (const env of [Environment.PRODUCTION, Environment.SANDBOX]) {
    state.transactions.set(env, vi.fn().mockRejectedValue(new VerificationException(VerificationStatus.INVALID_ENVIRONMENT)));
    state.notifications.set(env, vi.fn().mockRejectedValue(new VerificationException(VerificationStatus.INVALID_ENVIRONMENT)));
  }
});
afterEach(() => vi.unstubAllEnvs());

it('configures the official verifier with online checks, fixed bundle and Apple app ID', async () => {
  state.transactions.get('Production').mockResolvedValue(decoded());
  await expect(verifyAppleTransaction(signed, userId)).resolves.toMatchObject({ environment: 'Production' });
  expect(state.constructors).toHaveBeenCalledWith([Buffer.from('isolated-certificate')], true, 'Production', 'com.borrowhood.app', 6758581435);
});

it('falls back after the real Apple numeric INVALID_ENVIRONMENT exception for authorized sandbox users', async () => {
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', userId);
  state.transactions.get('Sandbox').mockResolvedValue(decoded({ environment: 'Sandbox' }));
  await expect(verifyAppleTransaction(signed, userId)).resolves.toMatchObject({ environment: 'Sandbox' });
  expect(state.transactions.get('Production')).toHaveBeenCalledOnce();
  expect(state.transactions.get('Sandbox')).toHaveBeenCalledOnce();
});

it('never tries sandbox for a client not explicitly authorized by the server', async () => {
  state.transactions.get('Sandbox').mockResolvedValue(decoded({ environment: 'Sandbox' }));
  await expect(verifyAppleTransaction(signed, userId)).rejects.toMatchObject({ status: 400, code: 'VERIFICATION_PURCHASE_INVALID' });
  expect(state.transactions.get('Sandbox')).not.toHaveBeenCalled();
});

it('does not turn a genuine semantic rejection into an environment fallback', async () => {
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', userId);
  state.transactions.get('Production').mockResolvedValue(decoded({ productId: 'wrong.product' }));
  await expect(verifyAppleTransaction(signed, userId)).rejects.toMatchObject({ status: 400 });
  expect(state.transactions.get('Sandbox')).not.toHaveBeenCalled();
});

it('keeps a verified revoked transaction rejected rather than trying sandbox', async () => {
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', userId);
  state.transactions.get('Production').mockResolvedValue(decoded({ revocationDate: Date.now() - 500 }));
  await expect(verifyAppleTransaction(signed, userId)).rejects.toMatchObject({ status: 409, code: 'VERIFICATION_PURCHASE_REVOKED' });
  expect(state.transactions.get('Sandbox')).not.toHaveBeenCalled();
});

it('reports temporary Apple certificate-check failures as retryable HTTP 503', async () => {
  state.transactions.get('Production').mockRejectedValue(new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE));
  await expect(verifyAppleTransaction(signed, userId)).rejects.toMatchObject({ status: 503, code: 'VERIFICATION_PURCHASE_UNAVAILABLE' });
});

it('rejects invalid signatures without exposing the Apple enum as an HTTP status', async () => {
  state.transactions.get('Production').mockRejectedValue(new VerificationException(VerificationStatus.INVALID_CERTIFICATE));
  await expect(verifyAppleTransaction(signed, userId)).rejects.toMatchObject({ status: 400 });
});

it.each([null, {}, '', 'unsigned', 'x'.repeat(32001)])('rejects malformed signed input before certificate reads: %j', async value => {
  await expect(verifyAppleTransaction(value, userId)).rejects.toMatchObject({ status: 400 });
  expect(state.read).not.toHaveBeenCalled();
});

it('fails closed when root certificates are not configured or cannot be loaded', async () => {
  vi.stubEnv('APPLE_IAP_ROOT_CERT_PATHS', '');
  expect(() => assertAppleVerificationConfigured()).toThrow('not configured');
  vi.stubEnv('APPLE_IAP_ROOT_CERT_PATHS', '/test/missing-root.cer');
  state.read.mockImplementation(() => { throw new Error('ENOENT'); });
  await expect(verifyAppleTransaction(signed, userId)).rejects.toMatchObject({ status: 503 });
  expect(state.transactions.get('Production')).not.toHaveBeenCalled();
});

it('verifies sandbox refund notifications after allowlist removal, including their nested transaction', async () => {
  const notification = { notificationUUID: 'notification-1', notificationType: 'REFUND', signedDate: Date.now() - 100,
    data: { signedTransactionInfo: 'nested.transaction.signature' } };
  state.notifications.get('Sandbox').mockResolvedValue(notification);
  const transaction = decoded({ environment: 'Sandbox', revocationDate: Date.now() - 200 });
  state.transactions.get('Sandbox').mockResolvedValue(transaction);
  await expect(verifyAppleNotification(signed)).resolves.toEqual({ notification, transaction });
  expect(state.notifications.get('Production')).toHaveBeenCalledOnce();
  expect(state.notifications.get('Sandbox')).toHaveBeenCalledOnce();
  expect(state.transactions.get('Sandbox')).toHaveBeenCalledWith('nested.transaction.signature');
});

it('rejects a valid outer notification with an invalid nested transaction signature', async () => {
  state.notifications.get('Production').mockResolvedValue({ notificationType: 'REFUND', data: { signedTransactionInfo: signed } });
  state.transactions.get('Production').mockRejectedValue(new VerificationException(VerificationStatus.INVALID_CERTIFICATE));
  await expect(verifyAppleNotification(signed)).rejects.toMatchObject({ status: 400 });
});

it('keeps temporary notification signature checks retryable', async () => {
  state.notifications.get('Production').mockRejectedValue(new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE));
  await expect(verifyAppleNotification(signed)).rejects.toMatchObject({ status: 503 });
});

it('accepts a verified TEST notification without inventing a purchase', async () => {
  const notification = { notificationType: 'TEST', notificationUUID: 'test-notification' };
  state.notifications.get('Production').mockResolvedValue(notification);
  await expect(verifyAppleNotification(signed)).resolves.toEqual({ notification, transaction: null });
  expect(state.transactions.get('Production')).not.toHaveBeenCalled();
});
