/**
 * Rentals Tests — Real Stripe Test API
 *
 * Tests the full rental lifecycle: request → approve → confirm-payment →
 * pickup → return, plus decline, damage claims, and late fees.
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
  stripe,
} from '../helpers/stripe.js';
import { query } from '../../src/utils/db.js';

describe('Rentals API', () => {
  let app;
  let lender;  // Verified Plus user with Connect account (item owner)
  let borrower; // User who borrows items
  let listing;  // Rental listing

  beforeAll(async () => {
    app = await createTestApp(
      { path: '/api/rentals', module: '../../src/routes/rentals.js' },
      // POST /transactions is the canonical request endpoint that creates the
      // manual-capture PaymentIntent (the mobile borrower flow uses it). The
      // /rentals lifecycle endpoints (approve/pickup/return) operate on the
      // same borrow_transactions rows.
      { path: '/api/transactions', module: '../../src/routes/transactions.js' },
    );

    // Lender — Plus, verified (no Connect — approve endpoint handles this gracefully
    // by skipping transfer_data; Connect capabilities take async verification in test mode)
    lender = await createTestUser({
      email: `rent-lender-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'plus',
      isVerified: true,
      status: 'verified',
    });
    const lenderCust = await createTestCustomer(lender.userId, lender.email);
    await attachTestPaymentMethod(lenderCust.id);
    lender.customerId = lenderCust.id;

    // Borrower — has payment method
    borrower = await createTestUser({
      email: `rent-borrower-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'free',
      isVerified: true,
      status: 'verified',
    });
    const borrowerCust = await createTestCustomer(borrower.userId, borrower.email);
    await attachTestPaymentMethod(borrowerCust.id);
    borrower.customerId = borrowerCust.id;

    // Create a rental listing
    listing = {
      id: await createTestListing(lender.userId, {
        title: 'Test Camera',
        isFree: false,
        pricePerDay: 10.00,
        depositAmount: 50.00,
        lateFeePerDay: 5.00,
        visibility: 'neighborhood',
      }),
    };
  });

  afterAll(async () => {
    await cleanupTestUser(borrower.userId);
    await cleanupTestUser(lender.userId);
  });

  // ===========================================
  // POST /api/transactions — the canonical rental request endpoint.
  // Creates the manual-capture PaymentIntent (rental + deposit).
  // (/rentals/request was removed — it never created a PI and was unused.)
  // ===========================================
  describe('POST /transactions (rental request)', () => {
    it('should create a request with a manual-capture PI for rental + deposit', async () => {
      const startDate = new Date(Date.now() + 86400000).toISOString(); // tomorrow
      const endDate = new Date(Date.now() + 86400000 * 4).toISOString(); // 3 days

      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({
          listingId: listing.id,
          startDate,
          endDate,
          message: 'Can I borrow your camera?',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.clientSecret).toBeDefined();

      // Charge = rental ($10/day x 3 = $30) + deposit ($50) = $80 (8000c), manual capture.
      const row = await query('SELECT stripe_payment_intent_id FROM borrow_transactions WHERE id = $1', [res.body.id]);
      const pi = await stripe.paymentIntents.retrieve(row.rows[0].stripe_payment_intent_id);
      expect(pi.capture_method).toBe('manual');
      expect(pi.amount).toBe(8000);
    });

    it('should not allow borrowing own item', async () => {
      // Fresh listing so the own-item guard is what fires (not availability).
      const ownListingId = await createTestListing(lender.userId, {
        title: 'Own Item Test', isFree: false, pricePerDay: 10.00, depositAmount: 20.00, visibility: 'neighborhood',
      });
      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 3).toISOString();

      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ listingId: ownListingId, startDate, endDate });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot borrow your own item/);
    });

    it('should validate duration limits', async () => {
      const durationListingId = await createTestListing(lender.userId, {
        title: 'Duration Test Item',
        isFree: false,
        pricePerDay: 10.00,
        depositAmount: 20.00,
        visibility: 'neighborhood',
      });
      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 30).toISOString(); // 29 days

      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId: durationListingId, startDate, endDate });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Duration must be between/);
    });

    it('should reject invalid listing ID', async () => {
      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 3).toISOString();

      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({
          listingId: '00000000-0000-0000-0000-000000000000',
          startDate,
          endDate,
        });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // POST /api/rentals/:id/approve
  // ===========================================
  // Create a transaction the way the app actually does: POST /transactions
  // creates the manual-capture PaymentIntent and returns checkout credentials.
  // Optionally authorize the hold (borrower "pays" → PI → requires_capture).
  // (/rentals/request is a partial duplicate that does NOT create a PI, so it
  // can't drive the paid lifecycle — the mobile borrower flow uses /transactions.)
  async function createPaidTxn({ authorize = true, pricePerDay = 10.00, depositAmount = 50.00, title = 'Lifecycle Item', dayOffset = 1 } = {}) {
    const listingId = await createTestListing(lender.userId, {
      title, isFree: false, pricePerDay, depositAmount, lateFeePerDay: 5.00, visibility: 'neighborhood',
    });
    const startDate = new Date(Date.now() + 86400000 * dayOffset).toISOString();
    const endDate = new Date(Date.now() + 86400000 * (dayOffset + 2)).toISOString();
    const txnRes = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${borrower.token}`)
      .send({ listingId, startDate, endDate });
    const transactionId = txnRes.body.id;
    const row = await query('SELECT stripe_payment_intent_id FROM borrow_transactions WHERE id = $1', [transactionId]);
    const piId = row.rows[0].stripe_payment_intent_id;
    if (authorize) {
      const pmList = await stripe.paymentMethods.list({ customer: borrower.customerId, type: 'card' });
      await stripe.paymentIntents.confirm(piId, { payment_method: pmList.data[0].id });
    }
    return { transactionId, piId, listingId };
  }

  describe('POST /:id/approve', () => {
    it('should approve an authorized request (manual-capture PI, hold in place)', async () => {
      const r = await createPaidTxn({ authorize: true });
      listing.transactionId = r.transactionId;
      listing.paymentIntentId = r.piId;
      listing.lifecycleListingId = r.listingId;

      const pi = await stripe.paymentIntents.retrieve(r.piId);
      expect(pi.capture_method).toBe('manual');
      expect(pi.status).toBe('requires_capture'); // authorization hold in place

      const res = await request(app)
        .post(`/api/rentals/${r.transactionId}/approve`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ response: 'Sure, it\'s ready for you!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Lender approval moves the authorized request to 'paid'
      const txn = await query(
        'SELECT status FROM borrow_transactions WHERE id = $1',
        [r.transactionId]
      );
      expect(txn.rows[0].status).toBe('paid');
    });

    it('should reject approval by non-lender', async () => {
      // Create a new request for this test
      const startDate = new Date(Date.now() + 86400000 * 10).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 12).toISOString();

      // Need to make the listing available again for a new request
      const listing2Id = await createTestListing(lender.userId, {
        title: 'Test Drill',
        isFree: false,
        pricePerDay: 5.00,
        depositAmount: 20.00,
        visibility: 'neighborhood',
      });

      const reqRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId: listing2Id, startDate, endDate });

      const txnId = reqRes.body.id;

      // Borrower tries to approve (should fail)
      const res = await request(app)
        .post(`/api/rentals/${txnId}/approve`)
        .set('Authorization', `Bearer ${borrower.token}`);

      expect(res.status).toBe(404); // Not found because lender_id doesn't match
    });
  });

  // ===========================================
  // POST /api/rentals/:id/decline
  // ===========================================
  describe('POST /:id/decline', () => {
    it('should decline a rental request', async () => {
      // Create a new listing and request
      const declineListingId = await createTestListing(lender.userId, {
        title: 'Decline Test Item',
        isFree: false,
        pricePerDay: 5.00,
        depositAmount: 10.00,
        visibility: 'neighborhood',
      });

      const startDate = new Date(Date.now() + 86400000 * 5).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 7).toISOString();

      const reqRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId: declineListingId, startDate, endDate });

      const txnId = reqRes.body.id;

      const res = await request(app)
        .post(`/api/rentals/${txnId}/decline`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ reason: 'Sorry, not available that week' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify status in DB
      const txn = await query(
        'SELECT status, payment_status FROM borrow_transactions WHERE id = $1',
        [txnId]
      );
      expect(txn.rows[0].status).toBe('cancelled');
      expect(txn.rows[0].payment_status).toBe('cancelled');
    });
  });

  // ===========================================
  // POST /api/rentals/:id/confirm-payment
  // ===========================================
  describe('POST /:id/confirm-payment', () => {
    it('should return PaymentSheet credentials when the hold is not yet authorized', async () => {
      // PI-backed txn whose hold isn't authorized yet (requires_payment_method).
      const r = await createPaidTxn({ authorize: false, title: 'Confirm-Payment Item', dayOffset: 20 });
      const res = await request(app)
        .post(`/api/rentals/${r.transactionId}/confirm-payment`)
        .set('Authorization', `Bearer ${borrower.token}`);

      expect(res.status).toBe(200);
      expect(res.body.requiresPayment).toBe(true);
      expect(res.body.clientSecret).toBeDefined();
      expect(res.body.customerId).toBe(borrower.customerId);
    });
  });

  // ===========================================
  // POST /api/rentals/:id/pickup
  // ===========================================
  describe('POST /:id/pickup', () => {
    it('should reject pickup for a not-yet-ready transaction', async () => {
      // Fresh pending request (not authorized/approved) cannot be picked up.
      const freshListingId = await createTestListing(lender.userId, {
        title: 'Pickup Guard Item',
        isFree: false,
        pricePerDay: 8.00,
        depositAmount: 15.00,
        visibility: 'neighborhood',
      });
      const startDate = new Date(Date.now() + 86400000 * 23).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 25).toISOString();
      const reqRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId: freshListingId, startDate, endDate });

      const res = await request(app)
        .post(`/api/rentals/${reqRes.body.id}/pickup`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'good' });

      expect(res.status).toBe(404); // status is 'pending', not paid/approved
    });

    it('should confirm pickup for an approved transaction', async () => {
      // listing.transactionId was authorized + approved above → status 'paid'.
      const res = await request(app)
        .post(`/api/rentals/${listing.transactionId}/pickup`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'good' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const txn = await query(
        'SELECT status, condition_at_pickup FROM borrow_transactions WHERE id = $1',
        [listing.transactionId]
      );
      expect(txn.rows[0].status).toBe('picked_up');
      expect(txn.rows[0].condition_at_pickup).toBe('good');
    });

    it('should reject pickup by non-lender', async () => {
      const res = await request(app)
        .post(`/api/rentals/${listing.transactionId}/pickup`)
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ condition: 'good' });

      // Endpoint returns 404 (not found) rather than 403 — query filters by lender_id
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // POST /api/rentals/:id/return (clean return)
  // ===========================================
  describe('POST /:id/return', () => {
    it('should process clean return with deposit refund and lender payout', async () => {
      const res = await request(app)
        .post(`/api/rentals/${listing.transactionId}/return`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'good', notes: 'Returned in great shape' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.conditionDegraded).toBe(false);

      // Verify DB
      const txn = await query(
        'SELECT status, payment_status, condition_at_return FROM borrow_transactions WHERE id = $1',
        [listing.transactionId]
      );
      expect(txn.rows[0].status).toBe('returned');
      expect(txn.rows[0].payment_status).toBe('deposit_released');
      expect(txn.rows[0].condition_at_return).toBe('good');

      // Verify the lifecycle listing is available again
      const listingRow = await query(
        'SELECT is_available, times_borrowed FROM listings WHERE id = $1',
        [listing.lifecycleListingId]
      );
      expect(listingRow.rows[0].is_available).toBe(true);
      expect(listingRow.rows[0].times_borrowed).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================
  // Condition degradation & damage claim flow
  // ===========================================
  describe('Damage claim flow', () => {
    let damageTxnId;
    let damageListingId;

    beforeAll(async () => {
      // Full flow via the canonical endpoints: create+PI → authorize → approve → pickup.
      const r = await createPaidTxn({ authorize: true, pricePerDay: 15.00, depositAmount: 100.00, title: 'Fragile Vase', dayOffset: 30 });
      damageTxnId = r.transactionId;
      damageListingId = r.listingId;

      await request(app)
        .post(`/api/rentals/${damageTxnId}/approve`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ response: 'Ready' });

      await request(app)
        .post(`/api/rentals/${damageTxnId}/pickup`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'good' });
    });

    it('should flag condition degradation on return', async () => {
      const res = await request(app)
        .post(`/api/rentals/${damageTxnId}/return`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'worn', notes: 'Multiple scratches found' });

      expect(res.status).toBe(200);
      expect(res.body.conditionDegraded).toBe(true);
    });

    it('should open a damage-claim dispute against the deposit', async () => {
      // Damage claims now open a dispute (awaitingResponse) rather than
      // instantly deducting — the borrower gets to respond.
      const res = await request(app)
        .post(`/api/rentals/${damageTxnId}/damage-claim`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({
          amountCents: 5000, // $50 claim
          notes: 'Multiple deep scratches on the vase. Photos attached.',
          evidenceUrls: ['https://example.com/photo1.jpg'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.disputeId).toBeDefined();
      expect(res.body.status).toBe('awaitingResponse');

      // Transaction is now disputed and records the claim amount
      const txn = await query(
        'SELECT status, damage_claim_amount_cents FROM borrow_transactions WHERE id = $1',
        [damageTxnId]
      );
      expect(txn.rows[0].status).toBe('disputed');
      expect(txn.rows[0].damage_claim_amount_cents).toBe(5000);
    });

    it('should cap the disputed claim at deposit + rental fee', async () => {
      // Fresh paid rental through the canonical flow: $25 deposit, $5/day x 2 = $10 fee.
      const r = await createPaidTxn({ authorize: true, pricePerDay: 5.00, depositAmount: 25.00, title: 'Cap Test Item', dayOffset: 40 });
      const txnId = r.transactionId;

      await request(app)
        .post(`/api/rentals/${txnId}/approve`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ response: 'Ready' });
      await request(app)
        .post(`/api/rentals/${txnId}/pickup`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'good' });

      // Claim far more than the deposit
      const res = await request(app)
        .post(`/api/rentals/${txnId}/damage-claim`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({
          amountCents: 10000, // $100 — well over the cap
          notes: 'Totally destroyed the item, claiming full value.',
        });

      expect(res.status).toBe(200);
      expect(res.body.disputeId).toBeDefined();

      // Requested amount on the dispute is capped at deposit ($25) + rental fee ($10) = $35.
      const dispute = await query(
        'SELECT requested_amount FROM disputes WHERE id = $1',
        [res.body.disputeId]
      );
      expect(Number(dispute.rows[0].requested_amount)).toBe(35);
    });
  });

  // ===========================================
  // GET /api/rentals/:id/payment-status
  // ===========================================
  describe('GET /:id/payment-status', () => {
    it('should return detailed payment status for borrower', async () => {
      const res = await request(app)
        .get(`/api/rentals/${listing.transactionId}/payment-status`)
        .set('Authorization', `Bearer ${borrower.token}`);

      expect(res.status).toBe(200);
      expect(res.body.transactionId).toBe(listing.transactionId);
      expect(res.body.isBorrower).toBe(true);
      expect(res.body.isLender).toBe(false);
      expect(res.body.rentalFee).toBeDefined();
      expect(res.body.depositAmount).toBeDefined();
    });

    it('should return detailed payment status for lender', async () => {
      const res = await request(app)
        .get(`/api/rentals/${listing.transactionId}/payment-status`)
        .set('Authorization', `Bearer ${lender.token}`);

      expect(res.status).toBe(200);
      expect(res.body.isLender).toBe(true);
      expect(res.body.isBorrower).toBe(false);
    });

    it('should 404 for unrelated user', async () => {
      const otherUser = await createTestUser({
        email: `rent-other-${Date.now()}@borrowhood.test`,
      });

      try {
        const res = await request(app)
          .get(`/api/rentals/${listing.transactionId}/payment-status`)
          .set('Authorization', `Bearer ${otherUser.token}`);

        expect(res.status).toBe(404);
      } finally {
        await cleanupTestUser(otherUser.userId);
      }
    });
  });
});
