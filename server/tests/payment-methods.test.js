// Retained card history uses a deterministic Stripe adapter. New cards stay disabled.
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/services/stripe.js', async original => ({
  ...await original(),
  createSetupIntent: vi.fn(), listPaymentMethods: vi.fn(), detachPaymentMethod: vi.fn(),
  stripe: { customers: { retrieve: vi.fn(), update: vi.fn(), create: vi.fn() } },
}));
import { stripe, listPaymentMethods, createSetupIntent, detachPaymentMethod } from '../src/services/stripe.js';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp } from './helpers/stripe.js';
let app, withCard, withoutCard;
beforeAll(async () => {
  app = await createTestApp({ path: '/api/payment-methods', module: '../../src/routes/paymentMethods.js' });
  withCard = await createTestUser({ email: 'card-history@borrowhood.test' });
  withoutCard = await createTestUser({ email: 'no-card-history@borrowhood.test' });
  await query("UPDATE users SET stripe_customer_id='cus_history' WHERE id=$1", [withCard.userId]);
});
beforeEach(() => {
  vi.clearAllMocks();
  listPaymentMethods.mockResolvedValue({ data: [{ id: 'pm_history', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } }] });
  stripe.customers.retrieve.mockResolvedValue({ invoice_settings: { default_payment_method: 'pm_history' } });
});
afterAll(async () => { await query('DELETE FROM users WHERE id=ANY($1)', [[withCard.userId,withoutCard.userId]]); });
describe('Card history without new payments', () => {
  it('requires authentication', async () => { expect((await request(app).get('/api/payment-methods')).status).toBe(401); });
  it('returns only the signed-in member’s masked card history', async () => {
    const res = await request(app).get('/api/payment-methods').set('Authorization', `Bearer ${withCard.token}`);
    expect(res.status).toBe(200);
    expect(listPaymentMethods).toHaveBeenCalledWith('cus_history');
    expect(res.body).toEqual([{ id: 'pm_history', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, isDefault: true }]);
  });
  it('does not contact Stripe for an account without payment history', async () => {
    const res = await request(app).get('/api/payment-methods').set('Authorization', `Bearer ${withoutCard.token}`);
    expect(res.body).toEqual([]);
    expect(listPaymentMethods).not.toHaveBeenCalled();
  });
  it.each(['withCard','withoutCard'])('blocks new card setup for %s', async kind => {
    const user = { withCard,withoutCard }[kind];
    const res = await request(app).post('/api/payment-methods').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAYMENTS_DISABLED');
    expect(createSetupIntent).not.toHaveBeenCalled();
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });
  it('returns a retryable error when the history provider is unavailable', async () => {
    listPaymentMethods.mockRejectedValueOnce(new Error('Sandbox provider unavailable'));
    const res = await request(app).get('/api/payment-methods').set('Authorization', `Bearer ${withCard.token}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list payment methods');
  });
});
