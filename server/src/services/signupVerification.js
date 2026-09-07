import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { query, withTransaction } from '../utils/db.js';
import { generateTokens } from '../middleware/auth.js';
import { sendSignupCodeEmail } from './email.js';

const fail = (status, message, code, retryAfter) => Object.assign(new Error(message), { status, code, retryAfter });
const expired = () => fail(400, 'This code expired or was already used. Request a new code, or sign in if you already finished.', 'SIGNUP_CODE_EXPIRED');
const duplicate = () => fail(409, 'An account with this email is already registered. Please sign in.', 'ACCOUNT_EXISTS');
const lockEmail = (client, email) => client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`social:email:${email}`]);
function digest(id, code) {
  if (!process.env.JWT_SECRET) throw fail(503, 'Sign-up is temporarily unavailable. Please try again.');
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`signup:${id}:${code}`).digest('hex');
}
const publicChallenge = row => ({ verificationRequired: true, challengeId: row.id, email: row.email, expiresIn: 600, resendAfter: 60 });

export async function ensureSignupSchema() {
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ');
  await query(`CREATE TABLE IF NOT EXISTS signup_email_codes (
    id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT, referral_code TEXT,
    code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL, last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    send_count INTEGER NOT NULL DEFAULT 1, send_window_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query('CREATE INDEX IF NOT EXISTS signup_email_codes_cleanup ON signup_email_codes(created_at)');
  await query("DELETE FROM signup_email_codes WHERE created_at < NOW() - INTERVAL '1 day'");
}

function checkSendLimit(row) {
  if (row?.cooldown > 0) throw fail(429, 'Please wait a minute before requesting another code.', 'SIGNUP_CODE_COOLDOWN', Math.ceil(row.cooldown));
  if (row?.in_window && row.send_count >= 5) throw fail(429, 'You have requested several codes. Please try again in an hour.', 'SIGNUP_CODE_LIMIT', 3600);
}
const timingFields = `EXTRACT(EPOCH FROM (last_sent_at + INTERVAL '1 minute' - NOW())) AS cooldown,
  send_window_at > NOW() - INTERVAL '1 hour' AS in_window`;

export async function startSignup({ email, password, firstName, lastName, phone, referralCode }) {
  const id = crypto.randomUUID();
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = digest(id, code);
  const row = await withTransaction(async client => {
    await lockEmail(client, email);
    if ((await client.query('SELECT id FROM users WHERE LOWER(email)=$1', [email])).rows.length) throw duplicate();
    await client.query("DELETE FROM signup_email_codes WHERE created_at < NOW() - INTERVAL '1 day'");
    const previous = (await client.query(`SELECT *, ${timingFields} FROM signup_email_codes WHERE email=$1 FOR UPDATE`, [email])).rows[0];
    checkSendLimit(previous);
    const passwordHash = await bcrypt.hash(password, 12);
    // Every new form submission gets a new ID, so a code can never confirm another form's password.
    await client.query('DELETE FROM signup_email_codes WHERE email=$1', [email]);
    await client.query(`INSERT INTO signup_email_codes
      (id,email,password_hash,first_name,last_name,phone,referral_code,code_hash,expires_at,send_count,send_window_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()+INTERVAL '10 minutes',$9,COALESCE($10,NOW()))`,
    [id,email,passwordHash,firstName,lastName,phone || null,referralCode?.trim() || null,codeHash,
      previous?.in_window ? previous.send_count + 1 : 1, previous?.in_window ? previous.send_window_at : null]);
    return { id, email };
  });
  try { await sendSignupCodeEmail(email, code); }
  catch {
    await query('DELETE FROM signup_email_codes WHERE id=$1', [id]);
    throw fail(503, 'We could not send your code. Your account has not been created. Please try again.');
  }
  return publicChallenge(row);
}

export async function resendSignupCode(id) {
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = digest(id, code);
  const previous = await withTransaction(async client => {
    const email = (await client.query('SELECT email FROM signup_email_codes WHERE id=$1', [id])).rows[0]?.email;
    if (!email) throw expired();
    await lockEmail(client, email);
    const row = (await client.query(`SELECT *, ${timingFields}, created_at > NOW()-INTERVAL '1 day' AS resumable
      FROM signup_email_codes WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!row?.resumable) throw expired();
    if ((await client.query('SELECT id FROM users WHERE LOWER(email)=$1', [email])).rows.length) throw duplicate();
    checkSendLimit(row);
    await client.query(`UPDATE signup_email_codes SET code_hash=$2, attempts=0,
      expires_at=NOW()+INTERVAL '10 minutes', last_sent_at=NOW(),
      send_count=$3, send_window_at=COALESCE($4,NOW()) WHERE id=$1`,
    [id,codeHash,row.in_window ? row.send_count+1 : 1,row.in_window ? row.send_window_at : null]);
    return row;
  });
  try { await sendSignupCodeEmail(previous.email, code); }
  catch {
    // Keep the previous delivered code usable after a failed resend; don't overwrite a newer send.
    await query(`UPDATE signup_email_codes SET code_hash=$3, attempts=$4, expires_at=$5,
      last_sent_at=$6, send_count=$7, send_window_at=$8 WHERE id=$1 AND code_hash=$2`,
    [id,codeHash,previous.code_hash,previous.attempts,previous.expires_at,previous.last_sent_at,previous.send_count,previous.send_window_at]);
    throw fail(503, 'We could not resend your code. Try again, or use the last code we sent.');
  }
  return publicChallenge(previous);
}

export async function completeSignup(id, code) {
  const supplied = digest(id, code);
  const result = await withTransaction(async client => {
    const email = (await client.query('SELECT email FROM signup_email_codes WHERE id=$1', [id])).rows[0]?.email;
    if (!email) return { error: expired() };
    await lockEmail(client, email);
    const row = (await client.query('SELECT *, expires_at > NOW() AS valid FROM signup_email_codes WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!row?.valid || row.attempts >= 5) return { error: expired() };
    await client.query('UPDATE signup_email_codes SET attempts=attempts+1 WHERE id=$1', [id]);
    if (!crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(supplied))) {
      return { error: fail(400, row.attempts >= 4 ? 'Too many incorrect codes. Request a new code to continue.' : 'Incorrect code. Check your email and try again.', 'SIGNUP_CODE_INCORRECT') };
    }
    if ((await client.query('SELECT id FROM users WHERE LOWER(email)=$1', [email])).rows.length) {
      await client.query('DELETE FROM signup_email_codes WHERE id=$1', [id]);
      return { error: duplicate() };
    }
    let referrerId = null;
    if (row.referral_code) referrerId = (await client.query('SELECT id FROM users WHERE referral_code=$1', [row.referral_code])).rows[0]?.id || null;
    const user = (await client.query(`INSERT INTO users
      (email,password_hash,first_name,last_name,phone,referred_by,email_verified_at,onboarding_step)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),1) RETURNING id,email,first_name,last_name,status`,
    [email,row.password_hash,row.first_name,row.last_name,row.phone,referrerId])).rows[0];
    await client.query('UPDATE users SET referral_code=$1 WHERE id=$2', ['BH-'+user.id.replace(/-/g,'').slice(0,8),user.id]);
    const tokens = generateTokens(user.id);
    await client.query('DELETE FROM signup_email_codes WHERE id=$1', [id]);
    return { user, referrerId, ...tokens };
  });
  if (result.error) throw result.error;
  return result;
}
