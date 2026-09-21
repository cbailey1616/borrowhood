import { Platform } from 'react-native';
import api from './api';

// App Store Connect defines the USD base price ($1.99); never invent a localized
// price on-device. This is a non-consumable access entitlement, not proof of ID.
export const VERIFICATION_PRODUCT_ID = 'com.borrowhood.app.verification';
const ACCOUNT_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let connection;
let purchaseInProgress = false;

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

const pending = () => failure('VERIFICATION_PURCHASE_PENDING',
  'Your Apple purchase is awaiting approval. Return here after it is approved; you won’t be charged twice.');

function checkEligibility(value) {
  if (!value || !['free_launch', 'apple_iap'].includes(value.mode)
      || typeof value.canStartVerification !== 'boolean'
      || typeof value.paymentRequired !== 'boolean') {
    throw failure('VERIFICATION_UNAVAILABLE', 'Couldn’t load verification options. Please try again.');
  }
  if (value.mode === 'free_launch' && (value.paymentRequired || !value.canStartVerification)) {
    throw failure('VERIFICATION_UNAVAILABLE', 'Verification is temporarily unavailable. Please try again later.');
  }
  if (value.mode === 'apple_iap'
      && (value.productId !== VERIFICATION_PRODUCT_ID || !ACCOUNT_TOKEN.test(value.appAccountToken || ''))) {
    throw failure('VERIFICATION_UNAVAILABLE', 'Verification purchases aren’t available yet. Please try again later.');
  }
  return value;
}

async function storeConnection() {
  if (Platform.OS !== 'ios') {
    throw failure('VERIFICATION_STORE_UNAVAILABLE', 'Paid verification is currently available in the iPhone and iPad app.');
  }
  // Loading/connecting the native StoreKit module is deliberately lazy. Free
  // launch never queries Apple, including on screens and on the Verify button.
  const store = require('expo-iap');
  if (!connection) {
    connection = Promise.resolve().then(() => store.initConnection()).then(connected => {
      if (!connected) throw new Error('Store unavailable');
      return store;
    }).catch(() => {
      connection = undefined;
      throw failure('VERIFICATION_STORE_UNAVAILABLE', 'Couldn’t connect to the App Store. Please try again.');
    });
  }
  return connection;
}

async function productFor(store) {
  const products = await store.fetchProducts({ skus: [VERIFICATION_PRODUCT_ID], type: 'in-app' });
  const product = products?.find(item => item.id === VERIFICATION_PRODUCT_ID);
  if (!product || typeof product.displayPrice !== 'string' || !product.displayPrice.trim()) {
    throw failure('VERIFICATION_PRODUCT_UNAVAILABLE', 'Verification purchases aren’t available in the App Store yet. You can still browse and share.');
  }
  return product;
}

export async function getVerificationOffer(isCurrent = () => true) {
  const eligibility = checkEligibility(await api.getVerificationEligibility());
  if (!isCurrent()) return null;
  if (!eligibility.paymentRequired) return { eligibility, product: null };
  try {
    const store = await storeConnection();
    if (!isCurrent()) return null;
    const product = await productFor(store);
    return isCurrent() ? { eligibility, product } : null;
  } catch (error) {
    // Preserve the known paid mode so an unavailable/removed-from-sale product
    // never hides Restore purchase for somebody who has already paid.
    const safeError = String(error?.code || '').startsWith('VERIFICATION_') ? error
      : failure('VERIFICATION_PRODUCT_UNAVAILABLE', 'Couldn’t load the App Store price. Please try again.');
    safeError.eligibility = eligibility;
    throw safeError;
  }
}

