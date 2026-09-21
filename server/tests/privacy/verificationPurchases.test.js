import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

// This suite has no .env setup, network calls, live database or Apple/Stripe credentials.
const state = vi.hoisted(() => ({
  db: null,
  failQuery: null,
  verifyTransaction: vi.fn(),
  verifyNotification: vi.fn(),
}));
vi.mock('../../src/utils/db.js', () => ({
  query: (...args) => state.db.query(...args),
  withTransaction: callback => state.db.transaction(client => callback({
    query: (sql, params) => {
      if (state.failQuery?.(sql)) throw new Error('Isolated database write failure');
      return client.query(sql, params);
    },
  })),
}));
vi.mock('../../src/services/appleVerification.js', async importOriginal => ({
  ...await importOriginal(),
  verifyAppleTransaction: state.verifyTransaction,
  verifyAppleNotification: state.verifyNotification,
  assertAppleVerificationConfigured: vi.fn(),
}));

import {
  ensureVerificationPurchaseSchema,
  getVerificationEligibility,
  requireVerificationEligibility,
  recordAppleVerificationPurchase,
  handleAppleVerificationNotification,
} from '../../src/services/verificationPurchases.js';

const buyer = randomUUID();
const otherUser = randomUUID();
const verifiedUser = randomUUID();
const launchSessionUser = randomUUID();
const productId = 'com.borrowhood.app.verification';
const now = Date.now();
const rows = async (sql, params) => (await state.db.query(sql, params)).rows;
const transaction = (overrides = {}) => ({
  environment: 'Production',
  bundleId: 'com.borrowhood.app',
  productId,
  type: 'Non-Consumable',
  appAccountToken: buyer,
  transactionId: '90071992547409931234',
  originalTransactionId: '90071992547409931233',
  purchaseDate: now - 2000,
  signedDate: now - 1000,
  ...overrides,
});
const paidMode = () => {
  vi.stubEnv('VERIFICATION_PAYMENT_MODE', 'apple_iap');
  vi.stubEnv('VERIFICATION_IAP_READY', 'true');
};
const purchase = async (decoded = transaction(), userId = buyer) => {
  state.verifyTransaction.mockResolvedValueOnce(decoded);
  return recordAppleVerificationPurchase(userId, 'apple-signed-transaction');
};
const notification = async (type, signedDate, overrides = {}) => {
  const notificationUUID = overrides.notificationUUID || randomUUID();
  state.verifyNotification.mockResolvedValueOnce({
    notification: { notificationUUID, notificationType: type, signedDate },
    transaction: transaction(overrides.transaction),
  });
  return handleAppleVerificationNotification('apple-signed-notification');
};
const expectNoPurchase = async () => {
  expect(await rows('SELECT * FROM apple_verification_transactions')).toHaveLength(0);
  expect(await rows("SELECT * FROM verification_entitlements WHERE source='apple'")).toHaveLength(0);
  expect((await rows('SELECT is_verified FROM users WHERE id=$1', [buyer]))[0].is_verified).toBe(false);
};

