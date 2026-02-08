#!/usr/bin/env node

/**
 * Pre-Deployment Checklist for BorrowHood Server
 *
 * Validates that the production environment is properly configured
 * before deploying. Run with: npm run pre-deploy
 *
 * Checks:
 * 1. Environment variables are set
 * 2. Stripe keys match the target environment
 * 3. Database is reachable
 * 4. Stripe API is reachable
 * 5. Webhook secret is configured
 * 6. All required Stripe products/prices exist
 */

import 'dotenv/config';
import Stripe from 'stripe';

const isProduction = process.env.NODE_ENV === 'production';
const env = process.env.NODE_ENV || 'development';

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
  passed++;
}

function fail(msg) {
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  failed++;
}

function warn(msg) {
  console.log(`  \x1b[33m⚠\x1b[0m ${msg}`);
  warnings++;
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ============================================
// 1. Required Environment Variables
// ============================================
section('1. Environment Variables');

const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

const optional = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET',
  'ANTHROPIC_API_KEY',
  'APP_URL',
];

for (const key of required) {
  if (process.env[key]) {
    pass(`${key} is set`);
  } else {
    fail(`${key} is MISSING`);
  }
}

for (const key of optional) {
  if (process.env[key]) {
    pass(`${key} is set`);
  } else {
    warn(`${key} is not set (optional)`);
  }
}

// ============================================
// 2. Stripe Key Validation
// ============================================
section('2. Stripe Key Validation');

const secretKey = process.env.STRIPE_SECRET_KEY || '';
const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

if (isProduction) {
  // Production: must use live keys
  if (secretKey.startsWith('sk_live_')) {
    pass('Secret key is LIVE mode');
  } else if (secretKey.startsWith('sk_test_')) {
    fail('Secret key is TEST mode — must use live keys in production!');
  } else {
    fail('Secret key has unexpected format');
  }

  if (publishableKey.startsWith('pk_live_')) {
    pass('Publishable key is LIVE mode');
  } else {
    fail('Publishable key is not LIVE mode');
  }
} else {
  // Non-production: must use test keys
  if (secretKey.startsWith('sk_test_')) {
    pass('Secret key is TEST mode (correct for non-production)');
  } else if (secretKey.startsWith('sk_live_')) {
    fail('Secret key is LIVE mode — NEVER use live keys outside production!');
  } else {
    fail('Secret key has unexpected format');
  }

  if (publishableKey.startsWith('pk_test_')) {
    pass('Publishable key is TEST mode');
  } else {
    warn('Publishable key format check — verify it matches test environment');
  }
}

if (webhookSecret.startsWith('whsec_')) {
  pass('Webhook secret has correct format');
} else {
  fail('Webhook secret has incorrect format (should start with whsec_)');
}

// ============================================
// 3. Database Connectivity
// ============================================
section('3. Database Connectivity');

try {
  const { query } = await import('../src/utils/db.js');
  const result = await query('SELECT NOW() as time, current_database() as db');
  pass(`Connected to database: ${result.rows[0].db}`);

  // Check required tables exist
  const tables = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  const tableNames = tables.rows.map(r => r.table_name);

  const requiredTables = [
    'users', 'listings', 'borrow_transactions',
    'subscription_history', 'friendships',
  ];

  for (const table of requiredTables) {
    if (tableNames.includes(table)) {
      pass(`Table '${table}' exists`);
    } else {
      fail(`Table '${table}' is MISSING — run migrations`);
    }
  }
} catch (err) {
  fail(`Database connection failed: ${err.message}`);
}

// ============================================
// 4. Stripe API Connectivity
// ============================================
section('4. Stripe API Connectivity');

try {
  const stripe = new Stripe(secretKey);

  // Test basic API access
  const balance = await stripe.balance.retrieve();
  pass(`Stripe API reachable (balance currency: ${balance.available[0]?.currency || 'usd'})`);

  // Verify product exists
  try {
    const product = await stripe.products.retrieve('prod_TwAqSD3Joum5jh');
    pass(`Plus subscription product exists: ${product.name}`);
  } catch (err) {
    if (err.code === 'resource_missing') {
      fail('Plus subscription product (prod_TwAqSD3Joum5jh) not found — create it in Stripe Dashboard');
    } else {
      warn(`Could not verify product: ${err.message}`);
    }
  }

  // Check webhook endpoints (if accessible)
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 10 });
    if (endpoints.data.length > 0) {
      pass(`${endpoints.data.length} webhook endpoint(s) configured`);
      for (const ep of endpoints.data) {
        const status = ep.status === 'enabled' ? '\x1b[32menabled\x1b[0m' : '\x1b[31m' + ep.status + '\x1b[0m';
        console.log(`    → ${ep.url} (${status})`);
      }
    } else {
      warn('No webhook endpoints configured — set up in Stripe Dashboard');
    }
  } catch (err) {
    warn(`Could not list webhook endpoints: ${err.message}`);
  }
} catch (err) {
  fail(`Stripe API connection failed: ${err.message}`);
}

// ============================================
// 5. Security Checks
// ============================================
section('5. Security Checks');

// JWT secrets should be sufficiently long
const jwtSecret = process.env.JWT_SECRET || '';
const jwtRefresh = process.env.JWT_REFRESH_SECRET || '';

if (jwtSecret.length >= 32) {
  pass('JWT_SECRET is sufficiently long (32+ chars)');
} else {
  warn(`JWT_SECRET is only ${jwtSecret.length} chars — consider using 32+ chars`);
}

if (jwtRefresh.length >= 32) {
  pass('JWT_REFRESH_SECRET is sufficiently long');
} else {
  warn(`JWT_REFRESH_SECRET is only ${jwtRefresh.length} chars`);
}

// JWT secret should be different from refresh secret
if (jwtSecret && jwtRefresh && jwtSecret !== jwtRefresh) {
  pass('JWT_SECRET and JWT_REFRESH_SECRET are different');
} else if (jwtSecret === jwtRefresh) {
  fail('JWT_SECRET and JWT_REFRESH_SECRET are the SAME — use different secrets');
}

// Ensure NODE_ENV is set in production
if (isProduction && process.env.NODE_ENV === 'production') {
  pass('NODE_ENV is set to production');
} else if (isProduction) {
  fail('NODE_ENV is not set to production');
} else {
  pass(`NODE_ENV is ${env} (non-production)`);
}

// ============================================
// Summary
// ============================================
console.log('\n' + '='.repeat(50));
console.log(`\x1b[1mPre-Deploy Results (${env})\x1b[0m`);
console.log(`  \x1b[32m${passed} passed\x1b[0m`);
if (failed > 0) console.log(`  \x1b[31m${failed} failed\x1b[0m`);
if (warnings > 0) console.log(`  \x1b[33m${warnings} warnings\x1b[0m`);
console.log('='.repeat(50));

if (failed > 0) {
  console.log(`\n\x1b[31mDEPLOY BLOCKED: Fix ${failed} failing check(s) before deploying.\x1b[0m\n`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`\n\x1b[33mDEPLOY OK with ${warnings} warning(s). Review before deploying.\x1b[0m\n`);
  process.exit(0);
} else {
  console.log(`\n\x1b[32mAll checks passed. Ready to deploy!\x1b[0m\n`);
  process.exit(0);
}
