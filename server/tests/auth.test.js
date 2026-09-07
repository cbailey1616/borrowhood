/**
 * Auth Route Tests
 * Tests: register, login, forgot/reset password, GET /me, admin endpoints
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
vi.mock('../src/services/email.js', () => ({ sendSignupCodeEmail: vi.fn().mockResolvedValue(undefined), sendSocialLinkCodeEmail: vi.fn().mockResolvedValue(undefined), sendResetCodeEmail: vi.fn().mockResolvedValue(undefined), sendAccountHintEmail: vi.fn().mockResolvedValue(undefined) }));
import { sendResetCodeEmail, sendSignupCodeEmail } from '../src/services/email.js';
import jwt from 'jsonwebtoken';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, cleanupTestUser } from './helpers/stripe.js';

import { ensureSignupSchema } from '../src/services/signupVerification.js';

let app;
const createdUserIds = [];
async function registerAndVerify(data) {
  const pending = await request(app).post('/api/auth/register').send({ ...data, verificationFlow: 'email-code-v1' });
  if (pending.status !== 202) return pending;
  expect(pending.body.accessToken).toBeUndefined();
  const code = sendSignupCodeEmail.mock.calls.filter(([recipient]) => recipient === pending.body.email).at(-1)[1];
  return request(app).post('/api/auth/register/verify').send({ challengeId: pending.body.challengeId, code });
}


describe('Authenticated password changes', () => {
  it('requires the current password, changes only the signed-in account, and accepts the new password', async () => {
    const email = `change-${Date.now()}@authtest.borrowhood.test`;
    const signup = await registerAndVerify({ email, password: 'OriginalPass123!', firstName: 'Password', lastName: 'Test' });
    expect(signup.status).toBe(201);
    createdUserIds.push(signup.body.user.id);
    const endpoint = () => request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${signup.body.accessToken}`);
    const unauthenticated = await request(app).post('/api/auth/change-password').send({ currentPassword: 'OriginalPass123!', newPassword: 'UpdatedPass123!' });
    expect(unauthenticated.status).toBe(401);
    expect((await endpoint().send({ currentPassword: 'wrong', newPassword: 'UpdatedPass123!' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'OriginalPass123!' })).status).toBe(200);
    expect((await endpoint().send({ currentPassword: 'OriginalPass123!', newPassword: 'short' })).status).toBe(400);
    const changed = await endpoint().send({ currentPassword: 'OriginalPass123!', newPassword: 'UpdatedPass123!' });
    expect(changed.status).toBe(200);
    expect(changed.body.accessToken).toBeTruthy();
    expect(changed.body.refreshToken).toBeTruthy();
    expect((await request(app).post('/api/auth/login').send({ email, password: 'OriginalPass123!' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'UpdatedPass123!' })).status).toBe(200);
  });
});

beforeAll(async () => {
  await ensureSignupSchema();
  app = await createTestApp(
    { path: '/api/auth', module: '../../src/routes/auth.js' }
  );
});

afterAll(async () => {
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* best effort */ }
  }
  // Clean up any test users created via registration
  try {
    const users = await query("SELECT id FROM users WHERE email LIKE '%@authtest.borrowhood.test'");
    for (const row of users.rows) {
      await cleanupTestUser(row.id);
    }
  } catch (e) { /* best effort */ }
});

