import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL transactions in memory. No production DB, provider, or email calls.
const state = vi.hoisted(() => ({ db: null, send: vi.fn(), tokens: vi.fn() }));
vi.mock('../../src/utils/db.js', () => ({
  query: (...args) => state.db.query(...args),
  withTransaction: callback => state.db.transaction(callback),
}));
vi.mock('../../src/services/email.js', () => ({ sendSocialLinkCodeEmail: state.send }));
vi.mock('../../src/middleware/auth.js', () => ({ generateTokens: state.tokens }));
import { startSocialLinkCode, completeSocialLinkCode } from '../../src/services/socialLinkCodes.js';
import { resolveSocialAccount } from '../../src/services/socialAuth.js';

const identity = { provider: 'google', subject: 'google-person', email: 'person@example.com' };
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`
    CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE,
      first_name text, last_name text, status text DEFAULT 'active',
      onboarding_completed boolean DEFAULT true, onboarding_step int DEFAULT 5,
      google_id text UNIQUE, apple_id text UNIQUE);
    CREATE TABLE social_link_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id), provider text, subject text, email text,
      code_hash text, attempts int DEFAULT 0, expires_at timestamptz,
      created_at timestamptz DEFAULT NOW());
  `);
}, 20000);
afterAll(async () => { await state.db?.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  state.send.mockResolvedValue({});
  state.tokens.mockImplementation(id => ({ accessToken: `access:${id}`, refreshToken: `refresh:${id}` }));
  await state.db.exec("TRUNCATE social_link_codes, users; INSERT INTO users(email, first_name) VALUES ('person@example.com','Original');");
});
const begin = async () => {
  const challenge = await startSocialLinkCode(identity);
  return { ...challenge, code: state.send.mock.calls.at(-1)[1] };
};

it('connects the existing account with a delivered code, preserving profile and onboarding', async () => {
  const original = (await state.db.query('SELECT * FROM users')).rows[0];
  const { challengeId, code } = await begin();
  const stored = (await state.db.query('SELECT * FROM social_link_codes')).rows[0];
  expect(stored.code_hash).not.toBe(code);
  expect(state.send).toHaveBeenCalledWith(identity.email, expect.stringMatching(/^\d{6}$/), 'google');
  expect(state.tokens).not.toHaveBeenCalled();
  const result = await completeSocialLinkCode(identity, challengeId, code);
  expect(result.user).toMatchObject({ id: original.id, first_name: 'Original', onboarding_completed: true });
  expect(result.accessToken).toBe(`access:${original.id}`);
  const returning = await state.db.transaction(client => resolveSocialAccount(client, identity));
  expect(returning.user.id).toBe(original.id);
  expect((await state.db.query('SELECT * FROM users')).rows).toHaveLength(1);
  await expect(completeSocialLinkCode(identity, challengeId, code)).rejects.toMatchObject({ status: 400 });
});

it('commits failed attempts and blocks a correct code after five guesses', async () => {
  const { challengeId, code } = await begin();
  for (let i = 0; i < 5; i++) await expect(completeSocialLinkCode(identity, challengeId, '000000')).rejects.toThrow('Incorrect code');
  expect((await state.db.query('SELECT attempts FROM social_link_codes')).rows[0].attempts).toBe(5);
  await expect(completeSocialLinkCode(identity, challengeId, code)).rejects.toMatchObject({ status: 400 });
  expect(state.tokens).not.toHaveBeenCalled();
});

it.each([{ subject: 'someone-else' }, { email: 'other@example.com' }, { provider: 'apple' }])('binds the code to the verified identity: %j', async changed => {
  const { challengeId, code } = await begin();
  await expect(completeSocialLinkCode({ ...identity, ...changed }, challengeId, code)).rejects.toMatchObject({ status: 400 });
  expect(state.tokens).not.toHaveBeenCalled();
  expect((await state.db.query('SELECT google_id FROM users')).rows[0].google_id).toBeNull();
});

it('rejects expired codes and accounts suspended after the email was sent', async () => {
  const { challengeId, code } = await begin();
  await state.db.exec("UPDATE social_link_codes SET expires_at=NOW()-INTERVAL '1 second'");
  await expect(completeSocialLinkCode(identity, challengeId, code)).rejects.toMatchObject({ status: 400 });
  await state.db.exec("UPDATE social_link_codes SET expires_at=NOW()+INTERVAL '1 minute'; UPDATE users SET status='suspended'");
  await expect(completeSocialLinkCode(identity, challengeId, code)).rejects.toMatchObject({ status: 403 });
  expect(state.tokens).not.toHaveBeenCalled();
});

it('does not replace an existing provider connection', async () => {
  const { challengeId, code } = await begin();
  await state.db.exec("UPDATE users SET google_id='different-google-account'");
  await expect(completeSocialLinkCode(identity, challengeId, code)).rejects.toMatchObject({ status: 409 });
  expect(state.tokens).not.toHaveBeenCalled();
});

it('limits resends and invalidates the previous code after a resend', async () => {
  const old = await begin();
  await expect(startSocialLinkCode(identity)).rejects.toMatchObject({ status: 429 });
  expect(state.send).toHaveBeenCalledTimes(1);
  await state.db.exec("UPDATE social_link_codes SET created_at=NOW()-INTERVAL '2 minutes'");
  const next = await begin();
  await expect(completeSocialLinkCode(identity, old.challengeId, old.code)).rejects.toMatchObject({ status: 400 });
  await expect(completeSocialLinkCode(identity, next.challengeId, next.code)).resolves.toHaveProperty('accessToken');
});

it('fails visibly if delivery fails and leaves no usable challenge', async () => {
  state.send.mockRejectedValueOnce(new Error('Mail unavailable'));
  await expect(startSocialLinkCode(identity)).rejects.toMatchObject({ status: 503 });
  expect((await state.db.query('SELECT * FROM social_link_codes')).rows).toHaveLength(0);
  expect(state.tokens).not.toHaveBeenCalled();
});
