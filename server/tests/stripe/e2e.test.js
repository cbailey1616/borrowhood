/**
 * End-to-End Flow Tests — Real Stripe Test API
 *
 * 6 complete user flows exercising the full Stripe integration:
 * 1. Town access unlock (subscribe → verify → access)
 * 2. Rental listing unlock (subscribe → verify → connect → list)
 * 3. Full rental lifecycle (request → approve → pay → pickup → return)
 * 4. Rental with damage claim
 * 5. Late rental with fee
 * 6. Cross-path unlock (town first, then rental)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createTestUser,
  createTestCustomer,
  attachTestPaymentMethod,
  createTestListing,
  createTestConnectAccount,
  createTestApp,
  cleanupTestUser,
  buildWebhookPayload,
  signWebhookPayload,
  stripe,
} from '../helpers/stripe.js';
import { query } from '../../src/utils/db.js';

describe('E2E Flows', () => {
  let app;
  const createdUsers = [];

  beforeAll(async () => {
    app = await createTestApp(
      { path: '/api/subscriptions', module: '../../src/routes/subscriptions.js' },
      { path: '/api/identity', module: '../../src/routes/identity.js' },
      { path: '/api/payments', module: '../../src/routes/payments.js' },
      { path: '/api/rentals', module: '../../src/routes/rentals.js' },
      { path: '/api/users', module: '../../src/routes/users.js' },
      { path: '/webhooks', module: '../../src/routes/webhooks.js' },
    );
  });

  afterAll(async () => {
    for (const userId of createdUsers) {
      try { await cleanupTestUser(userId); } catch (e) { /* best effort */ }
    }
  });

  /** Helper: simulate webhook delivery */
  async function fireWebhook(eventType, data, eventId) {
    const payload = buildWebhookPayload(eventType, data, eventId);
    const payloadStr = JSON.stringify(payload);
    const signature = signWebhookPayload(payloadStr, process.env.STRIPE_WEBHOOK_SECRET);

    return request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payloadStr);
  }

  /** Helper: create a full user with Stripe customer + payment method */
  async function createFullUser(overrides = {}) {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const user = await createTestUser({
      email: `e2e-${suffix}@borrowhood.test`,
      ...overrides,
    });
    const customer = await createTestCustomer(user.userId, user.email);
    await attachTestPaymentMethod(customer.id);
    user.customerId = customer.id;
    createdUsers.push(user.userId);
    return user;
  }

  // ===========================================
  // Flow 1: Town Access Unlock
  // Free user → subscribe → verify → can access town
  // ===========================================
  describe('Flow 1: Town Access Unlock', () => {
    let user;

    it('should start as free with no town access', async () => {
      user = await createFullUser({ subscriptionTier: 'free', isVerified: false });

      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.body.canAccess).toBe(false);
      expect(res.body.nextStep).toBe('subscription');
    });

    it('should subscribe and get PaymentSheet credentials', async () => {
      const res = await request(app)
        .post('/api/subscriptions/subscribe')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ plan: 'monthly' });

      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toBeDefined();
    });

    it('should activate Plus after invoice.paid webhook', async () => {
      const row = await query(
        'SELECT stripe_subscription_id FROM users WHERE id = $1',
        [user.userId]
      );

      await fireWebhook('invoice.paid', {
        subscription: row.rows[0].stripe_subscription_id,
        amount_paid: 100,
        payment_intent: 'pi_e2e_town_' + Date.now(),
      });

      const updated = await query(
        'SELECT subscription_tier FROM users WHERE id = $1',
        [user.userId]
      );
      expect(updated.rows[0].subscription_tier).toBe('plus');
    });

    it('should show nextStep=verification after subscribing', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.body.isSubscribed).toBe(true);
      expect(res.body.isVerified).toBe(false);
      expect(res.body.nextStep).toBe('verification');
    });

    it('should create verification session', async () => {
      const res = await request(app)
        .post('/api/identity/verify')
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBeDefined();
    });

    it('should gain full access after verification webhook', async () => {
      await fireWebhook('identity.verification_session.verified', {
        id: 'vs_e2e_town_' + Date.now(),
        metadata: { customer_id: user.customerId },
        verified_outputs: { first_name: 'E2E', last_name: 'Town' },
      });

      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.body.canAccess).toBe(true);
      expect(res.body.nextStep).toBeNull();
    });
  });

  // ===========================================
  // Flow 2: Rental Listing Unlock
  // Free user → subscribe → verify → connect → can list rentals
  // ===========================================
  describe('Flow 2: Rental Listing Unlock', () => {
    let user;

    it('should start as free with no rental access', async () => {
      user = await createFullUser({ subscriptionTier: 'free', isVerified: false });

      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.body.canAccess).toBe(false);
      expect(res.body.nextStep).toBe('subscription');
    });

    it('should subscribe', async () => {
      const res = await request(app)
        .post('/api/subscriptions/subscribe')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ plan: 'monthly' });

      expect(res.status).toBe(200);

      // Activate via webhook
      const row = await query(
        'SELECT stripe_subscription_id FROM users WHERE id = $1',
        [user.userId]
      );
      await fireWebhook('invoice.paid', {
        subscription: row.rows[0].stripe_subscription_id,
        amount_paid: 100,
        payment_intent: 'pi_e2e_rental_' + Date.now(),
      });
    });

    it('should show nextStep=verification', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.body.nextStep).toBe('verification');
    });

    it('should verify identity', async () => {
      await request(app)
        .post('/api/identity/verify')
        .set('Authorization', `Bearer ${user.token}`);

      await fireWebhook('identity.verification_session.verified', {
        id: 'vs_e2e_rental_' + Date.now(),
        metadata: { customer_id: user.customerId },
        verified_outputs: { first_name: 'E2E', last_name: 'Rental' },
      });

      // Also need to update status to 'verified' for requireVerified middleware
      await query(
        "UPDATE users SET status = 'verified' WHERE id = $1",
        [user.userId]
      );
    });

    it('should show nextStep=connect after verification', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.body.nextStep).toBe('connect');
      expect(res.body.hasConnect).toBe(false);
    });

    it('should create Connect account', async () => {
      const res = await request(app)
        .post('/api/users/me/connect-account')
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(201);
      expect(res.body.accountId).toMatch(/^acct_/);
    });

    it('should show nextStep=null with full rental access', async () => {
      const res = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.body.canAccess).toBe(true);
      expect(res.body.nextStep).toBeNull();
      expect(res.body.hasConnect).toBe(true);
    });
  });

  // ===========================================
  // Flow 3: Full Rental Lifecycle
  // request → approve → confirm-payment → pickup → return
  // ===========================================
  describe('Flow 3: Full Rental Lifecycle', () => {
    let lender, borrower, listingId, transactionId, paymentIntentId;

    beforeAll(async () => {
      // Set up lender with Connect
      lender = await createFullUser({
        subscriptionTier: 'plus',
        isVerified: true,
        status: 'verified',
      });
      const connect = await createTestConnectAccount(lender.userId, lender.email);
      lender.connectAccountId = connect.id;

      // Set up borrower
      borrower = await createFullUser({ subscriptionTier: 'free' });

      // Create rental listing
      listingId = await createTestListing(lender.userId, {
        title: 'E2E Camera Rental',
        isFree: false,
        pricePerDay: 20.00,
        depositAmount: 100.00,
        lateFeePerDay: 10.00,
        visibility: 'neighborhood',
      });
    });

    it('Step 1: Borrower requests rental', async () => {
      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 4).toISOString(); // 3 days

      const res = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({
          listingId,
          startDate,
          endDate,
          message: 'Need it for a weekend shoot!',
        });

      expect(res.status).toBe(201);
      transactionId = res.body.transactionId;
      expect(res.body.rentalDays).toBe(3);
      expect(res.body.rentalFee).toBe(60); // $20 * 3
      expect(res.body.depositAmount).toBe(100);
      expect(res.body.totalAmount).toBe(160);
    });

    it('Step 2: Lender approves → creates manual-capture PI', async () => {
      const res = await request(app)
        .post(`/api/rentals/${transactionId}/approve`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ response: 'Happy to lend it!' });

      expect(res.status).toBe(200);
      paymentIntentId = res.body.paymentIntentId;
      expect(res.body.totalAmount).toBe(16000); // $160 in cents

      // Verify PI on Stripe
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      expect(pi.capture_method).toBe('manual');
      expect(pi.amount).toBe(16000);
    });

    it('Step 3: Borrower confirms payment → authorization hold', async () => {
      // Simulate PaymentSheet completion by confirming the PI
      const pmList = await stripe.paymentMethods.list({
        customer: borrower.customerId,
        type: 'card',
      });
      await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: pmList.data[0].id,
      });

      // Update DB status
      await query(
        "UPDATE borrow_transactions SET status = 'paid', payment_status = 'authorized' WHERE id = $1",
        [transactionId]
      );

      const res = await request(app)
        .post(`/api/rentals/${transactionId}/confirm-payment`)
        .set('Authorization', `Bearer ${borrower.token}`);

      expect(res.status).toBe(200);
    });

    it('Step 4: Lender confirms pickup → captures payment', async () => {
      const res = await request(app)
        .post(`/api/rentals/${transactionId}/pickup`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'like_new' });

      expect(res.status).toBe(200);

      // Verify PI captured on Stripe
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      expect(pi.status).toBe('succeeded');
    });

    it('Step 5: Lender confirms clean return → deposit refund + payout', async () => {
      const res = await request(app)
        .post(`/api/rentals/${transactionId}/return`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'like_new', notes: 'Perfect condition' });

      expect(res.status).toBe(200);
      expect(res.body.conditionDegraded).toBe(false);

      // Verify transaction completed
      const txn = await query(
        'SELECT status, payment_status, stripe_transfer_id FROM borrow_transactions WHERE id = $1',
        [transactionId]
      );
      expect(txn.rows[0].status).toBe('returned');
      expect(txn.rows[0].payment_status).toBe('completed');

      // Verify listing is available again
      const listing = await query(
        'SELECT is_available, times_borrowed FROM listings WHERE id = $1',
        [listingId]
      );
      expect(listing.rows[0].is_available).toBe(true);
    });
  });

  // ===========================================
  // Flow 4: Rental with Damage Claim
  // Full flow → condition degradation → damage claim
  // ===========================================
  describe('Flow 4: Rental with Damage Claim', () => {
    let lender, borrower, listingId, transactionId;

    beforeAll(async () => {
      lender = await createFullUser({
        subscriptionTier: 'plus',
        isVerified: true,
        status: 'verified',
      });
      const connect = await createTestConnectAccount(lender.userId, lender.email);
      lender.connectAccountId = connect.id;

      borrower = await createFullUser();

      listingId = await createTestListing(lender.userId, {
        title: 'Fragile Art Print',
        isFree: false,
        pricePerDay: 15.00,
        depositAmount: 200.00,
        visibility: 'neighborhood',
      });
    });

    it('should complete request → approve → pay → pickup flow', async () => {
      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 3).toISOString();

      // Request
      const reqRes = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId, startDate, endDate });
      transactionId = reqRes.body.transactionId;

      // Approve
      const approveRes = await request(app)
        .post(`/api/rentals/${transactionId}/approve`)
        .set('Authorization', `Bearer ${lender.token}`);

      // Pay (simulate)
      const pmList = await stripe.paymentMethods.list({
        customer: borrower.customerId,
        type: 'card',
      });
      await stripe.paymentIntents.confirm(approveRes.body.paymentIntentId, {
        payment_method: pmList.data[0].id,
      });
      await query(
        "UPDATE borrow_transactions SET status = 'paid', payment_status = 'authorized' WHERE id = $1",
        [transactionId]
      );

      // Pickup
      await request(app)
        .post(`/api/rentals/${transactionId}/pickup`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'like_new' });
    });

    it('should detect condition degradation on return', async () => {
      const res = await request(app)
        .post(`/api/rentals/${transactionId}/return`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'worn', notes: 'Water damage on the corner' });

      expect(res.body.conditionDegraded).toBe(true);
    });

    it('should process damage claim and adjust deposit', async () => {
      const res = await request(app)
        .post(`/api/rentals/${transactionId}/damage-claim`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({
          amountCents: 7500, // $75 of $200 deposit
          notes: 'Water damage on corner of print. Visible warping and discoloration.',
          evidenceUrls: ['https://example.com/damage1.jpg'],
        });

      expect(res.status).toBe(200);
      expect(res.body.claimAmount).toBe(7500);
      expect(res.body.depositRefunded).toBe(12500); // $200 - $75 = $125 back

      // Verify final state
      const txn = await query(
        'SELECT status, payment_status, damage_claim_amount_cents FROM borrow_transactions WHERE id = $1',
        [transactionId]
      );
      expect(txn.rows[0].payment_status).toBe('damage_claimed');
      expect(txn.rows[0].damage_claim_amount_cents).toBe(7500);
    });
  });

  // ===========================================
  // Flow 5: Late Rental with Fee
  // Rental → overdue → late fee charged
  // ===========================================
  describe('Flow 5: Late Rental with Fee', () => {
    let lender, borrower, listingId, transactionId;

    beforeAll(async () => {
      lender = await createFullUser({
        subscriptionTier: 'plus',
        isVerified: true,
        status: 'verified',
      });
      const connect = await createTestConnectAccount(lender.userId, lender.email);
      lender.connectAccountId = connect.id;

      borrower = await createFullUser();

      listingId = await createTestListing(lender.userId, {
        title: 'Power Tool Set',
        isFree: false,
        pricePerDay: 25.00,
        depositAmount: 150.00,
        lateFeePerDay: 15.00,
        visibility: 'neighborhood',
      });
    });

    it('should create rental and simulate overdue state', async () => {
      // Create request with dates in the past (to simulate overdue)
      const pastStart = new Date(Date.now() - 86400000 * 5).toISOString();
      const pastEnd = new Date(Date.now() - 86400000 * 3).toISOString(); // 2 days overdue

      // Direct DB insert to bypass date validation
      const result = await query(
        `INSERT INTO borrow_transactions (
          listing_id, borrower_id, lender_id,
          requested_start_date, requested_end_date,
          rental_days, daily_rate, rental_fee, deposit_amount,
          platform_fee, lender_payout, status, payment_status,
          stripe_payment_intent_id
        ) VALUES ($1, $2, $3, $4, $5, 2, 25.00, 50.00, 150.00, 1.00, 49.00,
          'picked_up', 'captured', 'pi_e2e_late_placeholder')
        RETURNING id`,
        [listingId, borrower.userId, lender.userId, pastStart, pastEnd]
      );
      transactionId = result.rows[0].id;
    });

    it('should charge late fee for overdue rental', async () => {
      const res = await request(app)
        .post(`/api/rentals/${transactionId}/late-fee`)
        .set('Authorization', `Bearer ${lender.token}`);

      expect(res.status).toBe(200);
      expect(res.body.daysOverdue).toBeGreaterThanOrEqual(2);
      expect(res.body.lateFeePerDay).toBe(15);
      expect(res.body.lateFeeCents).toBeGreaterThanOrEqual(3000); // $15 * 2+ days
      expect(res.body.paymentIntentId).toMatch(/^pi_/);
      expect(res.body.clientSecret).toBeDefined();

      // Verify PI on Stripe
      const pi = await stripe.paymentIntents.retrieve(res.body.paymentIntentId);
      expect(pi.amount).toBeGreaterThanOrEqual(3000);
    });

    it('should reject late fee for non-overdue rental', async () => {
      // Create a rental with future end date
      const futureListingId = await createTestListing(lender.userId, {
        title: 'Future Item',
        isFree: false,
        pricePerDay: 5.00,
        depositAmount: 10.00,
        lateFeePerDay: 5.00,
      });

      const result = await query(
        `INSERT INTO borrow_transactions (
          listing_id, borrower_id, lender_id,
          requested_start_date, requested_end_date,
          rental_days, daily_rate, rental_fee, deposit_amount,
          platform_fee, lender_payout, status, payment_status
        ) VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '5 days', 5, 5.00, 25.00, 10.00, 0.50, 24.50,
          'picked_up', 'captured')
        RETURNING id`,
        [futureListingId, borrower.userId, lender.userId]
      );

      const res = await request(app)
        .post(`/api/rentals/${result.rows[0].id}/late-fee`)
        .set('Authorization', `Bearer ${lender.token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not overdue/);
    });
  });

  // ===========================================
  // Flow 6: Cross-Path Unlock
  // Town path first (sub+verify) → rental path (only needs Connect)
  // ===========================================
  describe('Flow 6: Cross-Path Unlock', () => {
    let user;

    it('should complete town unlock path (subscribe + verify)', async () => {
      user = await createFullUser({ subscriptionTier: 'free', isVerified: false });

      // Subscribe
      const subRes = await request(app)
        .post('/api/subscriptions/subscribe')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ plan: 'annual' }); // Annual this time

      expect(subRes.status).toBe(200);

      // Activate
      const row = await query(
        'SELECT stripe_subscription_id FROM users WHERE id = $1',
        [user.userId]
      );
      await fireWebhook('invoice.paid', {
        subscription: row.rows[0].stripe_subscription_id,
        amount_paid: 1000, // annual
        payment_intent: 'pi_e2e_cross_' + Date.now(),
      });

      // Verify
      await request(app)
        .post('/api/identity/verify')
        .set('Authorization', `Bearer ${user.token}`);

      await fireWebhook('identity.verification_session.verified', {
        id: 'vs_e2e_cross_' + Date.now(),
        metadata: { customer_id: user.customerId },
        verified_outputs: { first_name: 'Cross', last_name: 'Path' },
      });

      // Update user status for requireVerified middleware
      await query(
        "UPDATE users SET status = 'verified' WHERE id = $1",
        [user.userId]
      );

      // Town access should work now
      const townRes = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'town' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(townRes.body.canAccess).toBe(true);
      expect(townRes.body.nextStep).toBeNull();
    });

    it('should only need Connect for rental access (steps 1+2 already done)', async () => {
      const rentalRes = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${user.token}`);

      // Should skip straight to connect
      expect(rentalRes.body.isSubscribed).toBe(true);
      expect(rentalRes.body.isVerified).toBe(true);
      expect(rentalRes.body.hasConnect).toBe(false);
      expect(rentalRes.body.nextStep).toBe('connect');
    });

    it('should gain full rental access after Connect setup', async () => {
      // Create Connect account
      const connectRes = await request(app)
        .post('/api/users/me/connect-account')
        .set('Authorization', `Bearer ${user.token}`);

      expect(connectRes.status).toBe(201);

      // Now rental access should be complete
      const finalRes = await request(app)
        .get('/api/subscriptions/access-check')
        .query({ feature: 'rentals' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(finalRes.body.canAccess).toBe(true);
      expect(finalRes.body.nextStep).toBeNull();
      expect(finalRes.body.isSubscribed).toBe(true);
      expect(finalRes.body.isVerified).toBe(true);
      expect(finalRes.body.hasConnect).toBe(true);
    });
  });
});