describe('POST /api/auth/register', () => {
  it('requires a verification-capable client and creates no account for older builds', async () => {
    const email = `old-client-${Date.now()}@authtest.borrowhood.test`;
    const res = await request(app).post('/api/auth/register').send({ email, password: 'Password123!', firstName: 'Old', lastName: 'Client' });
    expect(res.status).toBe(426);
    expect(res.body.code).toBe('UPDATE_REQUIRED');
    expect((await query('SELECT id FROM users WHERE email=$1', [email])).rows).toHaveLength(0);
  });
  it('does not allow signing in before confirmation and accepts the email code only once', async () => {
    const email = `pending-${Date.now()}@authtest.borrowhood.test`;
    const data = { email, password: 'Password123!', firstName: 'Pending', lastName: 'Neighbor', verificationFlow: 'email-code-v1' };
    const pending = await request(app).post('/api/auth/register').send(data);
    expect(pending.status).toBe(202);
    expect(pending.body.accessToken).toBeUndefined();
    expect((await request(app).post('/api/auth/login').send(data)).status).toBe(401);
    const code = sendSignupCodeEmail.mock.calls.filter(([recipient])=>recipient===email).at(-1)[1];
    const invalid = await request(app).post('/api/auth/register/verify').send({ challengeId: pending.body.challengeId, code: '000000' });
    expect(invalid.status).toBe(400);
    const verified = await request(app).post('/api/auth/register/verify').send({ challengeId: pending.body.challengeId, code });
    expect(verified.status).toBe(201);
    createdUserIds.push(verified.body.user.id);
    expect((await request(app).post('/api/auth/register/verify').send({ challengeId: pending.body.challengeId, code })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send(data)).status).toBe(200);
  });
  it('should register a new user and return 201 with tokens', async () => {
    const email = `register-${Date.now()}@authtest.borrowhood.test`;
    const res = await registerAndVerify({
        email,
        password: 'TestPass123!',
        firstName: 'Auth',
        lastName: 'Tester',
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.firstName).toBe('Auth');
    expect(res.body.user.status).toBe('pending');
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    // Verify DB state
    const dbUser = await query('SELECT subscription_tier, referral_code FROM users WHERE email = $1', [email]);
    expect(dbUser.rows[0].subscription_tier).toBe('free');
    expect(dbUser.rows[0].referral_code).toBeTruthy();

    createdUserIds.push(res.body.user.id);
  });

  it('should reject duplicate email with 409', async () => {
    const email = `dup-${Date.now()}@authtest.borrowhood.test`;
    // Register first
    const first = await registerAndVerify({ email, password: 'TestPass123!', firstName: 'Dup', lastName: 'User' });
    createdUserIds.push(first.body.user.id);

    // Register again with same email
    const res = await registerAndVerify({ email, password: 'DifferentPass1!', firstName: 'Dup', lastName: 'Two' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already registered');
  });

  it('should reject password shorter than 8 characters', async () => {
    const res = await registerAndVerify({
        email: `short-${Date.now()}@authtest.borrowhood.test`,
        password: 'short',
        firstName: 'Short',
        lastName: 'Pass',
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('should reject invalid email format', async () => {
    const res = await registerAndVerify({
        email: 'not-an-email',
        password: 'TestPass123!',
        firstName: 'Bad',
        lastName: 'Email',
      });

    expect(res.status).toBe(400);
  });

  it('should reject missing firstName', async () => {
    const res = await registerAndVerify({
        email: `nofn-${Date.now()}@authtest.borrowhood.test`,
        password: 'TestPass123!',
        lastName: 'User',
      });

    expect(res.status).toBe(400);
  });

  it('should track referral when referralCode is provided', async () => {
    // Create a referrer
    const referrer = await createTestUser({ email: `referrer-${Date.now()}@authtest.borrowhood.test` });
    createdUserIds.push(referrer.userId);

    // Set their referral code
    const code = `BH-T${Date.now().toString(36).toUpperCase()}`;
    await query('UPDATE users SET referral_code = $1 WHERE id = $2', [code, referrer.userId]);

    // Register with referral code
    const res = await registerAndVerify({
        email: `referred-${Date.now()}@authtest.borrowhood.test`,
        password: 'TestPass123!',
        firstName: 'Referred',
        lastName: 'User',
        referralCode: code,
      });

    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id);

    // Verify referred_by was set
    const dbUser = await query('SELECT referred_by FROM users WHERE id = $1', [res.body.user.id]);
    expect(dbUser.rows[0].referred_by).toBe(referrer.userId);
  });
});

describe('POST /api/auth/login', () => {
  let loginEmail;

  beforeAll(async () => {
    loginEmail = `login-${Date.now()}@authtest.borrowhood.test`;
    const res = await registerAndVerify({
        email: loginEmail,
        password: 'LoginPass123!',
        firstName: 'Login',
        lastName: 'Tester',
      });
    createdUserIds.push(res.body.user.id);
  });

  it('should login with valid credentials and return 200 with tokens', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: loginEmail, password: 'LoginPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(loginEmail);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('should reject wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: loginEmail, password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Incorrect password');
  });

  it('should reject non-existent email with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@nobody.test', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('No account found');
  });

  it('should reject suspended user with 403', async () => {
    const suspended = await createTestUser({
      email: `suspended-${Date.now()}@authtest.borrowhood.test`,
      status: 'suspended',
    });
    createdUserIds.push(suspended.userId);

    // Set a real password hash so login can find the user
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('SuspendedPass1!', 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, suspended.userId]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: suspended.email, password: 'SuspendedPass1!' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('suspended');
  });
});

describe('GET /api/auth/me', () => {
  it('should return current user profile with valid token', async () => {
    const user = await createTestUser({ email: `me-${Date.now()}@authtest.borrowhood.test` });
    createdUserIds.push(user.userId);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.userId);
    expect(res.body.email).toBe(user.email);
    expect(res.body.subscriptionTier).toBe('free');
    expect(res.body.isVerified).toBe(false);
    expect(res.body.onboardingCompleted).toBe(false);
  });

  it('should reject missing token with 401', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('No token');
  });

  it('should reject expired token with 401', async () => {
    const user = await createTestUser({ email: `expired-${Date.now()}@authtest.borrowhood.test` });
    createdUserIds.push(user.userId);

    const expiredToken = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, { expiresIn: '0s' });
    // Wait a moment for token to expire
    await new Promise(r => setTimeout(r, 1100));

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  it('should reject invalid token with 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalidtoken123');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('should return 200 for existing email (no leak)', async () => {
    const user = await createTestUser({ email: `forgot-${Date.now()}@authtest.borrowhood.test` });
    createdUserIds.push(user.userId);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('reset code');

    // Verify token was stored in DB
    const dbUser = await query('SELECT reset_code_hash, reset_code_expires FROM users WHERE id = $1', [user.userId]);
    expect(dbUser.rows[0].reset_code_hash).toBeTruthy();
    expect(dbUser.rows[0].reset_code_expires).toBeTruthy();
  });

  it('should return 200 for unknown email (no leak)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody-exists@nowhere.test' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('reset code');
  });
});

describe('POST /api/auth/reset-password', () => {
  it('should reset password with valid code', async () => {
    const email = `reset-${Date.now()}@authtest.borrowhood.test`;
    const regRes = await registerAndVerify({ email, password: 'OldPass123!', firstName: 'Reset', lastName: 'User' });
    createdUserIds.push(regRes.body.user.id);

    // Request reset
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });

    const code = sendResetCodeEmail.mock.calls.find(([recipient]) => recipient === email)[1];
    const verified = await request(app).post('/api/auth/verify-reset-code').send({ email, code });
    expect(verified.status).toBe(200);
    const resetToken = verified.body.resetToken;

    // Reset password
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ resetToken, newPassword: 'NewPass456!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('reset successfully');

    // Verify new password works
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'NewPass456!' });
    expect(loginRes.status).toBe(200);
    const reused = await request(app).post('/api/auth/reset-password').send({ resetToken, newPassword: 'AnotherPass789!' });
    expect(reused.status).toBe(400);
  });

  it('should reject invalid code with 400', async () => {
    const email = `badcode-${Date.now()}@authtest.borrowhood.test`;
    const regRes = await registerAndVerify({ email, password: 'TestPass123!', firstName: 'Bad', lastName: 'Code' });
    createdUserIds.push(regRes.body.user.id);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ resetToken: 'not-a-valid-token', newPassword: 'NewPass456!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid or expired');
  });

  it('should reject expired code', async () => {
    const email = `expcode-${Date.now()}@authtest.borrowhood.test`;
    const regRes = await registerAndVerify({ email, password: 'TestPass123!', firstName: 'Exp', lastName: 'Code' });
    createdUserIds.push(regRes.body.user.id);

    // Set expired token directly
    await query(
      `UPDATE users SET reset_token_hash = $2, reset_token_expires = NOW() - INTERVAL '1 hour' WHERE email = $1`,
      [email, crypto.createHash('sha256').update('expired-token').digest('hex')]
    );

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ resetToken: 'expired-token', newPassword: 'NewPass456!' });

    expect(res.status).toBe(400);
  });
});

