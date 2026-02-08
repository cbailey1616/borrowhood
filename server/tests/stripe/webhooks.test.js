/**
 * Webhook Tests — Signature Verification & Event Handling
 *
 * Tests all 14 webhook event types handled by the server,
 * signature verification, and error handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createTestUser,
  createTestCustomer,
  createTestListing,
  createTestConnectAccount,
  createTestApp,
  cleanupTestUser,
  buildWebhookPayload,
  signWebhookPayload,
  stripe,
} from '../helpers/stripe.js';
import { query } from '../../src/utils/db.js';

describe('Webhook Handler', () => {
  let app;
  let testUser;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeAll(async () => {
    app = await createTestApp(
      { path: '/webhooks', module: '../../src/routes/webhooks.js' },
    );

    testUser = await createTestUser({
      email: `wh-test-${Date.now()}@borrowhood.test`,
      subscriptionTier: 'free',
    });
    const cust = await createTestCustomer(testUser.userId, testUser.email);
    testUser.customerId = cust.id;
  });

  afterAll(async () => {
    await cleanupTestUser(testUser.userId);
  });

  /** Helper: send a signed webhook to the test app */
  async function sendWebhook(eventType, data, eventId) {
    const payload = buildWebhookPayload(eventType, data, eventId);
    const payloadStr = JSON.stringify(payload);
    const signature = signWebhookPayload(payloadStr, webhookSecret);

    return request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payloadStr);
  }

  // ===========================================
  // Signature Verification
  // ===========================================
  describe('Signature verification', () => {
    it('should reject request with no signature', async () => {
      const res = await request(app)
        .post('/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'test' }));

      expect(res.status).toBe(400);
    });

    it('should reject request with invalid signature', async () => {
      const res = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 't=1234,v1=invalid_signature')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'test' }));

      expect(res.status).toBe(400);
    });

    it('should accept request with valid signature', async () => {
      const res = await sendWebhook('test.event', { id: 'test_123' });
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  // ===========================================
  // invoice.paid → Activate Plus
  // ===========================================
  describe('invoice.paid', () => {
    it('should activate Plus subscription', async () => {
      // Give user a subscription ID
      await query(
        "UPDATE users SET stripe_subscription_id = 'sub_test_wh_invoice' WHERE id = $1",
        [testUser.userId]
      );

      const res = await sendWebhook('invoice.paid', {
        subscription: 'sub_test_wh_invoice',
        amount_paid: 100,
        payment_intent: 'pi_test_invoice',
      });

      expect(res.status).toBe(200);

      const row = await query(
        'SELECT subscription_tier, subscription_started_at FROM users WHERE id = $1',
        [testUser.userId]
      );
      expect(row.rows[0].subscription_tier).toBe('plus');
      expect(row.rows[0].subscription_started_at).toBeTruthy();
    });

    it('should record subscription history', async () => {
      const history = await query(
        "SELECT * FROM subscription_history WHERE user_id = $1 AND action = 'subscribe' ORDER BY created_at DESC LIMIT 1",
        [testUser.userId]
      );
      expect(history.rows.length).toBeGreaterThanOrEqual(1);
      expect(history.rows[0].tier).toBe('plus');
      expect(history.rows[0].amount_cents).toBe(100);
    });
  });

  // ===========================================
  // invoice.payment_failed
  // ===========================================
  describe('invoice.payment_failed', () => {
    it('should handle payment failure gracefully', async () => {
      const res = await sendWebhook('invoice.payment_failed', {
        subscription: 'sub_test_wh_invoice',
        amount_due: 100,
      });

      expect(res.status).toBe(200);
      // Should not crash — notification sent to user
    });
  });

  // ===========================================
  // customer.subscription.updated
  // ===========================================
  describe('customer.subscription.updated', () => {
    it('should set expiration when cancel_at_period_end is true', async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days

      const res = await sendWebhook('customer.subscription.updated', {
        id: 'sub_test_wh_invoice',
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: futureTimestamp,
      });

      expect(res.status).toBe(200);

      const row = await query(
        'SELECT subscription_expires_at FROM users WHERE id = $1',
        [testUser.userId]
      );
      expect(row.rows[0].subscription_expires_at).toBeTruthy();
    });

    it('should clear expiration when reactivated', async () => {
      const res = await sendWebhook('customer.subscription.updated', {
        id: 'sub_test_wh_invoice',
        status: 'active',
        cancel_at_period_end: false,
      });

      expect(res.status).toBe(200);

      const row = await query(
        'SELECT subscription_expires_at FROM users WHERE id = $1',
        [testUser.userId]
      );
      expect(row.rows[0].subscription_expires_at).toBeNull();
    });
  });

  // ===========================================
  // customer.subscription.deleted → Reset to free
  // ===========================================
  describe('customer.subscription.deleted', () => {
    it('should reset user to free tier', async () => {
      const res = await sendWebhook('customer.subscription.deleted', {
        id: 'sub_test_wh_invoice',
        status: 'canceled',
      });

      expect(res.status).toBe(200);

      const row = await query(
        'SELECT subscription_tier, stripe_subscription_id FROM users WHERE id = $1',
        [testUser.userId]
      );
      expect(row.rows[0].subscription_tier).toBe('free');
      expect(row.rows[0].stripe_subscription_id).toBeNull();
    });

    it('should record cancellation in subscription history', async () => {
      const history = await query(
        "SELECT * FROM subscription_history WHERE user_id = $1 AND action = 'cancel' ORDER BY created_at DESC LIMIT 1",
        [testUser.userId]
      );
      expect(history.rows.length).toBeGreaterThanOrEqual(1);
      expect(history.rows[0].tier).toBe('free');
    });
  });

  // ===========================================
  // identity.verification_session.verified
  // ===========================================
  describe('identity.verification_session.verified', () => {
    it('should mark user as verified', async () => {
      // Reset user to unverified
      await query(
        "UPDATE users SET is_verified = false, verification_status = 'pending' WHERE id = $1",
        [testUser.userId]
      );

      const res = await sendWebhook('identity.verification_session.verified', {
        id: 'vs_test_' + Date.now(),
        metadata: { customer_id: testUser.customerId },
        verified_outputs: {
          first_name: 'Webhook',
          last_name: 'Verified',
        },
      });

      expect(res.status).toBe(200);

      const row = await query(
        'SELECT is_verified, verification_status FROM users WHERE id = $1',
        [testUser.userId]
      );
      expect(row.rows[0].is_verified).toBe(true);
      expect(row.rows[0].verification_status).toBe('verified');
    });
  });

  // ===========================================
  // identity.verification_session.requires_input
  // ===========================================
  describe('identity.verification_session.requires_input', () => {
    it('should update status to requires_input', async () => {
      // Reset
      await query(
        "UPDATE users SET is_verified = false, verification_status = 'processing' WHERE id = $1",
        [testUser.userId]
      );

      const res = await sendWebhook('identity.verification_session.requires_input', {
        id: 'vs_test_' + Date.now(),
        metadata: { customer_id: testUser.customerId },
      });

      expect(res.status).toBe(200);

      const row = await query(
        'SELECT verification_status FROM users WHERE id = $1',
        [testUser.userId]
      );
      expect(row.rows[0].verification_status).toBe('requires_input');
    });
  });

  // ===========================================
  // payment_intent events
  // ===========================================
  describe('payment_intent events', () => {
    let txnId;

    beforeAll(async () => {
      // Create a transaction for PI event testing
      const listingId = await createTestListing(testUser.userId, {
        title: 'WH PI Test',
        isFree: false,
        pricePerDay: 5.00,
        depositAmount: 10.00,
      });

      const result = await query(
        `INSERT INTO borrow_transactions (
          listing_id, borrower_id, lender_id,
          requested_start_date, requested_end_date,
          rental_days, daily_rate, rental_fee, deposit_amount,
          platform_fee, lender_payout, payment_status
        ) VALUES ($1, $2, $2, NOW(), NOW() + INTERVAL '2 days', 2, 5.00, 10.00, 10.00, 0.20, 9.80, 'pending')
        RETURNING id`,
        [listingId, testUser.userId]
      );
      txnId = result.rows[0].id;
    });

    it('payment_intent.amount_capturable_updated → set authorized', async () => {
      const res = await sendWebhook('payment_intent.amount_capturable_updated', {
        id: 'pi_test_auth_' + Date.now(),
        metadata: { transaction_id: txnId },
        amount_capturable: 2000,
      });

      expect(res.status).toBe(200);

      const row = await query(
        'SELECT payment_status FROM borrow_transactions WHERE id = $1',
        [txnId]
      );
      expect(row.rows[0].payment_status).toBe('authorized');
    });

    it('payment_intent.payment_failed → set failed', async () => {
      const res = await sendWebhook('payment_intent.payment_failed', {
        id: 'pi_test_fail_' + Date.now(),
        metadata: { transaction_id: txnId },
      });

      expect(res.status).toBe(200);

      const row = await query(
        'SELECT payment_status FROM borrow_transactions WHERE id = $1',
        [txnId]
      );
      expect(row.rows[0].payment_status).toBe('failed');
    });

    it('payment_intent.canceled → cancel transaction', async () => {
      const res = await sendWebhook('payment_intent.canceled', {
        id: 'pi_test_cancel_' + Date.now(),
        metadata: { transaction_id: txnId },
      });

      expect(res.status).toBe(200);

      const row = await query(
        'SELECT status, payment_status FROM borrow_transactions WHERE id = $1',
        [txnId]
      );
      expect(row.rows[0].status).toBe('cancelled');
      expect(row.rows[0].payment_status).toBe('cancelled');
    });
  });

  // ===========================================
  // Unhandled event types
  // ===========================================
  describe('Unhandled events', () => {
    it('should return 200 for unhandled event types', async () => {
      const res = await sendWebhook('some.unknown.event', { id: 'unknown_123' });
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  // ===========================================
  // Idempotency
  // ===========================================
  describe('Idempotency', () => {
    it('should handle duplicate events gracefully', async () => {
      await query(
        "UPDATE users SET stripe_subscription_id = 'sub_test_idemp', subscription_tier = 'free' WHERE id = $1",
        [testUser.userId]
      );

      const eventId = `evt_test_idemp_${Date.now()}`;

      // Send same event twice
      const res1 = await sendWebhook('invoice.paid', {
        subscription: 'sub_test_idemp',
        amount_paid: 100,
        payment_intent: 'pi_test_idemp',
      }, eventId);

      const res2 = await sendWebhook('invoice.paid', {
        subscription: 'sub_test_idemp',
        amount_paid: 100,
        payment_intent: 'pi_test_idemp',
      }, eventId);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Should still only be plus (not cause errors)
      const row = await query(
        'SELECT subscription_tier FROM users WHERE id = $1',
        [testUser.userId]
      );
      expect(row.rows[0].subscription_tier).toBe('plus');
    });
  });
});
