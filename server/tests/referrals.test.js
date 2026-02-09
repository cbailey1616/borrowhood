/**
 * Referrals Route Tests
 * Tests: get code, status, claim reward
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, cleanupTestUser } from './helpers/stripe.js';

let app;
let referrer, referred1, referred2, referred3;
let userWithNoReferrals;
let referralCode;
const createdUserIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/referrals', module: '../../src/routes/referrals.js' }
  );

  referrer = await createTestUser({ email: `ref-main-${Date.now()}@borrowhood.test`, firstName: 'Ref', lastName: 'Main' });
  userWithNoReferrals = await createTestUser({ email: `ref-none-${Date.now()}@borrowhood.test` });
  createdUserIds.push(referrer.userId, userWithNoReferrals.userId);

  // Set referral code
  referralCode = `BH-RT${Date.now().toString(36).toUpperCase()}`;
  await query('UPDATE users SET referral_code = $1 WHERE id = $2', [referralCode, referrer.userId]);

  // Create 3 referred users
  referred1 = await createTestUser({ email: `ref-1-${Date.now()}@borrowhood.test`, firstName: 'Friend', lastName: 'One' });
  referred2 = await createTestUser({ email: `ref-2-${Date.now()}@borrowhood.test`, firstName: 'Friend', lastName: 'Two' });
  referred3 = await createTestUser({ email: `ref-3-${Date.now()}@borrowhood.test`, firstName: 'Friend', lastName: 'Three' });
  createdUserIds.push(referred1.userId, referred2.userId, referred3.userId);

  // Link referred users
  await query('UPDATE users SET referred_by = $1 WHERE id = $2', [referrer.userId, referred1.userId]);
  await query('UPDATE users SET referred_by = $1 WHERE id = $2', [referrer.userId, referred2.userId]);
  await query('UPDATE users SET referred_by = $1 WHERE id = $2', [referrer.userId, referred3.userId]);
});

afterAll(async () => {
  try {
    await query('DELETE FROM notifications WHERE user_id = ANY($1)', [createdUserIds]);
  } catch (e) { /* */ }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('GET /api/referrals/code', () => {
  it('should return user\'s referral code', async () => {
    const res = await request(app)
      .get('/api/referrals/code')
      .set('Authorization', `Bearer ${referrer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.referralCode).toBe(referralCode);
  });

  it('should generate code if none exists', async () => {
    const res = await request(app)
      .get('/api/referrals/code')
      .set('Authorization', `Bearer ${userWithNoReferrals.token}`);

    expect(res.status).toBe(200);
    expect(res.body.referralCode).toBeTruthy();
    expect(res.body.referralCode).toMatch(/^BH-/);
  });
});

describe('GET /api/referrals/status', () => {
  it('should return referral count and progress', async () => {
    const res = await request(app)
      .get('/api/referrals/status')
      .set('Authorization', `Bearer ${referrer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.referralCount).toBe(3);
    expect(res.body.target).toBe(3);
    expect(res.body.eligible).toBe(true);
    expect(res.body.rewardClaimed).toBe(false);
    expect(res.body.referredFriends).toBeDefined();
    expect(res.body.referredFriends.length).toBe(3);
  });

  it('should show 0 referrals for user with none', async () => {
    const res = await request(app)
      .get('/api/referrals/status')
      .set('Authorization', `Bearer ${userWithNoReferrals.token}`);

    expect(res.status).toBe(200);
    expect(res.body.referralCount).toBe(0);
    expect(res.body.eligible).toBe(false);
  });
});

describe('POST /api/referrals/claim', () => {
  it('should reject claim with insufficient referrals', async () => {
    const res = await request(app)
      .post('/api/referrals/claim')
      .set('Authorization', `Bearer ${userWithNoReferrals.token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('more referral');
  });

  it('should grant free Plus for 1 year with 3+ referrals', async () => {
    const res = await request(app)
      .post('/api/referrals/claim')
      .set('Authorization', `Bearer ${referrer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.expiresAt).toBeDefined();

    // Verify user is now Plus
    const user = await query(
      'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
      [referrer.userId]
    );
    expect(user.rows[0].subscription_tier).toBe('plus');
    expect(user.rows[0].subscription_expires_at).toBeTruthy();
  });

  it('should reject double claim', async () => {
    const res = await request(app)
      .post('/api/referrals/claim')
      .set('Authorization', `Bearer ${referrer.token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already claimed');
  });
});