describe('Admin endpoints', () => {
  it('POST /admin/reset-user should reject without secret', async () => {
    const res = await request(app)
      .post('/api/auth/admin/reset-user')
      .send({ email: 'anyone@test.com' });

    expect(res.status, res.body.error).toBe(403);
  });

  it('POST /admin/reset-user should work with correct secret', async () => {
    const user = await createTestUser({ email: `adminreset-${Date.now()}@authtest.borrowhood.test` });
    createdUserIds.push(user.userId);

    const res = await request(app)
      .post('/api/auth/admin/reset-user')
      .send({ email: user.email, secret: process.env.ADMIN_SECRET });

    expect(res.status, res.body.error).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify user was reset
    const dbUser = await query('SELECT subscription_tier, status FROM users WHERE id = $1', [user.userId]);
    expect(dbUser.rows[0].subscription_tier).toBe('free');
    expect(dbUser.rows[0].status).toBe('pending');
  });

  it('POST /admin/reset-user should return 404 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/admin/reset-user')
      .send({ email: 'no-such-user@test.com', secret: process.env.ADMIN_SECRET });

    expect(res.status, res.body.error).toBe(404);
  });

  it('POST /admin/reset-onboarding should reject without secret', async () => {
    const res = await request(app)
      .post('/api/auth/admin/reset-onboarding')
      .send({ email: 'anyone@test.com' });

    expect(res.status, res.body.error).toBe(403);
  });

  it('POST /admin/reset-verifications should reject without secret', async () => {
    const res = await request(app)
      .post('/api/auth/admin/reset-verifications')
      .send({});

    expect(res.status, res.body.error).toBe(403);
  });
});
