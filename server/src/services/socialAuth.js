import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const google = new OAuth2Client();
const apple = jwksClient({ jwksUri: 'https://appleid.apple.com/auth/keys', cache: true, cacheMaxAge: 86400000 });
export const socialError = (status, message, code) => Object.assign(new Error(message), { status, code });

export async function verifySocialIdentity(provider, token, fullName) {
  if (typeof token !== 'string' || !token || token.length > 16000) throw socialError(400, 'Please try signing in again.');
  let payload;
  if (provider === 'google') {
    const audience = process.env.GOOGLE_CLIENT_ID;
    if (!audience) throw socialError(503, 'Google sign-in is unavailable right now. Please use email.');
    try {
      const ticket = await google.verifyIdToken({ idToken: token, audience });
      payload = ticket.getPayload();
    } catch { throw socialError(401, 'Google couldn’t verify this sign-in. Please try again.'); }
  } else if (provider === 'apple') {
    try {
      const header = jwt.decode(token, { complete: true })?.header;
      if (!header?.kid || header.alg !== 'RS256') throw new Error('Invalid header');
      const key = await apple.getSigningKey(header.kid);
      payload = jwt.verify(token, key.getPublicKey(), {
        algorithms: ['RS256'], issuer: 'https://appleid.apple.com', audience: 'com.borrowhood.app',
      });
    } catch { throw socialError(401, 'Apple couldn’t verify this sign-in. Please try again.'); }
  } else throw socialError(400, 'Choose Apple or Google.');
  if (typeof payload?.sub !== 'string' || !payload.sub || payload.sub.length > 255) throw socialError(401, 'Invalid sign-in.');
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
  if ((email && ![true, 'true'].includes(payload.email_verified)) || (provider === 'google' && !email)) {
    throw socialError(401, 'Please verify your email with your sign-in provider first.');
  }
  if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw socialError(401, 'Invalid email from sign-in provider.');
  const clean = value => typeof value === 'string' ? value.trim().slice(0, 100) : '';
  return {
    provider, subject: payload.sub, email,
    firstName: clean(provider === 'apple' ? fullName?.givenName : (payload.given_name || payload.name?.split(' ')[0])),
    lastName: clean(provider === 'apple' ? fullName?.familyName : payload.family_name),
    photo: provider === 'google' && typeof payload.picture === 'string' && payload.picture.startsWith('https://') ? payload.picture : null,
  };
}

// Called inside a DB transaction. Provider subjects identify returning users;
// email matches require proof of access to the existing Borrowhood account.
export async function lockSocialIdentity(client, { provider, subject, email }) {
  const locks = [`social:${provider}:${subject}`, ...(email ? [`social:email:${email}`] : [])].sort();
  for (const lock of locks) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lock]);
}

export async function resolveSocialAccount(client, identity, linkUserId = null) {
  const { provider, subject, email, firstName, lastName, photo } = identity;
  const column = { apple: 'apple_id', google: 'google_id' }[provider];
  if (!column) throw socialError(400, 'Unknown sign-in provider.');
  const fields = 'id, email, first_name, last_name, status, onboarding_completed, onboarding_step, apple_id, google_id';
  // Serialize retries and competing provider signups for the same email.
  await lockSocialIdentity(client, identity);
  const existing = await client.query(`SELECT ${fields} FROM users WHERE ${column} = $1 FOR UPDATE`, [subject]);
  if (existing.rows[0]) {
    const user = existing.rows[0];
    if (user.status === 'suspended') throw socialError(403, 'Account suspended.');
    if (linkUserId && user.id !== linkUserId) throw socialError(409, 'This sign-in belongs to another Borrowhood account.');
    return { user, isNewUser: false };
  }
  if (linkUserId) {
    const { rows } = await client.query(`SELECT ${fields} FROM users WHERE id = $1 FOR UPDATE`, [linkUserId]);
    const user = rows[0];
    if (!user || user.status === 'suspended') throw socialError(403, 'This account is unavailable.');
    if (user[column] && user[column] !== subject) throw socialError(409, 'Another sign-in is already connected.');
    await client.query(`UPDATE users SET ${column} = $1 WHERE id = $2`, [subject, user.id]);
    return { user, isNewUser: false };
  }
  if (!email) throw socialError(400, 'Please allow Apple to share your email, then try again. Hide My Email works too.');
  const matches = await client.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [email]);
  if (matches.rows.length) throw Object.assign(socialError(409, 'Connect your existing Borrowhood account to continue.', 'ACCOUNT_LINK_REQUIRED'), { email });
  const result = await client.query(
    `INSERT INTO users (email, first_name, last_name, ${column}, profile_photo_url, onboarding_step)
     VALUES ($1, $2, $3, $4, $5, 2) RETURNING ${fields}`,
    [email, firstName, lastName, subject, photo]
  );
  const user = result.rows[0];
  await client.query('UPDATE users SET referral_code = $1 WHERE id = $2', ['BH-' + user.id.replace(/-/g, '').slice(0, 8), user.id]);
  // No payment setup and no changes to identity verification status.
  return { user, isNewUser: true };
}
