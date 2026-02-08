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
  // POST /api/rentals/request
  // ===========================================
  describe('POST /request', () => {
    it('should create a rental request with correct pricing', async () => {
      const startDate = new Date(Date.now() + 86400000).toISOString(); // tomorrow
      const endDate = new Date(Date.now() + 86400000 * 4).toISOString(); // 3 days

      const res = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({
          listingId: listing.id,
          startDate,
          endDate,
          message: 'Can I borrow your camera?',
        });

      expect(res.status).toBe(201);
      expect(res.body.transactionId).toBeDefined();
      expect(res.body.rentalDays).toBe(3);
      expect(res.body.rentalFee).toBe(30); // $10/day * 3 days
      expect(res.body.depositAmount).toBe(50);
      expect(res.body.totalAmount).toBe(80); // rental + deposit
      expect(res.body.platformFee).toBeCloseTo(0.60, 2); // 2% of $30
      expect(res.body.lenderPayout).toBeCloseTo(29.40, 2); // $30 - $0.60
      expect(res.body.lateFeePerDay).toBe(5);

      // Store for subsequent tests
      listing.transactionId = res.body.transactionId;
    });

    it('should not allow borrowing own item', async () => {
      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 3).toISOString();

      const res = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ listingId: listing.id, startDate, endDate });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot borrow your own item/);
    });

    it('should validate duration limits', async () => {
      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 30).toISOString(); // 29 days

      const res = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId: listing.id, startDate, endDate });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Duration must be between/);
    });

    it('should reject invalid listing ID', async () => {
      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 3).toISOString();

      const res = await request(app)
        .post('/api/rentals/request')
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
  describe('POST /:id/approve', () => {
    it('should create PaymentIntent with manual capture', async () => {
      const res = await request(app)
        .post(`/api/rentals/${listing.transactionId}/approve`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ response: 'Sure, it\'s ready for you!' });

      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toBeDefined();
      expect(res.body.paymentIntentId).toMatch(/^pi_/);
      expect(res.body.totalAmount).toBe(8000); // $80 in cents

      // Verify PI is manual capture
      const pi = await stripe.paymentIntents.retrieve(res.body.paymentIntentId);
      expect(pi.capture_method).toBe('manual');
      expect(pi.amount).toBe(8000);

      // Store for subsequent tests
      listing.paymentIntentId = res.body.paymentIntentId;
      listing.clientSecret = res.body.clientSecret;
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
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId: listing2Id, startDate, endDate });

      const txnId = reqRes.body.transactionId;

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
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId: declineListingId, startDate, endDate });

      const txnId = reqRes.body.transactionId;

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
    it('should detect requires_payment_method status and return PaymentSheet credentials', async () => {
      // The PI from approve test hasn't been paid yet (no card attached in test mode)
      const res = await request(app)
        .post(`/api/rentals/${listing.transactionId}/confirm-payment`)
        .set('Authorization', `Bearer ${borrower.token}`);

      // PI should be in requires_payment_method or requires_confirmation state
      expect(res.status).toBe(200);
      // Either it detects authorization hold or asks for payment
      if (res.body.requiresPayment) {
        expect(res.body.clientSecret).toBeDefined();
        expect(res.body.customerId).toBe(borrower.customerId);
      } else {
        expect(res.body.status).toBeDefined();
      }
    });
  });

  // ===========================================
  // POST /api/rentals/:id/pickup
  // ===========================================
  describe('POST /:id/pickup', () => {
    it('should reject pickup for non-paid transaction', async () => {
      const res = await request(app)
        .post(`/api/rentals/${listing.transactionId}/pickup`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'good' });

      expect(res.status).toBe(404); // status is 'approved' not 'paid'
    });

    it('should capture payment and confirm pickup for paid transaction', async () => {
      // Simulate paid status by confirming PI and updating DB
      // First confirm the PI with a payment method
      const pmList = await stripe.paymentMethods.list({
        customer: borrower.customerId,
        type: 'card',
      });

      await stripe.paymentIntents.confirm(listing.paymentIntentId, {
        payment_method: pmList.data[0].id,
      });

      // Update DB to 'paid' status
      await query(
        "UPDATE borrow_transactions SET status = 'paid', payment_status = 'authorized' WHERE id = $1",
        [listing.transactionId]
      );

      const res = await request(app)
        .post(`/api/rentals/${listing.transactionId}/pickup`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'good' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify DB updated
      const txn = await query(
        'SELECT status, payment_status, condition_at_pickup FROM borrow_transactions WHERE id = $1',
        [listing.transactionId]
      );
      expect(txn.rows[0].status).toBe('picked_up');
      expect(txn.rows[0].payment_status).toBe('captured');
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
      expect(txn.rows[0].payment_status).toBe('completed');
      expect(txn.rows[0].condition_at_return).toBe('good');

      // Verify listing is available again
      const listingRow = await query(
        'SELECT is_available, times_borrowed FROM listings WHERE id = $1',
        [listing.id]
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
      // Create a fresh listing and go through the rental flow
      damageListingId = await createTestListing(lender.userId, {
        title: 'Fragile Vase',
        isFree: false,
        pricePerDay: 15.00,
        depositAmount: 100.00,
        lateFeePerDay: 10.00,
        visibility: 'neighborhood',
      });

      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 3).toISOString();

      // Request
      const reqRes = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId: damageListingId, startDate, endDate });
      damageTxnId = reqRes.body.transactionId;

      // Approve
      const approveRes = await request(app)
        .post(`/api/rentals/${damageTxnId}/approve`)
        .set('Authorization', `Bearer ${lender.token}`);

      // Confirm PI and simulate paid status
      const pmList = await stripe.paymentMethods.list({
        customer: borrower.customerId,
        type: 'card',
      });
      await stripe.paymentIntents.confirm(approveRes.body.paymentIntentId, {
        payment_method: pmList.data[0].id,
      });
      await query(
        "UPDATE borrow_transactions SET status = 'paid', payment_status = 'authorized' WHERE id = $1",
        [damageTxnId]
      );

      // Pickup with 'good' condition
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

    it('should process damage claim against deposit', async () => {
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
      expect(res.body.claimAmount).toBe(5000); // $50
      expect(res.body.depositRefunded).toBe(5000); // $100 deposit - $50 claim = $50 refund

      // Verify in DB
      const txn = await query(
        'SELECT status, payment_status, damage_claim_amount_cents FROM borrow_transactions WHERE id = $1',
        [damageTxnId]
      );
      expect(txn.rows[0].status).toBe('returned');
      expect(txn.rows[0].payment_status).toBe('damage_claimed');
      expect(txn.rows[0].damage_claim_amount_cents).toBe(5000);
    });

    it('should cap damage claim at deposit amount', async () => {
      // Create a new transaction for this test
      const capListingId = await createTestListing(lender.userId, {
        title: 'Cap Test Item',
        isFree: false,
        pricePerDay: 5.00,
        depositAmount: 25.00,
        visibility: 'neighborhood',
      });

      const startDate = new Date(Date.now() + 86400000 * 15).toISOString();
      const endDate = new Date(Date.now() + 86400000 * 17).toISOString();

      const reqRes = await request(app)
        .post('/api/rentals/request')
        .set('Authorization', `Bearer ${borrower.token}`)
        .send({ listingId: capListingId, startDate, endDate });

      const txnId = reqRes.body.transactionId;

      // Approve
      const approveRes = await request(app)
        .post(`/api/rentals/${txnId}/approve`)
        .set('Authorization', `Bearer ${lender.token}`);

      // Confirm and pickup
      const pmList = await stripe.paymentMethods.list({
        customer: borrower.customerId,
        type: 'card',
      });
      await stripe.paymentIntents.confirm(approveRes.body.paymentIntentId, {
        payment_method: pmList.data[0].id,
      });
      await query(
        "UPDATE borrow_transactions SET status = 'paid', payment_status = 'authorized' WHERE id = $1",
        [txnId]
      );
      await request(app)
        .post(`/api/rentals/${txnId}/pickup`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({ condition: 'good' });

      // Try to claim more than deposit
      const res = await request(app)
        .post(`/api/rentals/${txnId}/damage-claim`)
        .set('Authorization', `Bearer ${lender.token}`)
        .send({
          amountCents: 10000, // $100 — more than $25 deposit
          notes: 'Totally destroyed the item, claiming full value.',
        });

      expect(res.status).toBe(200);
      expect(res.body.claimAmount).toBe(2500); // Capped at $25 deposit
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
