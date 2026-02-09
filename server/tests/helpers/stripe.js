/**
 * Stripe Test Helpers
 * Test card numbers, bank accounts, and shared test utilities.
 * See: https://docs.stripe.com/testing
 */

// ============================================
// Test Card Numbers
// ============================================

export const TEST_CARDS = {
  SUCCESS:           '4242424242424242',
  DECLINED:          '4000000000000002',
  INSUFFICIENT:      '4000000000009995',
  THREE_D_SECURE:    '4000002500003155',
  PROCESSING_ERROR:  '4000000000000119',
  EXPIRED:           '4000000000000069',
  INCORRECT_CVC:     '4000000000000127',
  FRAUD_BLOCK:       '4100000000000019',
  DISPUTE:           '4000000000000259',
};

// ============================================
// Test Tokens (use instead of raw card numbers)
// See: https://docs.stripe.com/testing#tokens
// ============================================

export const TEST_TOKENS = {
  SUCCESS:           'tok_visa',
  DECLINED:          'tok_chargeDeclined',
  INSUFFICIENT:      'tok_chargeDeclinedInsufficientFunds',
  THREE_D_SECURE:    'tok_threeDSecure2Required',
  PROCESSING_ERROR:  'tok_chargeDeclinedProcessingError',
  EXPIRED:           'tok_chargeDeclinedExpiredCard',
  INCORRECT_CVC:     'tok_chargeDeclinedIncorrectCvc',
  FRAUD_BLOCK:       'tok_chargeDeclinedFraudulent',
  DISPUTE:           'tok_createDispute',
};

// ============================================
// Test Bank Account (for Connect)
// ============================================

export const TEST_BANK = {
  ACCOUNT_NUMBER:  '000123456789',
  ROUTING_NUMBER:  '110000000',
};

// ============================================
// Default Card Details
// ============================================

export const DEFAULT_CARD = {
  number:    TEST_CARDS.SUCCESS,
  exp_month: 12,
  exp_year:  2030,
  cvc:       '123',
};

// ============================================
// Shared Test Utilities
// ============================================

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '../../src/utils/db.js';
import Stripe from 'stripe';

// SWITCH TO LIVE KEYS ONLY FOR APP STORE RELEASE
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a test user in the database and return their ID + JWT token.
 */
