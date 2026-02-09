/**
 * Auth Route Tests
 * Tests: register, login, forgot/reset password, GET /me, admin endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, cleanupTestUser } from './helpers/stripe.js';

let app;
const createdUserIds = [];

beforeAll(async () => {
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
  it('should register a new user and return 201 with tokens', async () => {
    const email = `register-${Date.now()}@authtest.borrowhood.test`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
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

  it('should reject duplicate email with 400', async () => {
    const email = `dup-${Date.now()}@authtest.borrowhood.test`;
    // Register first
    const first = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'TestPass123!', firstName: 'Dup', lastName: 'User' });
    createdUserIds.push(first.body.user.id);

    // Register again with same email
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'DifferentPass1!', firstName: 'Dup', lastName: 'Two' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already registered');
  });

  it('should reject password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `short-${Date.now()}@authtest.borrowhood.test`,
        password: 'short',
        firstName: 'Short',
        lastName: 'Pass',
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('should reject invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'not-an-email',
        password: 'TestPass123!',
        firstName: 'Bad',
        lastName: 'Email',
      });

    expect(res.status).toBe(400);
  });

  it('should reject missing firstName', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
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
    const res = await request(app)
      .post('/api/auth/register')
      .send({
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
    const res = await request(app)
      .post('/api/auth/register')
      .send({
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
    const dbUser = await query('SELECT password_reset_token, password_reset_expires FROM users WHERE id = $1', [user.userId]);
    expect(dbUser.rows[0].password_reset_token).toBeTruthy();
    expect(dbUser.rows[0].password_reset_expires).toBeTruthy();
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
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'OldPass123!', firstName: 'Reset', lastName: 'User' });
    createdUserIds.push(regRes.body.user.id);

    // Request reset
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });

    // Get the code from DB
    const dbUser = await query('SELECT password_reset_token FROM users WHERE email = $1', [email]);
    const code = dbUser.rows[0].password_reset_token;

    // Reset password
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, code, newPassword: 'NewPass456!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('reset successfully');

    // Verify new password works
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'NewPass456!' });
    expect(loginRes.status).toBe(200);
  });

  it('should reject invalid code with 400', async () => {
    const email = `badcode-${Date.now()}@authtest.borrowhood.test`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'TestPass123!', firstName: 'Bad', lastName: 'Code' });
    createdUserIds.push(regRes.body.user.id);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, code: '000000', newPassword: 'NewPass456!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid or expired');
  });

  it('should reject expired code', async () => {
    const email = `expcode-${Date.now()}@authtest.borrowhood.test`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'TestPass123!', firstName: 'Exp', lastName: 'Code' });
    createdUserIds.push(regRes.body.user.id);

    // Set expired token directly
    await query(
      `UPDATE users SET password_reset_token = '123456', password_reset_expires = NOW() - INTERVAL '1 hour' WHERE email = $1`,
      [email]
    );

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, code: '123456', newPassword: 'NewPass456!' });

    expect(res.status).toBe(400);
  });
});

describe('Admin endpoints', () => {
  it('POST /admin/reset-user should reject without secret', async () => {
    const res = await request(app)
      .post('/api/auth/admin/reset-user')
      .send({ email: 'anyone@test.com' });

    expect(res.status).toBe(403);
  });

  it('POST /admin/reset-user should work with correct secret', async () => {
    const user = await createTestUser({ email: `adminreset-${Date.now()}@authtest.borrowhood.test` });
    createdUserIds.push(user.userId);

    const res = await request(app)
      .post('/api/auth/admin/reset-user')
      .send({ email: user.email, secret: process.env.ADMIN_SECRET });

    expect(res.status).toBe(200);
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

    expect(res.status).toBe(404);
  });

  it('POST /admin/reset-onboarding should reject without secret', async () => {
    const res = await request(app)
      .post('/api/auth/admin/reset-onboarding')
      .send({ email: 'anyone@test.com' });

    expect(res.status).toBe(403);
  });

  it('POST /admin/reset-verifications should reject without secret', async () => {
    const res = await request(app)
      .post('/api/auth/admin/reset-verifications')
      .send({});

    expect(res.status).toBe(403);
  });
});
