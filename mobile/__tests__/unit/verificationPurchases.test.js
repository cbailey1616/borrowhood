const TOKEN = '11111111-1111-4111-8111-111111111111';
const OTHER_TOKEN = '22222222-2222-4222-8222-222222222222';
const PRODUCT = 'com.borrowhood.app.verification';
const paid = { mode: 'apple_iap', productId: PRODUCT, appAccountToken: TOKEN,
  paymentRequired: true, canStartVerification: false, hasVerificationPurchase: false, isVerified: false };
const entitled = { ...paid, paymentRequired: false, canStartVerification: true, hasVerificationPurchase: true };
const free = { ...paid, mode: 'free_launch', paymentRequired: false, canStartVerification: true };
const purchase = { id: 'apple-transaction-1', transactionId: 'apple-transaction-1', productId: PRODUCT,
  appAccountToken: TOKEN, purchaseState: 'purchased', purchaseToken: 'signed.apple.transaction', platform: 'ios' };
let service;
let api;
let store;
let platform;

beforeEach(() => {
  jest.resetModules();
  api = require('../../src/services/api').default;
  store = require('expo-iap');
  platform = require('react-native').Platform;
  platform.OS = 'ios';
  service = require('../../src/services/verificationPurchases');
  api.getVerificationEligibility.mockResolvedValue(paid);
  api.confirmAppleVerificationPurchase.mockResolvedValue(entitled);
  store.requestPurchase.mockResolvedValue(purchase);
});

it('does not query, initialize, restore, or charge through StoreKit during free launch', async () => {
  api.getVerificationEligibility.mockResolvedValue(free);
  await expect(service.getVerificationOffer()).resolves.toEqual({ eligibility: free, product: null });
  await expect(service.ensureVerificationAccess()).resolves.toEqual(free);
  await expect(service.restoreVerificationPurchase()).resolves.toEqual(free);
  for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
});

it('does not put already verified launch users behind a purchase', async () => {
  const verified = { ...entitled, hasVerificationPurchase: false, isVerified: true };
  api.getVerificationEligibility.mockResolvedValue(verified);
  await expect(service.ensureVerificationAccess()).resolves.toEqual(verified);
  expect(store.initConnection).not.toHaveBeenCalled();
});

