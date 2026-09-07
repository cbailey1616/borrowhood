import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcrypt';
const state = vi.hoisted(() => ({ db: null, send: vi.fn(), tokens: vi.fn() }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/services/email.js', () => ({ sendSignupCodeEmail: state.send }));
vi.mock('../../src/middleware/auth.js', () => ({ generateTokens: state.tokens }));
import { ensureSignupSchema, startSignup, resendSignupCode, completeSignup } from '../../src/services/signupVerification.js';
const form = { email: 'new@example.test', firstName: 'New', lastName: 'Neighbor', password: 'SecretPassword123!' };
beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', 'isolated-signup-test-secret');
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE,
    password_hash text, first_name text, last_name text, phone text, referred_by uuid REFERENCES users(id),
    referral_code text UNIQUE, onboarding_step int DEFAULT 0, status text DEFAULT 'pending', is_verified boolean DEFAULT false)`);
  await ensureSignupSchema();
}, 20000);
afterAll(async () => { await state.db?.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  vi.clearAllMocks();
  state.send.mockResolvedValue(undefined);
  state.tokens.mockImplementation(id => ({ accessToken: `access:${id}`, refreshToken: `refresh:${id}` }));
  await state.db.exec('TRUNCATE signup_email_codes, users CASCADE');
});
const begin = async (data = form) => ({ ...await startSignup(data), code: state.send.mock.calls.at(-1)[1] });
const allowResend = () => state.db.exec("UPDATE signup_email_codes SET last_sent_at=NOW()-INTERVAL '2 minutes'");

it('creates no account or session until the delivered code is verified, then consumes it once', async () => {
  const pending = await begin();
  expect(pending).toMatchObject({ verificationRequired: true, email: form.email, resendAfter: 60 });
  expect((await state.db.query('SELECT * FROM users')).rows).toHaveLength(0);
  expect(state.tokens).not.toHaveBeenCalled();
  const stored = (await state.db.query('SELECT * FROM signup_email_codes')).rows[0];
  expect(stored.code_hash).not.toContain(pending.code);
  expect(stored.password_hash).not.toBe(form.password);
  expect(await bcrypt.compare(form.password, stored.password_hash)).toBe(true);
  const complete = await completeSignup(pending.challengeId, pending.code);
  expect(complete.accessToken).toBe(`access:${complete.user.id}`);
  const user = (await state.db.query('SELECT * FROM users')).rows[0];
  expect(user.email_verified_at).toBeTruthy();
  expect(user.is_verified).toBe(false);
  expect(user.onboarding_step).toBe(1);
  expect(user.referral_code).toMatch(/^BH-/);
  expect((await state.db.query('SELECT * FROM signup_email_codes')).rows).toHaveLength(0);
  await expect(completeSignup(pending.challengeId, pending.code)).rejects.toThrow(/expired|already used/);
  expect(state.tokens).toHaveBeenCalledTimes(1);
});

it('commits incorrect attempts and blocks the correct code after five guesses', async () => {
  const pending = await begin();
  for (let n=0;n<5;n++) await expect(completeSignup(pending.challengeId, '000000')).rejects.toMatchObject({ status: 400 });
  expect((await state.db.query('SELECT attempts FROM signup_email_codes')).rows[0].attempts).toBe(5);
  await expect(completeSignup(pending.challengeId, pending.code)).rejects.toThrow();
  expect(state.tokens).not.toHaveBeenCalled();
});

it('rejects an expired code and lets the recipient request a replacement', async () => {
  const pending = await begin();
  await state.db.exec("UPDATE signup_email_codes SET expires_at=NOW()-INTERVAL '1 second'");
  await expect(completeSignup(pending.challengeId, pending.code)).rejects.toThrow();
  await allowResend();
  await resendSignupCode(pending.challengeId);
  const fresh = state.send.mock.calls.at(-1)[1];
  await expect(completeSignup(pending.challengeId, fresh)).resolves.toHaveProperty('accessToken');
});

it('limits resends, invalidates the previous code, and limits hourly sends', async () => {
  const pending = await begin();
  await expect(resendSignupCode(pending.challengeId)).rejects.toMatchObject({ status: 429 });
  await expect(startSignup(form)).rejects.toMatchObject({ status: 429 });
  await allowResend();
  await resendSignupCode(pending.challengeId);
  expect(state.send).toHaveBeenCalledTimes(2);
  // Different randomness can theoretically repeat six digits; bind to the stored replacement hash.
  const latest = state.send.mock.calls.at(-1)[1];
  if (latest !== pending.code) await expect(completeSignup(pending.challengeId, pending.code)).rejects.toThrow('Incorrect code');
  await state.db.exec("UPDATE signup_email_codes SET send_count=5,last_sent_at=NOW()-INTERVAL '2 minutes'");
  await expect(resendSignupCode(pending.challengeId)).rejects.toMatchObject({ status: 429, code: 'SIGNUP_CODE_LIMIT' });
  await expect(startSignup(form)).rejects.toMatchObject({ status: 429 });
  await expect(completeSignup(pending.challengeId, latest)).resolves.toHaveProperty('accessToken');
});

it('does not create an account or leave a challenge when initial delivery fails', async () => {
  state.send.mockRejectedValueOnce(new Error('provider failure'));
  await expect(startSignup(form)).rejects.toMatchObject({ status: 503 });
  expect((await state.db.query('SELECT * FROM users')).rows).toHaveLength(0);
  expect((await state.db.query('SELECT * FROM signup_email_codes')).rows).toHaveLength(0);
  expect(state.tokens).not.toHaveBeenCalled();
});

it('keeps the previous delivered code usable when a resend fails', async () => {
  const pending = await begin();
  await allowResend();
  state.send.mockRejectedValueOnce(new Error('provider failure'));
  await expect(resendSignupCode(pending.challengeId)).rejects.toMatchObject({ status: 503 });
  await expect(completeSignup(pending.challengeId, pending.code)).resolves.toHaveProperty('accessToken');
});

it('binds a code to its original form and never verifies a replacement password with the old challenge', async () => {
  const original = await begin();
  await allowResend();
  const replacement = await begin({ ...form, password: 'DifferentPassword123!' });
  expect(replacement.challengeId).not.toBe(original.challengeId);
  await expect(completeSignup(original.challengeId, replacement.code)).rejects.toThrow();
  const result = await completeSignup(replacement.challengeId, replacement.code);
  const user = (await state.db.query('SELECT password_hash FROM users WHERE id=$1', [result.user.id])).rows[0];
  expect(await bcrypt.compare('DifferentPassword123!', user.password_hash)).toBe(true);
  expect(await bcrypt.compare(form.password, user.password_hash)).toBe(false);
});

it('does not replace or attach a password to an account created by social sign-in during verification', async () => {
  const pending = await begin();
  await state.db.query('INSERT INTO users(email,first_name) VALUES ($1,$2)', [form.email,'Social']);
  await expect(completeSignup(pending.challengeId, pending.code)).rejects.toMatchObject({ status: 409 });
  expect((await state.db.query('SELECT first_name,password_hash FROM users')).rows).toEqual([{ first_name:'Social', password_hash:null }]);
  expect(state.tokens).not.toHaveBeenCalled();
});

it('keeps simultaneous signup completion single-use', async () => {
  const pending = await begin();
  const results = await Promise.allSettled([completeSignup(pending.challengeId,pending.code),completeSignup(pending.challengeId,pending.code)]);
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect((await state.db.query('SELECT id FROM users')).rows).toHaveLength(1);
  expect(state.tokens).toHaveBeenCalledTimes(1);
});

it('keeps existing accounts unchanged and removes abandoned signup data', async () => {
  await state.db.query('INSERT INTO users(email,first_name) VALUES ($1,$2)', [form.email,'Existing']);
  await expect(startSignup(form)).rejects.toMatchObject({ status: 409 });
  expect(state.send).not.toHaveBeenCalled();
  await begin({ ...form, email: 'abandoned@example.test' });
  await state.db.exec("UPDATE signup_email_codes SET created_at=NOW()-INTERVAL '2 days'");
  await ensureSignupSchema();
  expect((await state.db.query('SELECT * FROM signup_email_codes')).rows).toHaveLength(0);
  expect((await state.db.query('SELECT first_name FROM users')).rows[0].first_name).toBe('Existing');
});