beforeAll(async () => { state.db = new PGlite(); }, 20000);
afterAll(async () => { await state.db?.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  vi.clearAllMocks();
  state.verifyTransaction.mockReset();
  state.verifyNotification.mockReset();
  state.failQuery = null;
  vi.stubEnv('VERIFICATION_PAYMENT_MODE', 'free_launch');
  vi.stubEnv('VERIFICATION_IAP_READY', 'false');
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', '');
  await state.db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE users (
      id UUID PRIMARY KEY,
      is_verified BOOLEAN NOT NULL DEFAULT false,
      stripe_identity_session_id TEXT
    )`);
  for (const id of [buyer, otherUser, verifiedUser, launchSessionUser]) {
    await state.db.query(
      'INSERT INTO users(id,is_verified,stripe_identity_session_id) VALUES($1,$2,$3)',
      [id, id === verifiedUser, id === launchSessionUser ? 'vs_launch_existing' : null],
    );
  }
  await ensureVerificationPurchaseSchema();
}, 20000);

it('creates schema idempotently and preserves existing verified users and launch sessions', async () => {
  await ensureVerificationPurchaseSchema();
  await ensureVerificationPurchaseSchema();
  paidMode();
  for (const userId of [verifiedUser, launchSessionUser]) {
    expect(await getVerificationEligibility(userId)).toMatchObject({
      paymentRequired: false, canStartVerification: true, hasVerificationPurchase: false,
    });
    expect(await rows(
      "SELECT * FROM verification_entitlements WHERE user_id=$1 AND source='launch_free'", [userId],
    )).toHaveLength(1);
  }
  expect(await getVerificationEligibility(buyer)).toMatchObject({
    paymentRequired: true, canStartVerification: false, isVerified: false,
  });
});

it('runs grandfather backfill once, never making a newly inserted paid-era session free on restart', async () => {
  paidMode();
  await state.db.query('UPDATE users SET stripe_identity_session_id=$2 WHERE id=$1', [buyer, 'vs_paid_unentitled']);
  await ensureVerificationPurchaseSchema();
  expect(await rows("SELECT * FROM verification_entitlements WHERE user_id=$1 AND source='launch_free'", [buyer])).toHaveLength(0);
});

it('keeps launch verification free and binds the eligibility account token to the authenticated user', async () => {
  expect(await getVerificationEligibility(buyer)).toMatchObject({
    mode: 'free_launch', productId, appAccountToken: buyer,
    paymentRequired: false, canStartVerification: true,
    hasVerificationPurchase: false, isVerified: false,
  });
  expect(await rows('SELECT * FROM verification_entitlements WHERE user_id=$1', [buyer])).toHaveLength(0);
  expect(state.verifyTransaction).not.toHaveBeenCalled();
});

it('captures a durable free entitlement on start that survives launch ending and status reset', async () => {
  await requireVerificationEligibility(buyer);
  await requireVerificationEligibility(buyer);
  expect(await rows("SELECT * FROM verification_entitlements WHERE user_id=$1 AND source='launch_free'", [buyer])).toHaveLength(1);
  paidMode();
  await state.db.query('UPDATE users SET is_verified=false,stripe_identity_session_id=NULL WHERE id=$1', [buyer]);
  expect(await getVerificationEligibility(buyer)).toMatchObject({
    mode: 'apple_iap', paymentRequired: false, canStartVerification: true, isVerified: false,
  });
  await expect(requireVerificationEligibility(buyer)).resolves.toBeDefined();
  await expectNoPurchase();
});

it('blocks unpaid verification in paid mode without creating a free or paid entitlement', async () => {
  paidMode();
  await expect(requireVerificationEligibility(buyer)).rejects.toMatchObject({
    status: 402, code: 'VERIFICATION_PURCHASE_REQUIRED',
  });
  expect(await rows('SELECT * FROM verification_entitlements WHERE user_id=$1', [buyer])).toHaveLength(0);
  await expectNoPurchase();
});

it('fails closed when paid mode has not been acknowledged as ready', async () => {
  vi.stubEnv('VERIFICATION_PAYMENT_MODE', 'apple_iap');
  await expect(requireVerificationEligibility(buyer)).rejects.toThrow();
  expect(await rows('SELECT * FROM verification_entitlements WHERE user_id=$1', [buyer])).toHaveLength(0);
});

it('rejects an invalid configuration instead of silently enabling free launch', async () => {
  vi.stubEnv('VERIFICATION_PAYMENT_MODE', 'typo-paid-mode');
  await expect(requireVerificationEligibility(buyer)).rejects.toThrow();
  expect(await rows('SELECT * FROM verification_entitlements WHERE user_id=$1', [buyer])).toHaveLength(0);
});

it('records a genuine purchase once, preserves long Apple IDs, and never verifies identity', async () => {
  paidMode();
  expect(await purchase()).toMatchObject({
    paymentRequired: false, canStartVerification: true, hasVerificationPurchase: true, isVerified: false,
  });
  await purchase();
  const saved = await rows('SELECT transaction_id,original_transaction_id FROM apple_verification_transactions');
  expect(saved).toEqual([{
    transaction_id: transaction().transactionId, original_transaction_id: transaction().originalTransactionId,
  }]);
  expect(await rows("SELECT * FROM verification_entitlements WHERE user_id=$1 AND source='apple'", [buyer])).toHaveLength(1);
  expect((await rows('SELECT is_verified FROM users WHERE id=$1', [buyer]))[0].is_verified).toBe(false);
  await expect(requireVerificationEligibility(buyer)).resolves.toBeDefined();
});

it('restores another transaction of the same original purchase without duplicating the entitlement', async () => {
  paidMode();
  await purchase();
  await purchase(transaction({ transactionId: '90071992547409931235' }));
  expect(await rows("SELECT * FROM verification_entitlements WHERE user_id=$1 AND source='apple'", [buyer])).toHaveLength(1);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: true, isVerified: false });
});

it('keeps simultaneous same-user purchase retries idempotent', async () => {
  paidMode();
  state.verifyTransaction.mockResolvedValue(transaction());
  const results = await Promise.allSettled([
    recordAppleVerificationPurchase(buyer, 'one'), recordAppleVerificationPurchase(buyer, 'two'),
  ]);
  expect(results.every(result => result.status === 'fulfilled')).toBe(true);
  expect(await rows('SELECT * FROM apple_verification_transactions')).toHaveLength(1);
  expect(await rows("SELECT * FROM verification_entitlements WHERE user_id=$1 AND source='apple'", [buyer])).toHaveLength(1);
});

it('rejects an invalid Apple signature with no database grant', async () => {
  paidMode();
  state.verifyTransaction.mockRejectedValueOnce(new Error('Invalid Apple signature'));
  await expect(recordAppleVerificationPurchase(buyer, 'forged')).rejects.toThrow('Invalid Apple signature');
  await expectNoPurchase();
});

it.each([
  ['wrong product', { productId: 'com.borrowhood.app.unrelated' }],
  ['wrong bundle', { bundleId: 'com.someoneelse.app' }],
  ['wrong product type', { type: 'Consumable' }],
  ['different account token', { appAccountToken: otherUser }],
  ['missing account token', { appAccountToken: undefined }],
  ['unexpected environment', { environment: 'Xcode' }],
  ['unapproved sandbox account', { environment: 'Sandbox' }],
  ['revoked transaction', { revocationDate: now - 500 }],
])('rejects a decoded transaction with %s without persisting entitlement', async (_name, overrides) => {
  paidMode();
  await expect(purchase(transaction(overrides))).rejects.toThrow();
  await expectNoPurchase();
});

it('prevents cross-account replay even when the presented token is changed to match the second account', async () => {
  paidMode();
  await purchase();
  await expect(purchase(transaction({ appAccountToken: otherUser }), otherUser)).rejects.toThrow();
  expect(await getVerificationEligibility(otherUser)).toMatchObject({ hasVerificationPurchase: false, paymentRequired: true });
  expect(await rows('SELECT * FROM apple_verification_transactions')).toHaveLength(1);
  expect(await rows("SELECT * FROM verification_entitlements WHERE user_id=$1 AND source='apple'", [otherUser])).toHaveLength(0);
});

it('revokes the purchase on refund and refuses stale client replay without erasing identity facts', async () => {
  paidMode();
  await purchase();
  await state.db.query('UPDATE users SET is_verified=true WHERE id=$1', [buyer]);
  await notification('REFUND', now + 1000, { transaction: { revocationDate: now + 500 } });
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false, isVerified: true });
  // A client may hold the older non-revoked JWS indefinitely; replay cannot undo a refund.
  await expect(purchase()).rejects.toMatchObject({ status: 409, code: 'VERIFICATION_PURCHASE_REVOKED' });
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false, isVerified: true });
  expect((await rows('SELECT is_verified FROM users WHERE id=$1', [buyer]))[0].is_verified).toBe(true);
});

it('blocks a refunded unverified purchaser from starting another check', async () => {
  paidMode();
  await purchase();
  await notification('REVOKE', now + 1000, { transaction: { revocationDate: now + 500 } });
  await expect(requireVerificationEligibility(buyer)).rejects.toMatchObject({ status: 402 });
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false, isVerified: false });
});

it('deduplicates a notification UUID atomically', async () => {
  paidMode();
  await purchase();
  const notificationUUID = randomUUID();
  await notification('REFUND', now + 1000, { notificationUUID });
  await notification('REFUND', now + 1000, { notificationUUID });
  expect(await rows('SELECT * FROM apple_notification_events')).toHaveLength(1);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false });
});

it('honors notification event time, not delivery order or the nested transaction signed date', async () => {
  paidMode();
  await purchase();
  await notification('REFUND', now + 3000);
  await notification('REFUND_REVERSED', now + 2000, { transaction: { signedDate: now + 99999 } });
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false });
  await notification('REFUND_REVERSED', now + 4000, { transaction: { signedDate: now - 5000 } });
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: true, isVerified: false });
  await notification('REVOKE', now + 3500, { transaction: { revocationDate: now + 3500 } });
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: true });
});

it('keeps revocation authoritative when reversal and refund have identical signed dates', async () => {
  paidMode();
  await purchase();
  await notification('REFUND_REVERSED', now + 1000);
  await notification('REFUND', now + 1000);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false });
  await notification('REFUND_REVERSED', now + 1000);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false });
});

it('does not mutate purchases or persist events for an unauthenticated notification', async () => {
  paidMode();
  await purchase();
  state.verifyNotification.mockRejectedValueOnce(new Error('Invalid notification signature'));
  await expect(handleAppleVerificationNotification('forged')).rejects.toThrow('Invalid notification signature');
  expect(await rows('SELECT * FROM apple_notification_events')).toHaveLength(0);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: true });
});

it('does not let a payment refund remove a separately granted free-launch entitlement', async () => {
  await requireVerificationEligibility(buyer);
  paidMode();
  await purchase();
  await notification('REFUND', now + 1000);
  expect(await getVerificationEligibility(buyer)).toMatchObject({
    hasVerificationPurchase: false, canStartVerification: true, paymentRequired: false,
  });
  await expect(requireVerificationEligibility(buyer)).resolves.toBeDefined();
});

it('records an early refund tombstone before the client claims its purchase', async () => {
  paidMode();
  await notification('REFUND', now + 1000, { transaction: { revocationDate: now + 500 } });
  await expect(purchase()).rejects.toMatchObject({ status: 409, code: 'VERIFICATION_PURCHASE_REVOKED' });
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false, paymentRequired: true });
  expect(await rows('SELECT * FROM apple_verification_transactions')).toHaveLength(1);
});

it('allows only explicitly authorized accounts to use sandbox purchases', async () => {
  paidMode();
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', ` ${buyer.toUpperCase()} `);
  await purchase(transaction({ environment: 'Sandbox' }));
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: true, paymentRequired: false });
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', '');
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false, paymentRequired: true });
  await expect(purchase(transaction({ environment: 'Sandbox' }))).rejects.toThrow();
});

it('processes signed sandbox refunds after allowlist removal without granting sandbox access', async () => {
  paidMode();
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', buyer);
  await purchase(transaction({ environment: 'Sandbox' }));
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', '');
  await notification('REFUND', now + 1000, {
    transaction: { environment: 'Sandbox', revocationDate: now + 500 },
  });
  expect(await rows('SELECT * FROM apple_notification_events')).toHaveLength(1);
  expect((await rows("SELECT revoked_at FROM verification_entitlements WHERE source='apple'"))[0].revoked_at).toBeTruthy();
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false, paymentRequired: true });
  // Re-adding the reviewer later must not resurrect an already refunded purchase.
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', buyer);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false, paymentRequired: true });
});

it('records a signed sandbox purchase notification without treating it as production payment', async () => {
  paidMode();
  await notification('ONE_TIME_CHARGE', now, { transaction: { environment: 'Sandbox' } });
  expect(await rows('SELECT * FROM apple_notification_events')).toHaveLength(1);
  expect(await rows("SELECT * FROM verification_entitlements WHERE environment='Sandbox'")).toHaveLength(1);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false, paymentRequired: true });
  await expect(requireVerificationEligibility(buyer)).rejects.toMatchObject({ status: 402 });
});

it('rolls back the provisional entitlement when persisting the transaction fails', async () => {
  paidMode();
  state.failQuery = sql => sql.includes('INSERT INTO apple_verification_transactions');
  await expect(purchase()).rejects.toThrow('Isolated database write failure');
  state.failQuery = null;
  await expectNoPurchase();
  expect(await getVerificationEligibility(buyer)).toMatchObject({ paymentRequired: true });
});

it('does not keep a purchase when final eligibility rejects an unready paid configuration', async () => {
  vi.stubEnv('VERIFICATION_PAYMENT_MODE', 'apple_iap');
  await expect(purchase()).rejects.toMatchObject({ status: 503 });
  await expectNoPurchase();
});

it('rolls back the notification dedupe record when its entitlement update fails, permitting retry', async () => {
  paidMode();
  await purchase();
  const notificationUUID = randomUUID();
  state.failQuery = sql => sql.includes('UPDATE verification_entitlements SET');
  await expect(notification('REFUND', now + 1000, { notificationUUID })).rejects.toThrow('Isolated database write failure');
  state.failQuery = null;
  expect(await rows('SELECT * FROM apple_notification_events')).toHaveLength(0);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: true });
  await notification('REFUND', now + 1000, { notificationUUID });
  expect(await rows('SELECT * FROM apple_notification_events')).toHaveLength(1);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: false });
});

it('atomically permits only one owner when two accounts concurrently claim one original purchase', async () => {
  paidMode();
  state.verifyTransaction.mockImplementation(async (_signed, userId) => transaction({ appAccountToken: userId }));
  const results = await Promise.allSettled([
    recordAppleVerificationPurchase(buyer, 'buyer-claim'),
    recordAppleVerificationPurchase(otherUser, 'other-claim'),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect(await rows("SELECT * FROM verification_entitlements WHERE source='apple'")).toHaveLength(1);
  expect(await rows('SELECT * FROM apple_verification_transactions')).toHaveLength(1);
  const eligible = await Promise.all([getVerificationEligibility(buyer), getVerificationEligibility(otherUser)]);
  expect(eligible.filter(result => result.hasVerificationPurchase)).toHaveLength(1);
});

it('rejects reuse of a transaction ID for another original purchase without leaving its provisional grant', async () => {
  paidMode();
  await purchase();
  await expect(purchase(transaction({ originalTransactionId: '90071992547409939999' }))).rejects.toMatchObject({ status: 409 });
  expect(await rows("SELECT * FROM verification_entitlements WHERE source='apple'")).toHaveLength(1);
  expect(await rows('SELECT * FROM apple_verification_transactions')).toHaveLength(1);
});

it('preserves purchase ownership after account deletion so another account cannot claim it', async () => {
  paidMode();
  await purchase();
  await state.db.query('DELETE FROM users WHERE id=$1', [buyer]);
  const tombstone = (await rows("SELECT user_id,app_account_token FROM verification_entitlements WHERE source='apple'"))[0];
  expect(tombstone).toEqual({ user_id: null, app_account_token: buyer });
  await expect(purchase(transaction({ appAccountToken: otherUser }), otherUser)).rejects.toMatchObject({ status: 409 });
  expect(await getVerificationEligibility(otherUser)).toMatchObject({ hasVerificationPurchase: false, paymentRequired: true });
});

it('rejects an otherwise valid transaction for a nonexistent Borrowhood account', async () => {
  paidMode();
  const missingUser = randomUUID();
  await expect(purchase(transaction({ appAccountToken: missingUser }), missingUser)).rejects.toMatchObject({ status: 404 });
  await expectNoPurchase();
});

it('does not process malformed notification event metadata', async () => {
  paidMode();
  await purchase();
  state.verifyNotification.mockResolvedValueOnce({
    notification: { notificationUUID: randomUUID(), notificationType: 'REFUND', signedDate: now + 600000 },
    transaction: transaction(),
  });
  await expect(handleAppleVerificationNotification('signed-but-invalid-event')).rejects.toMatchObject({ status: 400 });
  expect(await rows('SELECT * FROM apple_notification_events')).toHaveLength(0);
  expect(await getVerificationEligibility(buyer)).toMatchObject({ hasVerificationPurchase: true });
});

it('records Apple TEST notifications without fabricating an entitlement', async () => {
  state.verifyNotification.mockResolvedValueOnce({
    notification: { notificationUUID: randomUUID(), notificationType: 'TEST', signedDate: now },
    transaction: null,
  });
  await expect(handleAppleVerificationNotification('signed-test-event')).resolves.toMatchObject({ received: true });
  expect(await rows('SELECT * FROM apple_notification_events')).toHaveLength(1);
  await expectNoPurchase();
});
