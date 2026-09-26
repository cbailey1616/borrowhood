import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../utils/db.js';

const clientId = 'com.borrowhood.app';
export const appleRevocationHelpUrl = 'https://support.apple.com/102571';
export const appleSignInConfigured = () => Boolean(process.env.APPLE_SIGN_IN_TEAM_ID && process.env.APPLE_SIGN_IN_KEY_ID && process.env.APPLE_SIGN_IN_PRIVATE_KEY && process.env.JWT_SECRET);
export async function ensureAppleSignInSchema(db = { query }) {
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_refresh_token_ciphertext TEXT');
  // No user FK or identifier: deletion must survive provider outages. Erase the
  // encrypted token as soon as revocation succeeds; only pending jobs exist here.
  await db.query(`CREATE TABLE IF NOT EXISTS apple_token_revocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), token_ciphertext TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query('CREATE INDEX IF NOT EXISTS apple_revocation_due ON apple_token_revocations(next_attempt_at)');
}
const key = () => {
  if (!process.env.JWT_SECRET) throw new Error('Apple token encryption is not configured');
  return createHash('sha256').update('borrowhood:apple-refresh:v1:').update(process.env.JWT_SECRET).digest();
};
export function encryptAppleToken(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
function decryptAppleToken(value) {
  const bytes = Buffer.from(value, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}
function clientSecret() {
  if (!appleSignInConfigured()) throw new Error('Apple sign-in revocation is not configured');
  return jwt.sign({}, process.env.APPLE_SIGN_IN_PRIVATE_KEY.replace(/\\n/g, '\n'), {
    algorithm: 'ES256', keyid: process.env.APPLE_SIGN_IN_KEY_ID,
    issuer: process.env.APPLE_SIGN_IN_TEAM_ID, subject: clientId,
    audience: 'https://appleid.apple.com', expiresIn: '5m',
  });
}
async function applePost(path, values) {
  const response = await fetch(`https://appleid.apple.com/auth/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret(), ...values }),
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  if (!response.ok) throw new Error('Apple authorization request failed');
  return response;
}
export async function saveAppleAuthorization(db, userId, identity, verifyIdentity) {
  if (identity.provider !== 'apple' || !identity.authorizationCode) return;
  if (!appleSignInConfigured()) {
    // Compatibility with the existing build. The release readiness check
    // requires these credentials before shipping the new Apple integration.
    console.error('Apple sign-in token storage needs configuration');
    return;
  }
  try {
    if (typeof identity.authorizationCode !== 'string' || identity.authorizationCode.length > 4096) throw new Error('Invalid code');
    const tokens = await (await applePost('token', { code: identity.authorizationCode, grant_type: 'authorization_code' })).json();
    const confirmed = await verifyIdentity('apple', tokens.id_token);
    if (confirmed.subject !== identity.subject || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) throw new Error('Token identity mismatch');
    await db.query('UPDATE users SET apple_refresh_token_ciphertext=$2 WHERE id=$1', [userId, encryptAppleToken(tokens.refresh_token)]);
  } catch {
    throw Object.assign(new Error('Apple couldn’t finish authorizing this sign-in. Please try again.'), { status: 503 });
  }
}
export async function queueAppleRevocation(db, user) {
  if (!user.apple_id) return { status: 'not_needed' };
  if (!user.apple_refresh_token_ciphertext) return { status: 'manual', helpUrl: appleRevocationHelpUrl };
  const result = await db.query('INSERT INTO apple_token_revocations(token_ciphertext) VALUES($1) RETURNING id', [user.apple_refresh_token_ciphertext]);
  await db.query('UPDATE users SET apple_refresh_token_ciphertext=NULL WHERE id=$1', [user.id]);
  return { status: 'queued', id: result.rows[0].id };
}
export async function processAppleRevocations(onlyId = null) {
  let completed = false;
  // Bounded batches and SKIP LOCKED support concurrent workers. Credentials are
  // never logged; an Apple outage cannot roll back a completed account deletion.
  for (let i = 0; i < (onlyId ? 1 : 10); i++) {
    const result = await withTransaction(async db => {
      const job = (await db.query(`SELECT * FROM apple_token_revocations
        WHERE next_attempt_at <= NOW() AND ($1::uuid IS NULL OR id=$1)
        ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED`, [onlyId])).rows[0];
      if (!job) return null;
      try {
        await applePost('revoke', { token: decryptAppleToken(job.token_ciphertext), token_type_hint: 'refresh_token' });
        await db.query('DELETE FROM apple_token_revocations WHERE id=$1', [job.id]);
        return true;
      } catch {
        await db.query(`UPDATE apple_token_revocations SET attempts=attempts+1,
          next_attempt_at=NOW()+INTERVAL '1 hour' WHERE id=$1`, [job.id]);
        console.error('Apple token revocation pending retry');
        return false;
      }
    });
    if (result === null) break;
    completed ||= result;
  }
  return completed;
}
