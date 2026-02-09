/**
 * Payment Methods Route Tests
 * Tests: list, create SetupIntent, set default, detach
 * Uses real Stripe test API.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import {
  createTestUser,
  createTestCustomer,
  attachTestPaymentMethod,
  createTestApp,
  cleanupTestUser,
} from './helpers/stripe.js';

let app;
let userWithCard, userNoCard, userNoStripe;
let customerId, paymentMethodId;
const createdUserIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/payment-methods', module: '../../src/routes/paymentMethods.js' }
  );

  // User with Stripe customer and payment method
  userWithCard = await createTestUser({ email: `pm-card-${Date.now()}@borrowhood.test` });
  const customer = await createTestCustomer(userWithCard.userId, userWithCard.email);
  customerId = customer.id;
  const pm = await attachTestPaymentMethod(customerId);
  paymentMethodId = pm.id;
  createdUserIds.push(userWithCard.userId);

  // User without payment methods
  userNoCard = await createTestUser({ email: `pm-nocard-${Date.now()}@borrowhood.test` });
  await createTestCustomer(userNoCard.userId, userNoCard.email);
  createdUserIds.push(userNoCard.userId);

  // User without Stripe customer at all
  userNoStripe = await createTestUser({ email: `pm-nostripe-${Date.now()}@borrowhood.test` });
  createdUserIds.push(userNoStripe.userId);
});

afterAll(async () => {
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('GET /api/payment-methods', () => {
  it('should list saved cards with default indicator', async () => {
    const res = await request(app)
      .get('/api/payment-methods')
      .set('Authorization', `Bearer ${userWithCard.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const card = res.body[0];
    expect(card.id).toBeDefined();
    expect(card.brand).toBe('visa');
    expect(card.last4).toBe('4242');
    expect(card.expMonth).toBeDefined();
    expect(card.expYear).toBeDefined();
    expect(card.isDefault).toBe(true);
  });

  it('should return empty array for user with no cards', async () => {
    const res = await request(app)
      .get('/api/payment-methods')
      .set('Authorization', `Bearer ${userNoCard.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should return empty array for user with no Stripe customer', async () => {
    const res = await request(app)
      .get('/api/payment-methods')
      .set('Authorization', `Bearer ${userNoStripe.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/payment-methods', () => {
  it('should return SetupIntent client secret', async () => {
    const res = await request(app)
      .post('/api/payment-methods')
      .set('Authorization', `Bearer ${userWithCard.token}`);

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBeDefined();
    expect(res.body.clientSecret).toMatch(/^seti_/);
  });

  it('should auto-create Stripe customer if none exists', async () => {
    const res = await request(app)
      .post('/api/payment-methods')
      .set('Authorization', `Bearer ${userNoStripe.token}`);

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBeDefined();

    // Verify customer was created in DB
    const user = await query('SELECT stripe_customer_id FROM users WHERE id = $1', [userNoStripe.userId]);
    expect(user.rows[0].stripe_customer_id).toBeTruthy();
    expect(user.rows[0].stripe_customer_id).toMatch(/^cus_/);
  });
});

describe('POST /api/payment-methods/:id/default', () => {
  it('should set default payment method', async () => {
    const res = await request(app)
      .post(`/api/payment-methods/${paymentMethodId}/default`)
      .set('Authorization', `Bearer ${userWithCard.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject for user with no Stripe customer', async () => {
    // userNoStripe now has a customer from the POST test, so use a new user
    const newUser = await createTestUser({ email: `pm-new-${Date.now()}@borrowhood.test` });
    createdUserIds.push(newUser.userId);

    const res = await request(app)
      .post(`/api/payment-methods/${paymentMethodId}/default`)
      .set('Authorization', `Bearer ${newUser.token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No Stripe customer');
  });
});

describe('DELETE /api/payment-methods/:id', () => {
  it('should detach a payment method', async () => {
    // Attach a second card to detach
    const pm2 = await attachTestPaymentMethod(customerId);

    const res = await request(app)
      .delete(`/api/payment-methods/${pm2.id}`)
      .set('Authorization', `Bearer ${userWithCard.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
