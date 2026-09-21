import { readFileSync } from 'node:fs';
import { SignedDataVerifier, Environment, VerificationStatus } from '@apple/app-store-server-library';

export const VERIFICATION_PRODUCT_ID = 'com.borrowhood.app.verification';
export const APPLE_BUNDLE_ID = 'com.borrowhood.app';
export const APPLE_APP_ID = 6758581435;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const verifiers = new Map();
export const purchaseError = (status, message, code = 'VERIFICATION_PURCHASE_INVALID') =>
  Object.assign(new Error(message), { status, code, isVerificationPurchaseError: true });

export function isSandboxUser(userId) {
  return typeof userId === 'string' && (process.env.VERIFICATION_IAP_SANDBOX_USER_IDS || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(value => UUID.test(value))
    .includes(userId.toLowerCase());
}

function getVerifier(environment) {
  const paths = (process.env.APPLE_IAP_ROOT_CERT_PATHS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!paths.length) throw purchaseError(503, 'Apple purchases are not configured yet.', 'VERIFICATION_PURCHASE_UNAVAILABLE');
  const key = JSON.stringify([environment, paths]);
  if (!verifiers.has(key)) {
    try {
      // Only operator-installed Apple PKI roots are trusted. Never trust roots,
      // bundle IDs or environments supplied by the app or embedded in a JWS.
      verifiers.set(key, new SignedDataVerifier(paths.map(path => readFileSync(path)), true,
        environment, APPLE_BUNDLE_ID, APPLE_APP_ID));
    } catch {
      throw purchaseError(503, 'Apple purchases are not configured yet.', 'VERIFICATION_PURCHASE_UNAVAILABLE');
    }
  }
  return verifiers.get(key);
}

export function assertAppleVerificationConfigured() {
  getVerifier(Environment.PRODUCTION);
}

function validateSignedInput(value) {
  if (typeof value !== 'string' || value.length > 32000 || value.split('.').length !== 3) {
    throw purchaseError(400, 'A signed Apple transaction is required.');
  }
}

// Check semantic claims in addition to the official library's chain/signature,
// bundle and environment verification. Transaction IDs remain strings end-to-end.
export function validateAppleTransaction(transaction, userId, { allowRevoked = false, allowSandboxNotification = false } = {}) {
  if (!transaction || transaction.bundleId !== APPLE_BUNDLE_ID
      || transaction.productId !== VERIFICATION_PRODUCT_ID || transaction.type !== 'Non-Consumable'
      || !['Production', 'Sandbox'].includes(transaction.environment)
      || (transaction.environment === 'Sandbox' && !allowSandboxNotification && !isSandboxUser(userId))
      || typeof userId !== 'string' || !UUID.test(userId)
      || typeof transaction.appAccountToken !== 'string' || !UUID.test(transaction.appAccountToken)
      || transaction.appAccountToken.toLowerCase() !== userId.toLowerCase()
      || ![transaction.transactionId, transaction.originalTransactionId].every(id => typeof id === 'string' && /^\d{1,128}$/.test(id))
      || !Number.isSafeInteger(transaction.purchaseDate) || transaction.purchaseDate <= 0
      || !Number.isSafeInteger(transaction.signedDate) || transaction.signedDate <= 0
      || transaction.purchaseDate > Date.now() + 300000 || transaction.signedDate > Date.now() + 300000
      || (transaction.inAppOwnershipType && transaction.inAppOwnershipType !== 'PURCHASED')) {
    throw purchaseError(400, 'This Apple purchase does not belong to this Borrowhood account or product.');
  }
  if (transaction.revocationDate != null && (!Number.isSafeInteger(transaction.revocationDate) || transaction.revocationDate <= 0)) {
    throw purchaseError(400, 'This Apple purchase has an invalid revocation.');
  }
  if (!allowRevoked && transaction.revocationDate != null) {
    throw purchaseError(409, 'This purchase was refunded or revoked.', 'VERIFICATION_PURCHASE_REVOKED');
  }
  return transaction;
}

export async function verifyAppleTransaction(signedTransaction, userId) {
  validateSignedInput(signedTransaction);
  let retryable = false;
  const environments = [Environment.PRODUCTION, ...(isSandboxUser(userId) ? [Environment.SANDBOX] : [])];
  for (const environment of environments) {
    const verifier = getVerifier(environment);
    try {
      const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
      return validateAppleTransaction(transaction, userId);
    } catch (error) {
      // Apple's VerificationException.status is a library enum, not an HTTP
      // status. An environment mismatch must still try the authorized sandbox.
      if (error.isVerificationPurchaseError) throw error;
      if (error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) retryable = true;
    }
  }
  if (retryable) throw purchaseError(503, 'Apple purchase verification is temporarily unavailable. Please try again.', 'VERIFICATION_PURCHASE_UNAVAILABLE');
  throw purchaseError(400, 'Apple could not verify this purchase. Try restoring your purchase.');
}

export async function verifyAppleNotification(signedPayload) {
  validateSignedInput(signedPayload);
  let retryable = false;
  // Sandbox notifications remain processable after a tester leaves the list.
  // Purchase claims and entitlement access still require sandbox authorization.
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    const verifier = getVerifier(environment);
    try {
      const notification = await verifier.verifyAndDecodeNotification(signedPayload);
      const signedTransaction = notification.data?.signedTransactionInfo;
      if (!signedTransaction) {
        if (notification.notificationType === 'TEST') return { notification, transaction: null };
        throw purchaseError(400, 'Apple notification is missing its transaction.');
      }
      const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
      validateAppleTransaction(transaction, transaction.appAccountToken, { allowRevoked: true, allowSandboxNotification: true });
      return { notification, transaction };
    } catch (error) {
      if (error.isVerificationPurchaseError) throw error;
      if (error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) retryable = true;
    }
  }
  if (retryable) throw purchaseError(503, 'Apple notification verification is temporarily unavailable.', 'VERIFICATION_PURCHASE_UNAVAILABLE');
  throw purchaseError(400, 'Apple notification signature could not be verified.');
}