it('reads the displayed price from the App Store product, not a hardcoded USD value', async () => {
  store.fetchProducts.mockResolvedValue([{ id: PRODUCT, displayPrice: '€2,49' }]);
  const offer = await service.getVerificationOffer();
  expect(offer.product.displayPrice).toBe('€2,49');
  expect(store.fetchProducts).toHaveBeenCalledWith({ skus: [PRODUCT], type: 'in-app' });
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('fails closed when the product has not been made available', async () => {
  store.fetchProducts.mockResolvedValue([]);
  await expect(service.getVerificationOffer()).rejects.toMatchObject({ code: 'VERIFICATION_PRODUCT_UNAVAILABLE' });
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_PRODUCT_UNAVAILABLE' });
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('preserves paid eligibility on product lookup failure so restoration remains available', async () => {
  store.fetchProducts.mockRejectedValue(new Error('Store offline'));
  await expect(service.getVerificationOffer()).rejects.toMatchObject({
    code: 'VERIFICATION_PRODUCT_UNAVAILABLE', eligibility: paid,
  });
  store.getAvailablePurchases.mockResolvedValue([purchase]);
  await expect(service.restoreVerificationPurchase()).resolves.toEqual(entitled);
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('does not unexpectedly buy if the user saw a free offer before paid mode was enabled', async () => {
  await expect(service.ensureVerificationAccess()).rejects.toMatchObject({ code: 'VERIFICATION_OFFER_CHANGED' });
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('binds the Apple purchase to this account and validates it on the server before finishing', async () => {
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).resolves.toEqual(entitled);
  expect(store.requestPurchase).toHaveBeenCalledWith({ type: 'in-app', request: { apple: {
    sku: PRODUCT, appAccountToken: TOKEN, andDangerouslyFinishTransactionAutomatically: false,
  } } });
  expect(api.confirmAppleVerificationPurchase).toHaveBeenCalledWith('signed.apple.transaction');
  expect(store.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
  expect(api.confirmAppleVerificationPurchase.mock.invocationCallOrder[0]).toBeLessThan(store.finishTransaction.mock.invocationCallOrder[0]);
  expect(entitled.isVerified).toBe(false);
  expect(api.startIdentityVerification).not.toHaveBeenCalled();
});

it('registers listeners before requesting a purchase and removes them after completion', async () => {
  await service.ensureVerificationAccess(() => true, { allowPurchase: true });
  expect(store.purchaseUpdatedListener.mock.invocationCallOrder[0]).toBeLessThan(store.requestPurchase.mock.invocationCallOrder[0]);
  expect(store.purchaseErrorListener.mock.invocationCallOrder[0]).toBeLessThan(store.requestPurchase.mock.invocationCallOrder[0]);
  expect(store.purchaseUpdatedListener.mock.results[0].value.remove).toHaveBeenCalledTimes(1);
  expect(store.purchaseErrorListener.mock.results[0].value.remove).toHaveBeenCalledTimes(1);
});

it('accepts the purchase event and native result only once', async () => {
  store.requestPurchase.mockImplementation(async () => {
    store.purchaseUpdatedListener.mock.calls[0][0](purchase);
    return purchase;
  });
  await service.ensureVerificationAccess(() => true, { allowPurchase: true });
  expect(api.confirmAppleVerificationPurchase).toHaveBeenCalledTimes(1);
  expect(store.finishTransaction).toHaveBeenCalledTimes(1);
});

it('silently returns after the user cancels without posting a purchase or starting identity', async () => {
  store.requestPurchase.mockRejectedValue({ code: 'user-cancelled' });
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).resolves.toBeNull();
  expect(api.confirmAppleVerificationPurchase).not.toHaveBeenCalled();
  expect(store.finishTransaction).not.toHaveBeenCalled();
});

it.each(['pending', 'deferred-payment'])('does not finalize or grant access to a %s purchase', async code => {
  store.requestPurchase.mockRejectedValue({ code });
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_PENDING' });
  expect(api.confirmAppleVerificationPurchase).not.toHaveBeenCalled();
  expect(store.finishTransaction).not.toHaveBeenCalled();
});

it('does not grant access for an unfinished pending purchase object', async () => {
  store.requestPurchase.mockResolvedValue({ ...purchase, purchaseState: 'pending' });
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_PENDING' });
  expect(api.confirmAppleVerificationPurchase).not.toHaveBeenCalled();
});

it('restores a non-consumable without creating another charge', async () => {
  store.getAvailablePurchases.mockResolvedValue([purchase]);
  await expect(service.restoreVerificationPurchase()).resolves.toEqual(entitled);
  expect(store.syncIOS).toHaveBeenCalledTimes(1);
  expect(store.finishTransaction).toHaveBeenCalledTimes(1);
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('recovers an interrupted transaction before even considering a new purchase', async () => {
  store.getPendingTransactionsIOS.mockResolvedValue([purchase]);
  await expect(service.ensureVerificationAccess()).resolves.toEqual(entitled);
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('leaves a transaction unfinished after network failure and recovers it on the next attempt', async () => {
  api.confirmAppleVerificationPurchase.mockRejectedValueOnce(new Error('Offline'));
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_FAILED' });
  expect(store.finishTransaction).not.toHaveBeenCalled();
  store.getPendingTransactionsIOS.mockResolvedValue([purchase]);
  await expect(service.ensureVerificationAccess()).resolves.toEqual(entitled);
  expect(store.requestPurchase).toHaveBeenCalledTimes(1);
  expect(store.finishTransaction).toHaveBeenCalledTimes(1);
});

it('does not recharge when the purchase is saved but verification is not completed', async () => {
  api.getVerificationEligibility.mockResolvedValue(entitled);
  await expect(service.ensureVerificationAccess()).resolves.toEqual(entitled);
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('finishes an interrupted queue entry after the entitlement was already saved', async () => {
  api.getVerificationEligibility.mockResolvedValue(entitled);
  store.getPendingTransactionsIOS.mockResolvedValue([purchase]);
  await expect(service.ensureVerificationAccess()).resolves.toEqual(entitled);
  expect(api.confirmAppleVerificationPurchase).toHaveBeenCalledTimes(1);
  expect(store.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('does not block an existing entitlement when optional queue cleanup is offline', async () => {
  api.getVerificationEligibility.mockResolvedValue(entitled);
  store.getPendingTransactionsIOS.mockRejectedValue(new Error('App Store offline'));
  await expect(service.ensureVerificationAccess()).resolves.toEqual(entitled);
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('does not ignore an account change during optional queue cleanup', async () => {
  api.getVerificationEligibility.mockResolvedValueOnce(entitled)
    .mockRejectedValueOnce(Object.assign(new Error('Account changed'), { code: 'SESSION_CHANGED' }));
  store.getPendingTransactionsIOS.mockResolvedValue([purchase]);
  await expect(service.ensureVerificationAccess()).rejects.toMatchObject({ code: 'VERIFICATION_ACCOUNT_MISMATCH' });
  expect(api.confirmAppleVerificationPurchase).not.toHaveBeenCalled();
  expect(store.finishTransaction).not.toHaveBeenCalled();
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('does not ignore a revoked transaction found during optional queue cleanup', async () => {
  api.getVerificationEligibility.mockResolvedValueOnce(entitled).mockResolvedValueOnce(entitled).mockResolvedValue(paid);
  store.getPendingTransactionsIOS.mockResolvedValue([purchase]);
  api.confirmAppleVerificationPurchase.mockRejectedValue(Object.assign(new Error('Refunded'), { code: 'VERIFICATION_PURCHASE_REVOKED' }));
  await expect(service.ensureVerificationAccess()).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_REVOKED' });
  expect(store.finishTransaction).not.toHaveBeenCalled();
});

it('prefers a current active purchase over an old refunded unfinished transaction', async () => {
  const old = { ...purchase, id: 'old-refunded', purchaseToken: 'old.refunded.jws', transactionDate: 1 };
  const active = { ...purchase, id: 'new-active', purchaseToken: 'new.active.jws', transactionDate: 2 };
  store.getPendingTransactionsIOS.mockResolvedValue([old]);
  store.getAvailablePurchases.mockResolvedValue([active]);
  await expect(service.restoreVerificationPurchase()).resolves.toEqual(entitled);
  expect(api.confirmAppleVerificationPurchase).toHaveBeenCalledWith('new.active.jws');
  expect(api.confirmAppleVerificationPurchase).not.toHaveBeenCalledWith('old.refunded.jws');
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('tries another matching receipt after definitive revocation, without charging again', async () => {
  const old = { ...purchase, id: 'old-refunded', purchaseToken: 'old.refunded.jws' };
  const active = { ...purchase, id: 'new-active', purchaseToken: 'new.active.jws' };
  store.getAvailablePurchases.mockResolvedValue([old, active]);
  api.confirmAppleVerificationPurchase.mockRejectedValueOnce(Object.assign(new Error('Refunded'), { code: 'VERIFICATION_PURCHASE_REVOKED' }));
  await expect(service.restoreVerificationPurchase()).resolves.toEqual(entitled);
  expect(api.confirmAppleVerificationPurchase).toHaveBeenCalledTimes(2);
  expect(store.finishTransaction).toHaveBeenCalledTimes(1);
  expect(store.finishTransaction).toHaveBeenCalledWith({ purchase: active, isConsumable: false });
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('does not treat network failure as a definitively invalid receipt or try to repurchase', async () => {
  store.getAvailablePurchases.mockResolvedValue([purchase, { ...purchase, id: 'other' }]);
  api.confirmAppleVerificationPurchase.mockRejectedValueOnce(new Error('Offline'));
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_FAILED' });
  expect(api.confirmAppleVerificationPurchase).toHaveBeenCalledTimes(1);
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('preserves a currently server-confirmed entitlement if cleanup finds an unrelated old refund', async () => {
  api.getVerificationEligibility.mockResolvedValue(entitled);
  store.getPendingTransactionsIOS.mockResolvedValue([{ ...purchase, id: 'old-refunded', purchaseToken: 'old.refunded.jws' }]);
  api.confirmAppleVerificationPurchase.mockRejectedValueOnce(Object.assign(new Error('Refunded'), { code: 'VERIFICATION_PURCHASE_REVOKED' }));
  await expect(service.ensureVerificationAccess()).resolves.toEqual(entitled);
  expect(api.getVerificationEligibility).toHaveBeenCalledTimes(3);
  expect(store.finishTransaction).not.toHaveBeenCalled();
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('does not finish or use an entitlement the server rejected', async () => {
  api.confirmAppleVerificationPurchase.mockResolvedValue(paid);
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_UNCONFIRMED' });
  expect(store.finishTransaction).not.toHaveBeenCalled();
});

it('does not restore or try to repurchase an Apple purchase belonging to another account', async () => {
  store.getAvailablePurchases.mockResolvedValue([{ ...purchase, appAccountToken: OTHER_TOKEN }]);
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_ACCOUNT_MISMATCH' });
  expect(api.confirmAppleVerificationPurchase).not.toHaveBeenCalled();
  expect(store.finishTransaction).not.toHaveBeenCalled();
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('detects an account switch while the Apple sheet was open', async () => {
  api.getVerificationEligibility.mockResolvedValueOnce(paid).mockResolvedValue({ ...paid, appAccountToken: OTHER_TOKEN });
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_ACCOUNT_MISMATCH' });
  expect(api.confirmAppleVerificationPurchase).not.toHaveBeenCalled();
});

it('does not accept a server response for a different account', async () => {
  api.confirmAppleVerificationPurchase.mockResolvedValue({ ...entitled, appAccountToken: OTHER_TOKEN });
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_UNCONFIRMED' });
  expect(store.finishTransaction).not.toHaveBeenCalled();
});

it('reports an empty restore without buying', async () => {
  await expect(service.restoreVerificationPurchase()).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_NOT_FOUND' });
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('does not silently swallow an App Store restore failure', async () => {
  store.syncIOS.mockRejectedValue(new Error('App Store offline'));
  await expect(service.restoreVerificationPurchase()).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_FAILED' });
  expect(store.getAvailablePurchases).not.toHaveBeenCalled();
});

it('does not load StoreKit on another platform or fall back to an external checkout', async () => {
  platform.OS = 'android';
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_STORE_UNAVAILABLE' });
  expect(store.initConnection).not.toHaveBeenCalled();
  expect(api.createVerificationPayment).not.toHaveBeenCalled();
});

it('stops before purchase if navigation left while the product was loading', async () => {
  let current = true;
  store.fetchProducts.mockImplementation(async () => { current = false; return [{ id: PRODUCT, displayPrice: '$1.99' }]; });
  await expect(service.ensureVerificationAccess(() => current, { allowPurchase: true })).resolves.toBeNull();
  expect(store.requestPurchase).not.toHaveBeenCalled();
});

it('leaves an interrupted paid transaction recoverable when the user left the screen', async () => {
  let current = true;
  store.requestPurchase.mockImplementation(async () => { current = false; return purchase; });
  await expect(service.ensureVerificationAccess(() => current, { allowPurchase: true })).resolves.toBeNull();
  expect(api.confirmAppleVerificationPurchase).not.toHaveBeenCalled();
  expect(store.finishTransaction).not.toHaveBeenCalled();
});

it('prevents simultaneous purchase attempts', async () => {
  let resolve;
  api.getVerificationEligibility.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const first = service.ensureVerificationAccess(() => true, { allowPurchase: true });
  await expect(service.ensureVerificationAccess(() => true, { allowPurchase: true })).rejects.toMatchObject({ code: 'VERIFICATION_PURCHASE_BUSY' });
  resolve(paid);
  await expect(first).resolves.toEqual(entitled);
  expect(store.requestPurchase).toHaveBeenCalledTimes(1);
});

it('fails closed on malformed eligibility instead of assuming verification is free', async () => {
  api.getVerificationEligibility.mockResolvedValue({ mode: 'free_launch' });
  await expect(service.ensureVerificationAccess()).rejects.toMatchObject({ code: 'VERIFICATION_UNAVAILABLE' });
  expect(store.initConnection).not.toHaveBeenCalled();
});
