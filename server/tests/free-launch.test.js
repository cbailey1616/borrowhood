import { mergeMessages } from '../../mobile/src/utils/chatMessages.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../src/utils/constants.js', () => ({ ENABLE_PAYMENTS: false, REQUIRE_IDENTITY_VERIFICATION: false, PLATFORM_FEE_PERCENT: 0.03 }));
vi.mock('../src/utils/db.js', () => ({ query: vi.fn() }));
vi.mock('../src/middleware/auth.js', async (importOriginal) => ({
  requireAdmin: (await importOriginal()).requireAdmin,
  ENABLE_PAID_TIERS: false,
  authenticate: (req, res, next) => { req.user = { id: 'borrower', first_name: 'Chris', is_admin: req.headers['x-test-admin'] === 'true' }; next(); },
  requireVerified: (req, res, next) => next(),
}));
vi.mock('../src/services/notifications.js', () => ({ sendNotification: vi.fn() }));
vi.mock('../src/services/imageAnalysis.js', () => ({ analyzeItemImage: vi.fn() }));
vi.mock('../src/services/stripe.js', () => ({
  stripe: { customers: { create: vi.fn() }, identity: { verificationSessions: { create: vi.fn() } }, ephemeralKeys: { create: vi.fn().mockResolvedValue({ secret: 'ephemeral' }) } },
  createStripeCustomer: vi.fn(), createIdentityVerificationSession: vi.fn(), getIdentityVerificationSession: vi.fn(), createPaymentIntent: vi.fn(), getPaymentIntent: vi.fn(),
  capturePaymentIntent: vi.fn(), cancelPaymentIntent: vi.fn(), createEphemeralKey: vi.fn(), refundPayment: vi.fn(),
}));
import { query } from '../src/utils/db.js';
import { createPaymentIntent, stripe, getIdentityVerificationSession } from '../src/services/stripe.js';
import { freeListingOnly, requirePaymentsEnabled } from '../src/middleware/freeLaunch.js';
import transactions from '../src/routes/transactions.js';
import listings from '../src/routes/listings.js';
import identity from '../src/routes/identity.js';
import insights from '../src/routes/insights.js';
import { borrowGuidance } from '../../mobile/src/utils/borrowStatus.js';

const app = express(); app.use(express.json());
app.use('/insights', insights); app.use('/identity', identity); app.use('/transactions', transactions); app.use('/listings', listings);
app.post('/charge', requirePaymentsEnabled, (req, res) => res.sendStatus(204));
app.post('/validate-listing', freeListingOnly, (req, res) => res.sendStatus(204));
const listingId = '6f9028a4-5105-4aa6-b62a-9f4465b966b8';
const freeItem = { id: listingId, owner_id: 'owner', is_free: true, price_per_day: null,
  deposit_amount: 0, listing_type: 'lend', visibility: 'town', lender_city: 'Upton',
  is_available: true, min_duration: 1, max_duration: 14, title: 'Drill' };
const borrow = () => request(app).post('/transactions').send({ listingId, startDate: '2026-10-01', endDate: '2026-10-03' });
beforeEach(() => vi.clearAllMocks());
describe('free launch', () => {
  it('blocks payment initiation', async () => { expect((await request(app).post('/charge')).status).toBe(403); });
  it.each([{ isFree: false }, { pricePerDay: 5 }, { depositAmount: 10 }, { is_free: false }, { deposit_amount: '10' }])('rejects paid listing fields %j', async body => {
    expect((await request(app).post('/validate-listing').send(body)).status).toBe(400);
  });
  it('allows free listing fields', async () => {
    expect((await request(app).post('/validate-listing').send({ isFree: true, pricePerDay: null, depositAmount: 0 })).status).toBe(204);
  });
  it.each([{ price_per_day: 5 }, { deposit_amount: 10 }, { is_free: false }])('does not convert an existing paid item without owner consent: %j', async override => {
    query.mockResolvedValueOnce({ rows: [{ ...freeItem, ...override }] });
    const response = await borrow(); expect(response.status).toBe(409);
    expect(query).toHaveBeenCalledTimes(1); expect(createPaymentIntent).not.toHaveBeenCalled();
  });
  it('allows an unverified neighbor to request a free town item without Stripe', async () => {
    query.mockResolvedValueOnce({ rows: [freeItem] })
      .mockResolvedValueOnce({ rows: [{ city: 'Upton', is_verified: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'transaction' }] });
    const response = await borrow(); expect(response.status).toBe(201);
    expect(response.body.freeRental).toBe(true); expect(response.body.clientSecret).toBeUndefined();
    expect(createPaymentIntent).not.toHaveBeenCalled();
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO borrow_transactions'));
    expect(insert[1].slice(6, 12)).toEqual([0, 0, 0, 0, 0, undefined]);
  });
  it('retains the town boundary for borrowing', async () => {
    query.mockResolvedValueOnce({ rows: [freeItem] }).mockResolvedValueOnce({ rows: [{ city: 'Boston' }] });
    expect((await borrow()).body.code).toBe('TOWN_MISMATCH');
  });
  it('town listing detail has no address, coordinates, or verification paywall', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...freeItem, owner_city: 'Upton', owner_status: 'active', address_line1: 'PRIVATE', latitude: 42, longitude: -71 }] })
      .mockResolvedValueOnce({ rows: [{ city: 'Upton', is_verified: false }] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const response = await request(app).get('/listings/' + listingId);
    expect(response.status).toBe(200); expect(response.body.ownerMasked).toBeFalsy();
    expect(response.body.owner.isVerified).toBe(false);
    expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|latitude|longitude|address_line1/);
  });
});

 it('optional verification resumes an unfinished session without a payment', async () => {
    query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_existing', is_verified: false, stripe_identity_session_id: 'vs_existing' }] }).mockResolvedValueOnce({ rows: [] });
    getIdentityVerificationSession.mockResolvedValueOnce({ id: 'vs_existing', status: 'requires_input', client_secret: 'session-secret' });
    const response = await request(app).post('/identity/verify');
    expect(response.status).toBe(200); expect(response.body.sessionId).toBe('vs_existing');
    expect(stripe.identity.verificationSessions.create).not.toHaveBeenCalled();
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });

