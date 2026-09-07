import crypto from 'node:crypto';
import { query, withTransaction } from '../utils/db.js';
import { lockSocialIdentity, resolveSocialAccount, socialError } from './socialAuth.js';
import { sendSocialLinkCodeEmail } from './email.js';
import { generateTokens } from '../middleware/auth.js';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// The identity has already been verified with Google/Apple. A code sent to the
// existing account proves ownership without asking for either provider's password.
export async function startSocialLinkCode(identity) {
  if (!identity.email) throw socialError(400, 'Please allow your sign-in provider to share your email.');
  const code = crypto.randomInt(100000, 1000000).toString();
  const challenge = await withTransaction(async client => {
    await lockSocialIdentity(client, identity);
    const { rows } = await client.query('SELECT id, email, status FROM users WHERE LOWER(email)=$1 FOR UPDATE', [identity.email]);
    const user = rows[0];
    if (!user || user.status === 'suspended') throw socialError(403, 'This account cannot be connected.');
    const recent = await client.query("SELECT id FROM social_link_codes WHERE user_id=$1 AND created_at > NOW() - INTERVAL '1 minute' LIMIT 1", [user.id]);
    if (recent.rows.length) throw socialError(429, 'Please wait a minute before requesting another code.');
    await client.query('DELETE FROM social_link_codes WHERE user_id=$1', [user.id]);
    const result = await client.query(`INSERT INTO social_link_codes
      (user_id, provider, subject, email, code_hash, expires_at)
      VALUES ($1,$2,$3,$4,$5,NOW() + INTERVAL '10 minutes') RETURNING id`,
    [user.id, identity.provider, identity.subject, identity.email, hash(code)]);
    return { id: result.rows[0].id, email: user.email };
  });
  try { await sendSocialLinkCodeEmail(challenge.email, code, identity.provider); }
  catch {
    await query('DELETE FROM social_link_codes WHERE id=$1', [challenge.id]);
    throw socialError(503, 'Could not send the code. Please try again or use your Borrowhood password.');
  }
  return { challengeId: challenge.id, email: challenge.email };
}

export async function completeSocialLinkCode(identity, challengeId, code) {
  const result = await withTransaction(async client => {
    await lockSocialIdentity(client, identity);
    const { rows } = await client.query(`SELECT *, expires_at > NOW() AS valid
      FROM social_link_codes WHERE id=$1 FOR UPDATE`, [challengeId]);
    const challenge = rows[0];
    if (!challenge?.valid || challenge.attempts >= 5 || challenge.provider !== identity.provider
      || challenge.subject !== identity.subject || challenge.email !== identity.email) {
      return { error: socialError(400, 'This code has expired or cannot be used. Request a new code.') };
    }
    await client.query('UPDATE social_link_codes SET attempts=attempts+1 WHERE id=$1', [challengeId]);
    if (!crypto.timingSafeEqual(Buffer.from(challenge.code_hash), Buffer.from(hash(code)))) {
      // Return the error so the transaction commits the failed attempt.
      return { error: socialError(400, 'Incorrect code. Check your email and try again.') };
    }
    const account = await client.query('SELECT email FROM users WHERE id=$1', [challenge.user_id]);
    if (account.rows[0]?.email.toLowerCase() !== identity.email) return { error: socialError(409, 'This account has changed. Start signing in again.') };
    const { user } = await resolveSocialAccount(client, identity, challenge.user_id);
    const tokens = generateTokens(user.id);
    await client.query('DELETE FROM social_link_codes WHERE user_id=$1', [user.id]);
    return { user, ...tokens };
  });
  if (result.error) throw result.error;
  return result;
}
