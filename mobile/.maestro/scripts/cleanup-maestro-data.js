#!/usr/bin/env node

/**
 * Maestro Test Data Cleanup
 *
 * Removes all maestro test data by deleting users whose email matches
 * the pattern `maestro-%@borrowhood.test`, along with their associated
 * Stripe resources (customers and Connect accounts).
 *
 * Usage:
 *   node .maestro/scripts/cleanup-maestro-data.js
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Load .env.test from the server directory
// ---------------------------------------------------------------------------
const SERVER_DIR = path.resolve(__dirname, '../../../server');
const envPath = path.join(SERVER_DIR, '.env.test');

if (fs.existsSync(envPath)) {
  const envContents = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Dependencies from server's node_modules
// ---------------------------------------------------------------------------
const { Pool } = require(path.join(SERVER_DIR, 'node_modules/pg'));
const Stripe = require(path.join(SERVER_DIR, 'node_modules/stripe')).default;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://chrisbailey@localhost:5432/borrowhood';
// SWITCH TO LIVE KEYS ONLY FOR APP STORE RELEASE
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const EMAIL_PATTERN = 'maestro-%@borrowhood.test';

const pool = new Pool({ connectionString: DATABASE_URL });

let stripe = null;
if (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  stripe = new Stripe(STRIPE_SECRET_KEY);
}

async function query(text, params) {
  return pool.query(text, params);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
async function cleanupStripeResources(user) {
  if (!stripe) return;

  // Cancel subscription if active
  if (user.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(user.stripe_subscription_id);
      console.log(`  Cancelled subscription ${user.stripe_subscription_id}`);
    } catch (e) {
      // Already cancelled or doesn't exist
    }
  }

  // Delete Stripe customer (cascades payment methods)
  if (user.stripe_customer_id) {
    try {
      await stripe.customers.del(user.stripe_customer_id);
      console.log(`  Deleted Stripe customer ${user.stripe_customer_id}`);
    } catch (e) {
      // Already deleted
    }
  }

  // Delete Connect account
  if (user.stripe_connect_account_id) {
    try {
      await stripe.accounts.del(user.stripe_connect_account_id);
      console.log(`  Deleted Connect account ${user.stripe_connect_account_id}`);
    } catch (e) {
      // Already deleted
    }
  }
}

async function cleanupUser(userId) {
  // Delete in dependency order
  await query('DELETE FROM subscription_history WHERE user_id = $1', [userId]);
  await query('DELETE FROM borrow_transactions WHERE borrower_id = $1 OR lender_id = $1', [userId]);
  await query('DELETE FROM listings WHERE owner_id = $1', [userId]);
  await query('DELETE FROM users WHERE id = $1', [userId]);
}

async function main() {
  console.log('=== Maestro Test Data Cleanup ===\n');
  console.log(`DATABASE_URL: ${DATABASE_URL.replace(/\/\/.*@/, '//<redacted>@')}`);
  console.log(`Stripe:       ${stripe ? 'enabled' : 'disabled'}`);
  console.log(`Pattern:      ${EMAIL_PATTERN}\n`);

  // Find all maestro test users
  const result = await query(
    'SELECT id, email, stripe_customer_id, stripe_connect_account_id, stripe_subscription_id FROM users WHERE email LIKE $1',
    [EMAIL_PATTERN]
  );

  if (result.rows.length === 0) {
    console.log('No maestro test users found. Nothing to clean up.');
    return;
  }

  console.log(`Found ${result.rows.length} maestro test user(s):\n`);

  for (const user of result.rows) {
    console.log(`Cleaning up ${user.email} (id=${user.id})...`);

    // Clean Stripe resources first
    await cleanupStripeResources(user);

    // Clean DB records
    await cleanupUser(user.id);
    console.log(`  Removed from database.`);
  }

  // Remove credentials file if it exists
  const credentialsPath = path.join(__dirname, '.test-credentials.json');
  if (fs.existsSync(credentialsPath)) {
    fs.unlinkSync(credentialsPath);
    console.log(`\nRemoved ${credentialsPath}`);
  }

  console.log('\n=== Cleanup complete ===');
}

main()
  .catch((err) => {
    console.error('\nCleanup failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
