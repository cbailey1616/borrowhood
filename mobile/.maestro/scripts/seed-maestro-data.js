#!/usr/bin/env node

/**
 * Maestro Test Data Seeder
 *
 * Seeds 3 test users via POST /api/auth/register (to get real bcrypt hashes),
 * then promotes them via direct DB queries for subscription_tier and status.
 * Creates test listings owned by the verified user.
 * Writes credentials to .test-credentials.json for Maestro flows.
 *
 * Usage:
 *   node .maestro/scripts/seed-maestro-data.js
 *
 * Requires the server to be running on API_BASE (default http://localhost:3001).
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
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://chrisbailey@localhost:5432/borrowhood';
// SWITCH TO LIVE KEYS ONLY FOR APP STORE RELEASE
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const TEST_PASSWORD = 'MaestroTest123!';

const USERS = [
  {
    email: 'maestro-free@borrowhood.test',
    firstName: 'Maestro',
    lastName: 'Free',
    subscriptionTier: 'free',
    status: 'pending',
    key: 'freeUser',
  },
  {
    email: 'maestro-plus@borrowhood.test',
    firstName: 'Maestro',
    lastName: 'Plus',
    subscriptionTier: 'plus',
    status: 'pending',
    key: 'plusUser',
  },
  {
    email: 'maestro-verified@borrowhood.test',
    firstName: 'Maestro',
    lastName: 'Verified',
    subscriptionTier: 'plus',
    status: 'verified',
    key: 'verifiedUser',
  },
];

const LISTINGS = [
  {
    title: 'Maestro Free Drill',
    description: 'A free drill for Maestro E2E testing',
    condition: 'good',
    isFree: true,
    pricePerDay: 0,
    depositAmount: 0,
    lateFeePerDay: 0,
    minDuration: 1,
    maxDuration: 14,
    visibility: 'close_friends',
  },
  {
    title: 'Maestro Rental Camera',
    description: 'A rental camera for Maestro E2E testing',
    condition: 'good',
    isFree: false,
    pricePerDay: 10.0,
    depositAmount: 50.0,
    lateFeePerDay: 5.0,
    minDuration: 1,
    maxDuration: 14,
    visibility: 'neighborhood',
  },
  {
    title: 'Maestro Town Power Washer',
    description: 'A town-wide power washer for Maestro E2E testing',
    condition: 'good',
    isFree: false,
    pricePerDay: 25.0,
    depositAmount: 100.0,
    lateFeePerDay: 10.0,
    minDuration: 1,
    maxDuration: 14,
    visibility: 'town',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: DATABASE_URL });

let stripe = null;
if (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  stripe = new Stripe(STRIPE_SECRET_KEY);
}

async function query(text, params) {
  return pool.query(text, params);
}

async function registerUser(user) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      password: TEST_PASSWORD,
      firstName: user.firstName,
      lastName: user.lastName,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // If the user already exists, that is fine -- we will just look them up
    if (res.status === 400 && body.includes('already registered')) {
      console.log(`  User ${user.email} already exists, reusing.`);
      const existing = await query('SELECT id FROM users WHERE email = $1', [user.email]);
      if (existing.rows.length === 0) {
        throw new Error(`User ${user.email} reported as existing but not found in DB`);
      }
      return { userId: existing.rows[0].id, alreadyExisted: true };
    }
    throw new Error(`Register ${user.email} failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return {
    userId: data.user.id,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    alreadyExisted: false,
  };
}

async function promoteUser(userId, { subscriptionTier, status }) {
  await query(
    'UPDATE users SET subscription_tier = $1, status = $2 WHERE id = $3',
    [subscriptionTier, status, userId]
  );
}

async function createStripeCustomerForUser(userId, email) {
  if (!stripe) return null;
  try {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId, env: 'maestro-test' },
    });
    await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customer.id, userId]);
    return customer.id;
  } catch (err) {
    console.warn(`  Stripe customer creation skipped for ${email}: ${err.message}`);
    return null;
  }
}

async function createConnectAccountForUser(userId, email) {
  if (!stripe) return null;
  try {
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
        first_name: 'Maestro',
        last_name: 'Verified',
        dob: { day: 1, month: 1, year: 1990 },
        address: {
          line1: '123 Test St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94103',
          country: 'US',
        },
        ssn_last_4: '0000',
        phone: '0000000000',
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
        routing_number: '110000000',
        account_number: '000123456789',
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: '127.0.0.1',
      },
      metadata: { userId, env: 'maestro-test' },
    });
    await query('UPDATE users SET stripe_connect_account_id = $1 WHERE id = $2', [account.id, userId]);
    return account.id;
  } catch (err) {
    console.warn(`  Connect account creation skipped for ${email}: ${err.message}`);
    return null;
  }
}

async function createListing(ownerId, listing) {
  const result = await query(
    `INSERT INTO listings (
      owner_id, title, description, condition,
      is_free, price_per_day, deposit_amount,
      min_duration, max_duration, late_fee_per_day,
      visibility, status, is_available
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', true)
    RETURNING id`,
    [
      ownerId,
      listing.title,
      listing.description,
      listing.condition,
      listing.isFree,
      listing.pricePerDay,
      listing.depositAmount,
      listing.minDuration,
      listing.maxDuration,
      listing.lateFeePerDay,
      listing.visibility,
    ]
  );
  return result.rows[0].id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Maestro Test Data Seeder ===\n');
  console.log(`API_BASE:     ${API_BASE}`);
  console.log(`DATABASE_URL: ${DATABASE_URL.replace(/\/\/.*@/, '//<redacted>@')}`);
  console.log(`Stripe:       ${stripe ? 'enabled' : 'disabled (no sk_test_ key)'}\n`);

  const credentials = {
    password: TEST_PASSWORD,
    users: {},
    listings: {},
  };

  // ---- Register and promote users ----
  for (const user of USERS) {
    console.log(`Registering ${user.email}...`);
    const result = await registerUser(user);
    console.log(`  userId: ${result.userId}`);

    // Promote subscription tier and status
    await promoteUser(result.userId, {
      subscriptionTier: user.subscriptionTier,
      status: user.status,
    });
    console.log(`  promoted: tier=${user.subscriptionTier}, status=${user.status}`);

    // Create Stripe customer
    const stripeCustomerId = await createStripeCustomerForUser(result.userId, user.email);
    if (stripeCustomerId) {
      console.log(`  stripeCustomerId: ${stripeCustomerId}`);
    }

    // Create Connect account for the verified user
    let connectAccountId = null;
    if (user.key === 'verifiedUser') {
      connectAccountId = await createConnectAccountForUser(result.userId, user.email);
      if (connectAccountId) {
        console.log(`  connectAccountId: ${connectAccountId}`);
      }
    }

    credentials.users[user.key] = {
      userId: result.userId,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      status: user.status,
      accessToken: result.accessToken || null,
      refreshToken: result.refreshToken || null,
      stripeCustomerId: stripeCustomerId || null,
      connectAccountId: connectAccountId || null,
    };
  }

  // ---- Create test listings owned by the verified user ----
  const verifiedUserId = credentials.users.verifiedUser.userId;
  console.log('\nCreating test listings...');

  const listingIds = [];
  for (const listing of LISTINGS) {
    const id = await createListing(verifiedUserId, listing);
    listingIds.push(id);
    console.log(`  "${listing.title}" -> id=${id}`);
  }

  credentials.listings = {
    freeDrill: listingIds[0],
    rentalCamera: listingIds[1],
    townPowerWasher: listingIds[2],
  };

  // ---- Write credentials file ----
  const credentialsPath = path.join(__dirname, '.test-credentials.json');
  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2) + '\n');
  console.log(`\nCredentials written to ${credentialsPath}`);

  console.log('\n=== Seed complete ===');
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