async function confirmPurchase(store, purchase, eligibility, isCurrent) {
  if (!isCurrent()) return null;
  if (purchase?.productId !== VERIFICATION_PRODUCT_ID) {
    throw failure('VERIFICATION_PURCHASE_INVALID', 'This purchase does not include Borrowhood verification.');
  }
  if (purchase.purchaseState !== 'purchased') throw pending();
  if (purchase.appAccountToken
      && purchase.appAccountToken.toLowerCase() !== eligibility.appAccountToken.toLowerCase()) {
    throw failure('VERIFICATION_ACCOUNT_MISMATCH', 'This Apple purchase belongs to a different Borrowhood account. Sign in to that account to continue.');
  }
  if (typeof purchase.purchaseToken !== 'string' || !purchase.purchaseToken) {
    throw failure('VERIFICATION_PURCHASE_INVALID', 'Couldn’t retrieve your Apple purchase. Use Restore purchase to try again.');
  }
  // Authentication can change while Apple's sheet is open. The server also
  // verifies the signed appAccountToken against the authenticated user.
  const current = checkEligibility(await api.getVerificationEligibility());
  if (!isCurrent()) return null;
  if (current.appAccountToken !== eligibility.appAccountToken) {
    throw failure('VERIFICATION_ACCOUNT_MISMATCH', 'Your account changed during the purchase. Sign in to the original account and restore it.');
  }
  const confirmed = checkEligibility(await api.confirmAppleVerificationPurchase(purchase.purchaseToken));
  if (confirmed.appAccountToken !== eligibility.appAccountToken || !confirmed.hasVerificationPurchase
      || !confirmed.canStartVerification) {
    throw failure('VERIFICATION_PURCHASE_UNCONFIRMED', 'Your purchase isn’t confirmed yet. Use Restore purchase before trying again.');
  }
  // Never finish an unvalidated transaction. Network failures leave it in
  // StoreKit's queue so retry/restore can recover it without a second charge.
  await store.finishTransaction({ purchase, isConsumable: false });
  return isCurrent() ? confirmed : null;
}

async function recoverPurchase(store, eligibility, isCurrent) {
  const [available, unfinished] = await Promise.all([
    store.getAvailablePurchases({ alsoPublishToEventListenerIOS: false, onlyIncludeActiveItemsIOS: true }),
    store.getPendingTransactionsIOS(),
  ]);
  if (!isCurrent()) return null;
  // Active StoreKit entitlements take precedence over old unfinished queue
  // entries (including a refunded transaction followed by a legitimate rebuy).
  const purchases = [...newestFirst(available), ...newestFirst(unfinished)]
    .filter(item => item.productId === VERIFICATION_PRODUCT_ID);
  if (!purchases.length) return null;
  // Prefer the matching account, but report mismatches instead of opening a
  // purchase sheet for a non-consumable this Apple account already owns.
  const matching = purchases.filter(item => belongsToAccount(item, eligibility));
  if (!matching.length) return confirmPurchase(store, purchases[0], eligibility, isCurrent);
  let rejected;
  const seen = new Set();
  for (const purchase of matching) {
    const key = purchase.id || purchase.transactionId || purchase.purchaseToken;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      return await confirmPurchase(store, purchase, eligibility, isCurrent);
    } catch (error) {
      // Only a definitive invalid/revoked receipt permits trying another one.
      // A network/auth/config failure must never lead to a fresh charge.
      if (!definitivelyRejected(error)) throw error;
      rejected = error;
    }
  }
  throw rejected;
}

const definitivelyRejected = error => ['VERIFICATION_PURCHASE_REVOKED', 'VERIFICATION_PURCHASE_INVALID'].includes(error?.code);
const belongsToAccount = (purchase, eligibility) => !purchase.appAccountToken
  || (typeof purchase.appAccountToken === 'string'
    && purchase.appAccountToken.toLowerCase() === eligibility.appAccountToken.toLowerCase());
const newestFirst = purchases => [...(purchases || [])].sort((a, b) =>
  (Number(b.transactionDate) || 0) - (Number(a.transactionDate) || 0));

async function finishSavedPurchase(eligibility, isCurrent) {
  if (!eligibility.hasVerificationPurchase || Platform.OS !== 'ios') return eligibility;
  try {
    const store = await storeConnection();
    if (!isCurrent()) return null;
    const unfinished = await store.getPendingTransactionsIOS();
    if (!isCurrent()) return null;
    let rejected;
    for (const purchase of newestFirst(unfinished).filter(item => item.productId === VERIFICATION_PRODUCT_ID
      && item.purchaseState === 'purchased' && belongsToAccount(item, eligibility))) {
      try {
        return await confirmPurchase(store, purchase, eligibility, isCurrent);
      } catch (error) {
        if (!definitivelyRejected(error)) throw error;
        rejected = error;
      }
    }
    if (rejected) {
      // A revoked OLD queue entry does not invalidate a newer saved entitlement.
      // Ask the server again; never preserve access based on stale local state.
      const current = checkEligibility(await api.getVerificationEligibility());
      if (!isCurrent()) return null;
      if (current.appAccountToken !== eligibility.appAccountToken) {
        throw failure('VERIFICATION_ACCOUNT_MISMATCH', 'Your account changed. Please reopen verification.');
      }
      if (!current.canStartVerification) throw rejected;
      return current;
    }
  } catch (error) {
    // A server-confirmed entitlement must keep working if Apple's queue cleanup
    // is offline. Explicit account/entitlement rejection is never ignored.
    if (['SESSION_CHANGED', 'SESSION_EXPIRED', 'INVALID_SESSION', 'ACCOUNT_SUSPENDED'].includes(error?.code)
        || [401, 403].includes(error?.status)) {
      throw failure('VERIFICATION_ACCOUNT_MISMATCH', 'Your account or session changed. Please sign in again and reopen verification.');
    }
    if (String(error?.code || '').startsWith('VERIFICATION_')
        && !['VERIFICATION_STORE_UNAVAILABLE', 'VERIFICATION_PRODUCT_UNAVAILABLE'].includes(error.code)) throw error;
  }
  return isCurrent() ? eligibility : null;
}

