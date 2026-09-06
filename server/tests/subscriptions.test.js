// Current free-launch contract; retired recurring checkout is not expected.
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, cleanupTestUser } from './helpers/stripe.js';
let app, member;
beforeAll(async () => {
  app = await createTestApp({ path: '/api/subscriptions', module: '../../src/routes/subscriptions.js' });
  member = await createTestUser({ email: 'subscription-contract@borrowhood.test' });
});
afterAll(async () => { if (member) await cleanupTestUser(member.userId); });
const get = path => request(app).get('/api/subscriptions' + path).set('Authorization', `Bearer ${member.token}`);
describe('Free launch and retained subscription history', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/subscriptions/current')).status).toBe(401);
  });
  it('does not invent an active paid subscription for a free member', async () => {
    const res = await get('/current');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tier: 'free', priceCents: 0, isActive: false });
  });
  it('keeps the legacy free and one-time verification tier metadata readable', async () => {
    const res = await get('/tiers');
    expect(res.status).toBe(200);
    expect(res.body.find(t => t.tier === 'free')).toMatchObject({ priceCents: 0 });
    expect(res.body.find(t => t.tier === 'plus')).toMatchObject({ priceCents: 199, priceDisplay: '$1.99 one-time' });
  });
  it('allows friends without a paid plan', async () => {
    expect((await get('/access-check?feature=friends')).body).toMatchObject({ canAccess: true, upgradeRequired: false });
  });
  it.each(['town','rentals'])('requires identity, not a subscription, for legacy %s access', async feature => {
    const res = await get('/access-check?feature=' + feature);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ canAccess: false, nextStep: 'identity', upgradeRequired: false, isSubscribed: true });
  });
  it('unlocks town for a verified free member', async () => {
    await query('UPDATE users SET is_verified=true WHERE id=$1', [member.userId]);
    expect((await get('/access-check?feature=town')).body).toMatchObject({ canAccess: true, nextStep: null, upgradeRequired: false });
  });
  it('blocks verification payment initiation while payments are disabled', async () => {
    const res = await request(app).post('/api/subscriptions/verify-payment').set('Authorization', `Bearer ${member.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAYMENTS_DISABLED');
  });
  it.each(['subscribe','cancel'])('does not restore removed recurring %s routes', async endpoint => {
    expect((await request(app).post('/api/subscriptions/' + endpoint).set('Authorization', `Bearer ${member.token}`)).status).toBe(404);
  });
});
