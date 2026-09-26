import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  db: null,
  userId: null,
  failQuery: null,
  sessions: new Map(),
  sessionsByKey: new Map(),
  customerCreate: vi.fn(),
  sessionCreate: vi.fn(),
  sessionGet: vi.fn(),
  ephemeralCreate: vi.fn(),
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
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: state.userId }; next(); },
  ENABLE_PAID_TIERS: true,
}));
vi.mock('../../src/services/appleVerification.js', async importOriginal => ({
  ...await importOriginal(),
  assertAppleVerificationConfigured: vi.fn(),
}));
vi.mock('../../src/services/stripe.js', () => ({
  stripe: {
    customers: { create: state.customerCreate },
    identity: { verificationSessions: { create: state.sessionCreate } },
    ephemeralKeys: { create: state.ephemeralCreate },
  },
  getIdentityVerificationSession: state.sessionGet,
}));

import { startIdentitySession, sendIdentityError } from '../../src/services/identitySession.js';
import { ensureVerificationPurchaseSchema, getVerificationEligibility } from '../../src/services/verificationPurchases.js';
import identityRouter from '../../src/routes/identity.js';
import subscriptionsRouter from '../../src/routes/subscriptions.js';

const userId = randomUUID();
const rows = async (sql, params) => (await state.db.query(sql, params)).rows;
const user = async () => (await rows('SELECT * FROM users WHERE id=$1', [userId]))[0];
const paidMode = () => {
  vi.stubEnv('VERIFICATION_PAYMENT_MODE', 'apple_iap');
  vi.stubEnv('VERIFICATION_IAP_READY', 'true');
};
const session = (overrides = {}) => ({
  id: 'vs_existing', status: 'requires_input',
  url: 'https://verify.stripe.test/session', client_secret: 'isolated-client-secret', ...overrides,
});
const seedSession = async (overrides = {}) => {
  const current = session(overrides);
  state.sessions.set(current.id, current);
  await state.db.query('UPDATE users SET stripe_identity_session_id=$1,stripe_customer_id=$2 WHERE id=$3',
    [current.id, 'cus_existing', userId]);
  return current;
};
const expectNoStripeCalls = () => {
  expect(state.customerCreate).not.toHaveBeenCalled();
  expect(state.sessionCreate).not.toHaveBeenCalled();
  expect(state.sessionGet).not.toHaveBeenCalled();
  expect(state.ephemeralCreate).not.toHaveBeenCalled();
};
const app = express();
app.use(express.json());
app.use('/api/identity', identityRouter);
app.use('/api/subscriptions', subscriptionsRouter);