describe('first-borrow improvements', () => {
  it('restricts aggregate insights to administrators', async () => {
    expect((await request(app).get('/insights/funnel')).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects unbounded reporting periods', async () => {
    expect((await request(app).get('/insights/funnel?days=9999').set('x-test-admin', 'true')).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('reports cohorts without inventing rates for empty denominators', async () => {
    query.mockResolvedValueOnce({ rows: [{ signups: 0, onboarded: 0, first_listers: 0, first_requesters: 0, requests: 0, accepted: 0, returned: 0 }] });
    const result = await request(app).get('/insights/funnel').set('x-test-admin', 'true');
    expect(result.status).toBe(200); expect(result.body.acceptanceRate).toBeNull();
    expect(result.body.onboardingRate).toBeNull();
    expect(query.mock.calls[0][1]).toEqual([30]);
  });
  it('calculates acceptance and signup completion from their own denominators', async () => {
    query.mockResolvedValueOnce({ rows: [{ signups: 10, onboarded: 8, first_listers: 4, first_requesters: 5, requests: 20, accepted: 15, returned: 9 }] });
    const result = await request(app).get('/insights/funnel').set('x-test-admin', 'true');
    expect(result.body.onboardingRate).toBe(80); expect(result.body.acceptanceRate).toBe(75); expect(result.body.returnRate).toBe(60);
  });
  it('gives each side appropriate pending-request guidance', () => {
    expect(borrowGuidance({ status: 'pending', isBorrower: true }).title).toBe('Waiting for the owner');
    expect(borrowGuidance({ status: 'pending', isBorrower: false }).title).toBe('Review this request');
  });
  it('does not describe a pending return as completed', () => {
    expect(borrowGuidance({ status: 'return_pending' }).detail).toContain('awaiting confirmation');
  });
  it('does not ask for a giveaway back after pickup', () => {
    expect(borrowGuidance({ status: 'picked_up', isGiveaway: true }).title).toBe('Pickup confirmed');
  });
  it('prioritizes an active dispute over a completed-looking status', () => {
    expect(borrowGuidance({ status: 'returned', hasDispute: true }).title).toBe('An issue is being reviewed');
  });
});

describe('chat refresh reconciliation', () => {
  const first = { id: 'a', content: 'Hello', createdAt: '2026-09-05T12:00:00Z', isRead: false };
  const sent = { id: 'b', content: 'Pickup at noon?', createdAt: '2026-09-05T12:01:00Z' };
  it('retains a send acknowledged after a poll began', () => {
    expect(mergeMessages([first, sent], [first]).map(m => m.id)).toEqual(['a', 'b']);
  });
  it('deduplicates sends that arrive again in the server snapshot', () => {
    expect(mergeMessages([first, sent], [first, sent])).toHaveLength(2);
  });
  it('applies read receipts and deletions without changing chronological order', () => {
    const result = mergeMessages([sent, first], [{ ...first, isRead: true, isDeleted: true }]);
    expect(result[0]).toMatchObject({ id: 'a', isRead: true, isDeleted: true });
    expect(result[1].id).toBe('b');
  });
});