function requestStorePurchase(store, eligibility) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let updates;
    let errors;
    const finish = (error, purchase) => {
      if (settled) return;
      settled = true;
      updates?.remove();
      errors?.remove();
      if (error) reject(error); else resolve(purchase);
    };
    // Register before asking StoreKit. Both native return values and queued
    // purchase events are accepted, with a single settlement path.
    updates = store.purchaseUpdatedListener(purchase => {
      if (purchase.productId === VERIFICATION_PRODUCT_ID) finish(null, purchase);
    });
    errors = store.purchaseErrorListener(error => {
      if (!error.productId || error.productId === VERIFICATION_PRODUCT_ID) finish(error);
    });
    Promise.resolve().then(() => store.requestPurchase({
      type: 'in-app',
      request: { apple: {
        sku: VERIFICATION_PRODUCT_ID,
        appAccountToken: eligibility.appAccountToken,
        andDangerouslyFinishTransactionAutomatically: false,
      } },
    })).then(result => {
      const purchase = Array.isArray(result)
        ? result.find(item => item.productId === VERIFICATION_PRODUCT_ID) : result;
      finish(purchase ? null : pending(), purchase);
    }, error => finish(error));
  });
}

function storeError(error) {
  const code = String(error?.code || '').toLowerCase().replace(/^e_/, '').replace(/_/g, '-');
  if (code === 'user-cancelled') return null;
  if (['pending', 'deferred-payment'].includes(code)) throw pending();
  if (String(error?.code || '').startsWith('VERIFICATION_')) throw error;
  // Do not surface/log native receipt contents or payment-provider details.
  throw failure('VERIFICATION_PURCHASE_FAILED', 'Couldn’t confirm your Apple purchase. If you were charged, use Restore purchase; don’t buy it again.');
}

async function runPurchase({ isCurrent, restoreOnly, allowPurchase }) {
  if (purchaseInProgress) {
    throw failure('VERIFICATION_PURCHASE_BUSY', 'A verification purchase is already in progress. Please wait.');
  }
  purchaseInProgress = true;
  try {
    const eligibility = checkEligibility(await api.getVerificationEligibility());
    if (!isCurrent()) return null;
    if (eligibility.mode === 'free_launch' || eligibility.isVerified) return eligibility;
    if (eligibility.canStartVerification && !restoreOnly) {
      // Server delivery may succeed just before finishTransaction is interrupted.
      // Clear that saved transaction on retry without opening a purchase sheet.
      return await finishSavedPurchase(eligibility, isCurrent);
    }
    const store = await storeConnection();
    if (!isCurrent()) return null;
    if (restoreOnly) {
      // Unlike expo-iap's convenience restore in this pinned version, syncIOS
      // propagates failures rather than swallowing them.
      if (await store.syncIOS() !== true) throw new Error('Restore did not complete');
      if (!isCurrent()) return null;
    }
    const restored = await recoverPurchase(store, eligibility, isCurrent);
    if (!isCurrent()) return null;
    if (restored) return restored;
    if (restoreOnly) {
      if (eligibility.hasVerificationPurchase) return eligibility;
      throw failure('VERIFICATION_PURCHASE_NOT_FOUND', 'No verification purchase was found for this Apple account.');
    }
    if (!allowPurchase) {
      throw failure('VERIFICATION_OFFER_CHANGED', 'Verification options have changed. Review the current price before continuing.');
    }
    await productFor(store);
    if (!isCurrent()) return null;
    const purchase = await requestStorePurchase(store, eligibility);
    return await confirmPurchase(store, purchase, eligibility, isCurrent);
  } catch (error) {
    return storeError(error);
  } finally {
    purchaseInProgress = false;
  }
}

export const ensureVerificationAccess = (isCurrent = () => true, { allowPurchase = false } = {}) =>
  runPurchase({ isCurrent, restoreOnly: false, allowPurchase });

export const restoreVerificationPurchase = (isCurrent = () => true) =>
  runPurchase({ isCurrent, restoreOnly: true, allowPurchase: false });