beforeAll(async () => { state.db = new PGlite(); }, 20000);
afterAll(async () => { await state.db?.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  vi.clearAllMocks();
  state.userId = userId;
  state.failQuery = null;
  state.sessions.clear();
  state.sessionsByKey.clear();
  vi.stubEnv('VERIFICATION_PAYMENT_MODE', 'free_launch');
  vi.stubEnv('VERIFICATION_IAP_READY', 'false');
  vi.stubEnv('VERIFICATION_IAP_SANDBOX_USER_IDS', '');
  vi.stubEnv('ENABLE_PAYMENTS', 'false');
  state.customerCreate.mockReset().mockResolvedValue({ id: 'cus_created' });
  state.sessionGet.mockReset().mockImplementation(async id => {
    if (!state.sessions.has(id)) throw new Error('Provider could not retrieve identity session');
    return state.sessions.get(id);
  });
  state.sessionCreate.mockReset().mockImplementation(async (params, { idempotencyKey }) => {
    // Match Stripe's validation so an app-only return scheme cannot pass mocks
    // and then break every live verification request.
    const returnUrl = new URL(params.return_url);
    if (returnUrl.protocol !== 'https:' || returnUrl.username || returnUrl.password) {
      throw Object.assign(new Error('Not a valid URL'), { code: 'url_invalid', param: 'return_url' });
    }
    if (!state.sessionsByKey.has(idempotencyKey)) {
      const created = session({ id: `vs_created_${state.sessionsByKey.size + 1}` });
      state.sessions.set(created.id, created);
      state.sessionsByKey.set(idempotencyKey, created);
    }
    return state.sessionsByKey.get(idempotencyKey);
  });
  state.ephemeralCreate.mockReset().mockResolvedValue({ secret: 'isolated-ephemeral-secret' });
  await state.db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE users (
      id UUID PRIMARY KEY, email TEXT, first_name TEXT, last_name TEXT,
      stripe_customer_id TEXT, is_verified BOOLEAN NOT NULL DEFAULT false,
      stripe_identity_session_id TEXT, verification_status TEXT
    )`);
  await state.db.query('INSERT INTO users(id,email,first_name,last_name) VALUES($1,$2,$3,$4)',
    [userId, 'neighbor@example.test', 'Test', 'Neighbor']);
  await ensureVerificationPurchaseSchema();
}, 20000);

it.each([false, true])('enforces the paid gate before every Stripe call for native=%s', async native => {
  paidMode();
  await expect(startIdentitySession(userId, { native })).rejects.toMatchObject({
    status: 402, code: 'VERIFICATION_PURCHASE_REQUIRED',
  });
  expectNoStripeCalls();
  expect(await rows('SELECT * FROM verification_entitlements')).toHaveLength(0);
});

it('returns native-route 402 with a stable purchase-required code and makes no provider call', async () => {
  paidMode();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await request(app).post('/api/identity/verify').send({});
    expect(response.status).toBe(402);
    expect(response.body.code).toBe('VERIFICATION_PURCHASE_REQUIRED');
    expectNoStripeCalls();
  } finally { log.mockRestore(); }
});

it.each(['false', 'true'])('permanently retires external verification checkout with ENABLE_PAYMENTS=%s', async enabled => {
  vi.stubEnv('ENABLE_PAYMENTS', enabled);
  const response = await request(app).post('/api/subscriptions/verify-payment').send({ paymentMethodId: 'pm_test' });
  expect(response.status).toBe(410);
  expect(response.body.code).toBe('VERIFICATION_IAP_REQUIRED');
  expectNoStripeCalls();
});

it('starts a free hosted check, durably grants launch eligibility, and never marks identity verified', async () => {
  const result = await startIdentitySession(userId);
  expect(result).toMatchObject({ sessionId: 'vs_created_1', verificationUrl: 'https://verify.stripe.test/session' });
  expect(result.clientSecret).toBeUndefined();
  expect(await user()).toMatchObject({
    stripe_customer_id: 'cus_created', stripe_identity_session_id: 'vs_created_1',
    verification_status: 'pending', is_verified: false,
  });
  expect(await rows("SELECT * FROM verification_entitlements WHERE source='launch_free'")).toHaveLength(1);
  expect(state.sessionCreate).toHaveBeenCalledWith(expect.objectContaining({
    type: 'document', metadata: { customer_id: 'cus_created', userId },
    return_url: 'https://borrowhood-production.up.railway.app/verification-complete',
    options: { document: expect.objectContaining({ require_live_capture: true, require_matching_selfie: true }) },
  }), { idempotencyKey: `identity-${userId}-0-initial` });
  paidMode();
  expect(await getVerificationEligibility(userId)).toMatchObject({ paymentRequired: false, hasVerificationPurchase: false });
  await startIdentitySession(userId);
  expect(state.sessionCreate).toHaveBeenCalledTimes(1);
});

it('reuses one existing session for hosted/native retries without creating another check', async () => {
  const existing = await seedSession();
  const hosted = await startIdentitySession(userId);
  const native = await startIdentitySession(userId, { native: true });
  expect(hosted).toEqual({ verificationUrl: existing.url, sessionId: existing.id });
  expect(native).toEqual({
    clientSecret: existing.client_secret, sessionId: existing.id, ephemeralKeySecret: 'isolated-ephemeral-secret',
  });
  expect(state.sessionCreate).not.toHaveBeenCalled();
  expect(state.customerCreate).not.toHaveBeenCalled();
  expect(state.ephemeralCreate).toHaveBeenCalledWith({ verification_session: existing.id }, { apiVersion: '2024-06-20' });
});

it('retries a rejected Stripe request without resetting identity or changing its idempotency key', async () => {
  state.sessionCreate.mockRejectedValueOnce(Object.assign(new Error('Not a valid URL'), {
    code: 'url_invalid', param: 'return_url',
  }));
  await expect(startIdentitySession(userId)).rejects.toMatchObject({ code: 'url_invalid' });
  expect(await user()).toMatchObject({ is_verified: false, stripe_identity_session_id: null });
  expect(await rows('SELECT * FROM verification_entitlements')).toHaveLength(0);
  expect(await startIdentitySession(userId)).toMatchObject({ sessionId: 'vs_created_1' });
  expect(state.sessionCreate.mock.calls.map(call => call[1].idempotencyKey)).toEqual([
    `identity-${userId}-0-initial`, `identity-${userId}-0-initial`,
  ]);
  expect(state.sessionsByKey.size).toBe(1);
});

it('does not turn a failed provider lookup into a new billable check', async () => {
  await seedSession();
  state.sessionGet.mockRejectedValueOnce(new Error('Provider unavailable'));
  await expect(startIdentitySession(userId)).rejects.toThrow('Provider unavailable');
  expect(state.sessionCreate).not.toHaveBeenCalled();
  expect(state.customerCreate).not.toHaveBeenCalled();
  expect((await user()).stripe_identity_session_id).toBe('vs_existing');
  expect(await rows("SELECT * FROM verification_entitlements WHERE source='launch_free'")).toHaveLength(0);
});

it('serializes concurrent hosted/native starts into one provider session and one free grant', async () => {
  const [hosted, native] = await Promise.all([
    startIdentitySession(userId), startIdentitySession(userId, { native: true }),
  ]);
  expect(hosted.sessionId).toBe(native.sessionId);
  expect(state.sessionCreate).toHaveBeenCalledTimes(1);
  expect(state.customerCreate).toHaveBeenCalledTimes(1);
  expect(state.ephemeralCreate).toHaveBeenCalledTimes(1);
  expect(await rows("SELECT * FROM verification_entitlements WHERE source='launch_free'")).toHaveLength(1);
});

it('rolls back a failed session save and retries with the same Stripe idempotency key', async () => {
  state.failQuery = sql => sql.includes('UPDATE users SET stripe_identity_session_id=');
  await expect(startIdentitySession(userId)).rejects.toThrow('Isolated database write failure');
  expect(await rows('SELECT * FROM verification_entitlements')).toHaveLength(0);
  expect(await user()).toMatchObject({ stripe_customer_id: null, stripe_identity_session_id: null, is_verified: false });
  state.failQuery = null;
  expect(await startIdentitySession(userId)).toMatchObject({ sessionId: 'vs_created_1' });
  expect(state.sessionCreate).toHaveBeenCalledTimes(2);
  expect(state.sessionCreate.mock.calls.map(call => call[1].idempotencyKey)).toEqual([
    `identity-${userId}-0-initial`, `identity-${userId}-0-initial`,
  ]);
  expect(state.customerCreate.mock.calls.map(call => call[1].idempotencyKey)).toEqual([
    `identity-customer-${userId}`, `identity-customer-${userId}`,
  ]);
  expect(state.sessionsByKey.size).toBe(1);
  expect(await rows("SELECT * FROM verification_entitlements WHERE source='launch_free'")).toHaveLength(1);
});

it('rolls back a native ephemeral-key failure and reuses the provider check on retry', async () => {
  state.ephemeralCreate.mockRejectedValueOnce(new Error('Ephemeral key unavailable'));
  await expect(startIdentitySession(userId, { native: true })).rejects.toThrow('Ephemeral key unavailable');
  expect(await rows('SELECT * FROM verification_entitlements')).toHaveLength(0);
  expect((await user()).stripe_identity_session_id).toBeNull();
  expect(await startIdentitySession(userId, { native: true })).toMatchObject({ sessionId: 'vs_created_1' });
  expect(state.sessionsByKey.size).toBe(1);
});

it('creates one replacement for a canceled check using the previous session ID in its key', async () => {
  await seedSession({ status: 'canceled' });
  expect(await startIdentitySession(userId)).toMatchObject({ sessionId: 'vs_created_1' });
  expect(state.sessionCreate.mock.calls[0][1].idempotencyKey).toBe(`identity-${userId}-0-vs_existing`);
  await startIdentitySession(userId, { native: true });
  expect(state.sessionCreate).toHaveBeenCalledTimes(1);
});

it('does not create a new check for an identity already verified by Stripe', async () => {
  await seedSession({ status: 'verified' });
  await expect(startIdentitySession(userId)).rejects.toMatchObject({ status: 409, code: 'VERIFICATION_COMPLETE' });
  expect(state.sessionCreate).not.toHaveBeenCalled();
  expect(state.customerCreate).not.toHaveBeenCalled();
  expect((await user()).is_verified).toBe(false);
});

it('keeps processing status unverified instead of granting identity privileges', async () => {
  await seedSession({ status: 'processing' });
  await startIdentitySession(userId);
  expect(await user()).toMatchObject({ verification_status: 'processing', is_verified: false });
  expect(state.sessionCreate).not.toHaveBeenCalled();
});

it('rejects an already verified or nonexistent account before contacting Stripe', async () => {
  await state.db.query('UPDATE users SET is_verified=true WHERE id=$1', [userId]);
  await expect(startIdentitySession(userId)).rejects.toMatchObject({ status: 400, code: 'ALREADY_VERIFIED' });
  await expect(startIdentitySession(randomUUID())).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
  expectNoStripeCalls();
});

it.each([undefined, 4, 503, 999])('returns a safe retryable response for raw provider status %j without leaking details', status => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  sendIdentityError(res, Object.assign(new Error('Sensitive provider diagnostics'), { status }));
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({
    error: 'Could not start identity verification. Please try again.', code: 'VERIFICATION_UNAVAILABLE',
  });
});