export async function createTestUser(overrides = {}) {
  const email = overrides.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const defaults = {
    firstName: 'Test',
    lastName: 'User',
    status: 'pending',
    subscriptionTier: 'free',
    isVerified: false,
    city: 'TestCity',
    state: 'TS',
  };
  const opts = { ...defaults, ...overrides };

  const result = await query(
    `INSERT INTO users (
      email, password_hash, first_name, last_name, status,
      subscription_tier, is_verified, city, state
    ) VALUES ($1, 'test_hash', $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [email, opts.firstName, opts.lastName, opts.status, opts.subscriptionTier, opts.isVerified, opts.city, opts.state]
  );

  const userId = result.rows[0].id;
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

  return { userId, token, email };
}

/**
 * Create a Stripe customer for a test user.
 */
export async function createTestCustomer(userId, email) {
  const customer = await stripe.customers.create({
    email,
    metadata: { userId, env: 'test' },
  });

  await query(
    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
    [customer.id, userId]
  );

  return customer;
}

/**
 * Attach a test payment method to a customer.
 * Uses test tokens (not raw card numbers) — see https://docs.stripe.com/testing#tokens
 */
export async function attachTestPaymentMethod(customerId, token = TEST_TOKENS.SUCCESS) {
  const paymentMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: { token },
  });

  await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId });

  // Set as default
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });

  return paymentMethod;
}

/**
 * Create a test listing owned by a user.
 */
export async function createTestListing(ownerId, overrides = {}) {
  const defaults = {
    title: 'Test Item',
    description: 'A test item for automated testing',
    condition: 'good',
    isFree: false,
    pricePerDay: 10.00,
    depositAmount: 50.00,
    minDuration: 1,
    maxDuration: 14,
    lateFeePerDay: 5.00,
    visibility: 'close_friends',
  };
  const opts = { ...defaults, ...overrides };

  const result = await query(
    `INSERT INTO listings (
      owner_id, title, description, condition,
      is_free, price_per_day, deposit_amount,
      min_duration, max_duration, late_fee_per_day,
      visibility, status, is_available
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', true)
    RETURNING id`,
    [
      ownerId, opts.title, opts.description, opts.condition,
      opts.isFree, opts.pricePerDay, opts.depositAmount,
      opts.minDuration, opts.maxDuration, opts.lateFeePerDay,
      opts.visibility,
    ]
  );

  return result.rows[0].id;
}

/**
 * Create a Stripe Connect account for a test user.
 * Uses Custom type so capabilities activate immediately in test mode.
 */
export async function createTestConnectAccount(userId, email) {
  const account = await stripe.accounts.create({
    type: 'custom',
    country: 'US',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
    individual: {
      first_name: 'Test',
      last_name: 'User',
      dob: { day: 1, month: 1, year: 1990 },
      address: { line1: '123 Test St', city: 'San Francisco', state: 'CA', postal_code: '94103', country: 'US' },
      ssn_last_4: '0000',
      id_number: '000000000',
      phone: '+15555550100',
      email,
    },
    business_profile: {
      mcc: '5734',
      url: 'https://borrowhood.com',
    },
    external_account: {
      object: 'bank_account',
      country: 'US',
      currency: 'usd',
      routing_number: TEST_BANK.ROUTING_NUMBER,
      account_number: TEST_BANK.ACCOUNT_NUMBER,
    },
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: '127.0.0.1',
    },
    metadata: { userId, env: 'test' },
  });

  await query(
    'UPDATE users SET stripe_connect_account_id = $1 WHERE id = $2',
    [account.id, userId]
  );

  return account;
}

/**
 * Clean up a test user and all associated Stripe resources.
 */
export async function cleanupTestUser(userId) {
  // Get Stripe IDs before deleting
  const result = await query(
    'SELECT stripe_customer_id, stripe_connect_account_id, stripe_subscription_id FROM users WHERE id = $1',
    [userId]
  );
  const user = result.rows[0];

  // Cancel Stripe subscription if active
  if (user?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(user.stripe_subscription_id);
    } catch (e) { /* already cancelled */ }
  }

  // Delete Stripe customer (cascades payment methods)
  if (user?.stripe_customer_id) {
    try {
      await stripe.customers.del(user.stripe_customer_id);
    } catch (e) { /* already deleted */ }
  }

  // Delete Connect account
  if (user?.stripe_connect_account_id) {
    try {
      await stripe.accounts.del(user.stripe_connect_account_id);
    } catch (e) { /* already deleted */ }
  }

  // Clean up DB
  await query('DELETE FROM subscription_history WHERE user_id = $1', [userId]);
  await query('DELETE FROM borrow_transactions WHERE borrower_id = $1 OR lender_id = $1', [userId]);
  await query('DELETE FROM listings WHERE owner_id = $1', [userId]);
  await query('DELETE FROM users WHERE id = $1', [userId]);
}

/**
 * Build a mock webhook event payload for testing.
 */
export function buildWebhookPayload(eventType, data, eventId = null) {
  return {
    id: eventId || `evt_test_${Date.now()}`,
    object: 'event',
    type: eventType,
    data: {
      object: data,
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    api_version: '2024-06-20',
  };
}

/**
 * Sign a webhook payload using the webhook secret for testing.
 */
export function signWebhookPayload(payload, secret) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payloadString}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Ensure a Stripe product exists for Plus subscriptions.
 * Creates it if needed, sets process.env.STRIPE_PRODUCT_PLUS.
 */
export async function ensureStripePlusProduct() {
  // Check if we already have a product ID set
  if (process.env.STRIPE_PRODUCT_PLUS && process.env.STRIPE_PRODUCT_PLUS !== 'price_unused') {
    try {
      await stripe.products.retrieve(process.env.STRIPE_PRODUCT_PLUS);
      return process.env.STRIPE_PRODUCT_PLUS;
    } catch (e) { /* product doesn't exist, create it */ }
  }

  // Search for existing test product
  const existing = await stripe.products.list({ limit: 10 });
  const found = existing.data.find(p => p.name === 'BorrowHood Plus' && p.active);
  if (found) {
    process.env.STRIPE_PRODUCT_PLUS = found.id;
    return found.id;
  }

  // Create the product
  const product = await stripe.products.create({
    name: 'BorrowHood Plus',
    description: 'Unlock your whole town — browse and rent from anyone',
    metadata: { env: 'test' },
  });
  process.env.STRIPE_PRODUCT_PLUS = product.id;
  return product.id;
}

/**
 * Create an Express test app instance with the specified routes.
 */
export async function createTestApp(...routeConfigs) {
  const { default: express } = await import('express');
  const app = express();

  // Webhook routes need raw body
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json());

  for (const config of routeConfigs) {
    const { path, module } = config;
    const { default: routes } = await import(module);
    app.use(path, routes);
  }

  return app;
}

/**
 * Create a test category in the database.
 */
export async function createTestCategory(name = 'Test Category', slug = null) {
  const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
  const result = await query(
    `INSERT INTO categories (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = $1
     RETURNING id`,
    [name, categorySlug]
  );
  return result.rows[0].id;
}

/**
 * Clean up a list of test resources by type.
 * @param {Array<{type: string, id: string}>} resources
 */
export async function cleanupTestResources(resources) {
  for (const { type, id } of resources) {
    try {
      switch (type) {
        case 'community':
          await query('DELETE FROM community_memberships WHERE community_id = $1', [id]);
          await query('DELETE FROM communities WHERE id = $1', [id]);
          break;
        case 'category':
          await query('DELETE FROM categories WHERE id = $1', [id]);
          break;
        case 'listing':
          await query('DELETE FROM listing_photos WHERE listing_id = $1', [id]);
          await query('DELETE FROM saved_listings WHERE listing_id = $1', [id]);
          await query('DELETE FROM listing_discussions WHERE listing_id = $1', [id]);
          await query('DELETE FROM listings WHERE id = $1', [id]);
          break;
        case 'conversation':
          await query('DELETE FROM messages WHERE conversation_id = $1', [id]);
          await query('DELETE FROM conversations WHERE id = $1', [id]);
          break;
        case 'transaction':
          await query('DELETE FROM disputes WHERE transaction_id = $1', [id]);
          await query('DELETE FROM borrow_transactions WHERE id = $1', [id]);
          break;
        case 'notification':
          await query('DELETE FROM notifications WHERE id = $1', [id]);
          break;
        case 'friendship':
          // id is { userId, friendId }
          await query(
            `DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
            [id.userId, id.friendId]
          );
          break;
        default:
          break;
      }
    } catch (e) {
      // Best effort cleanup
    }
  }
}

export { stripe };
