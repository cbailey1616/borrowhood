import { beforeEach, it, expect, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
const mocks = vi.hoisted(() => ({ google: vi.fn(), key: vi.fn() }));
vi.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken = mocks.google; } }));
vi.mock('jwks-rsa', () => ({ default: () => ({ getSigningKey: mocks.key }) }));
import { verifySocialIdentity, resolveSocialAccount } from '../../src/services/socialAuth.js';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const appleToken = (claims = {}) => jwt.sign({ sub: 'apple-person', email: 'hidden@privaterelay.appleid.com', email_verified: 'true', ...claims }, privateKey, {
  algorithm: 'RS256', issuer: 'https://appleid.apple.com', audience: 'com.borrowhood.app', expiresIn: '5m', keyid: 'local-key',
});
beforeEach(() => {
  vi.clearAllMocks(); process.env.GOOGLE_CLIENT_ID = 'borrowhood-web-client';
  mocks.key.mockResolvedValue({ getPublicKey: () => publicKey });
  mocks.google.mockResolvedValue({ getPayload: () => ({ sub: 'google-person', email: 'Person@Gmail.com', email_verified: true, given_name: 'Chris' }) });
});
it('pins Google tokens to the configured audience and normalizes email', async () => {
  expect(await verifySocialIdentity('google', 'token')).toMatchObject({ subject: 'google-person', email: 'person@gmail.com' });
  expect(mocks.google).toHaveBeenCalledWith({ idToken: 'token', audience: 'borrowhood-web-client' });
});
it('fails closed when Google is not configured', async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  await expect(verifySocialIdentity('google', 'token')).rejects.toMatchObject({ status: 503 });
  expect(mocks.google).not.toHaveBeenCalled();
});
it('rejects invalid Google tokens and unverified email', async () => {
  mocks.google.mockRejectedValueOnce(new Error('Wrong audience'));
  await expect(verifySocialIdentity('google', 'token')).rejects.toMatchObject({ status: 401 });
  mocks.google.mockResolvedValueOnce({ getPayload: () => ({ sub: 'id', email: 'person@gmail.com', email_verified: false }) });
  await expect(verifySocialIdentity('google', 'token')).rejects.toMatchObject({ status: 401 });
});
it('verifies Apple signatures and supports Hide My Email', async () => {
  expect(await verifySocialIdentity('apple', appleToken(), { givenName: 'Chris' })).toMatchObject({ email: 'hidden@privaterelay.appleid.com', firstName: 'Chris' });
});
it.each([{ aud: 'other-app' }, { iss: 'other-issuer' }, { exp: 1 }])('rejects Apple tokens with wrong claims: %j', async claims => {
  const token = jwt.sign({ sub: 'id', iss: 'https://appleid.apple.com', aud: 'com.borrowhood.app', exp: Math.floor(Date.now() / 1000) + 60, ...claims }, privateKey, { algorithm: 'RS256', keyid: 'local-key' });
  await expect(verifySocialIdentity('apple', token)).rejects.toMatchObject({ status: 401 });
});
const identity = { provider: 'google', subject: 'google-person', email: 'person@gmail.com', firstName: 'Chris', lastName: 'Bailey', photo: null };
const user = { id: 'user-1', email: identity.email, first_name: 'Chris', status: 'pending', onboarding_completed: true, google_id: null };
function db({ providerUser, emailUser, linkUser } = {}) {
  return { query: vi.fn(async sql => {
    if (sql.includes('pg_advisory')) return { rows: [] };
    if (sql.includes('WHERE google_id =')) return { rows: providerUser ? [providerUser] : [] };
    if (sql.includes('WHERE LOWER(email)')) return { rows: emailUser ? [emailUser] : [] };
    if (sql.includes('WHERE id =') && sql.startsWith('SELECT')) return { rows: linkUser ? [linkUser] : [] };
    if (sql.startsWith('INSERT INTO users')) return { rows: [{ ...user, onboarding_completed: false, onboarding_step: 2 }] };
    if (sql.startsWith('UPDATE')) return { rows: [] };
    throw new Error(sql);
  }) };
}
it('returns the original account without resetting onboarding or profile', async () => {
  const client = db({ providerUser: user });
  expect(await resolveSocialAccount(client, identity)).toEqual({ user, isNewUser: false });
  expect(client.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
});
it('requires proof before connecting an existing email account', async () => {
  const client = db({ emailUser: user });
  await expect(resolveSocialAccount(client, identity)).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_LINK_REQUIRED' });
  expect(client.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
});
it('creates new users at town setup without payment or verification writes', async () => {
  const client = db();
  expect((await resolveSocialAccount(client, identity)).user.onboarding_step).toBe(2);
  const inserts = client.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT'));
  expect(inserts).toHaveLength(1);
  expect(inserts[0][0]).not.toMatch(/stripe|is_verified|verification_grace/);
});
it('links only to the authenticated account and preserves its content', async () => {
  const client = db({ linkUser: user });
  await resolveSocialAccount(client, identity, user.id);
  expect(client.query).toHaveBeenCalledWith('UPDATE users SET google_id = $1 WHERE id = $2', ['google-person', 'user-1']);
});
it('cannot link a provider already owned by somebody else', async () => {
  await expect(resolveSocialAccount(db({ providerUser: user }), identity, 'another-user')).rejects.toMatchObject({ status: 409 });
});
it('blocks suspended accounts before issuing a session', async () => {
  await expect(resolveSocialAccount(db({ providerUser: { ...user, status: 'suspended' } }), identity)).rejects.toMatchObject({ status: 403 });
});
