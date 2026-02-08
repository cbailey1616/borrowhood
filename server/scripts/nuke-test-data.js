import 'dotenv/config';
import readline from 'readline';
import { pool, query } from '../src/utils/db.js';

// ---------------------------------------------------------------------------
// Safety Guards
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') {
  console.error('FATAL: This script refuses to run in production.');
  console.error('Set NODE_ENV to "development" or "test" to proceed.');
  process.exit(1);
}

const args = process.argv.slice(2);
const hasConfirm = args.includes('--confirm');
const hasStripe = args.includes('--stripe');

if (!hasConfirm) {
  console.error('Usage: node scripts/nuke-test-data.js --confirm [--stripe]');
  console.error('');
  console.error('  --confirm   Required. Confirms you want to delete all data.');
  console.error('  --stripe    Optional. Also deletes all Stripe test customers,');
  console.error('              subscriptions, and Connect accounts.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Interactive confirmation
// ---------------------------------------------------------------------------

async function promptConfirmation() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║  THIS WILL DELETE ALL DATA INCLUDING USER ACCOUNTS   ║');
    console.log('║  This action is IRREVERSIBLE.                        ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');
    rl.question('Type "DELETE EVERYTHING" to proceed: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Stripe cleanup
// ---------------------------------------------------------------------------

async function nukeStripe() {
  // SWITCH TO LIVE KEYS ONLY FOR APP STORE RELEASE
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || !stripeKey.startsWith('sk_test_')) {
    console.log('  Skipping Stripe: no sk_test_ key found in environment.');
    return;
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeKey);

  // Cancel all active subscriptions
  console.log('\n--- Stripe: Cancelling subscriptions ---');
  let subCount = 0;
  let hasMore = true;
  let startingAfter;
  while (hasMore) {
    const params = { limit: 100, status: 'active' };
    if (startingAfter) params.starting_after = startingAfter;
    const subs = await stripe.subscriptions.list(params);
    for (const sub of subs.data) {
      await stripe.subscriptions.cancel(sub.id);
      console.log(`  Cancelled subscription ${sub.id}`);
      subCount++;
    }
    hasMore = subs.has_more;
    if (subs.data.length > 0) startingAfter = subs.data[subs.data.length - 1].id;
  }
  console.log(`  Total subscriptions cancelled: ${subCount}`);

  // Delete all customers
  console.log('\n--- Stripe: Deleting customers ---');
  let custCount = 0;
  hasMore = true;
  startingAfter = undefined;
  while (hasMore) {
    const params = { limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;
    const customers = await stripe.customers.list(params);
    for (const cust of customers.data) {
      try {
        await stripe.customers.del(cust.id);
        console.log(`  Deleted customer ${cust.id} (${cust.email || 'no email'})`);
        custCount++;
      } catch (e) {
        console.log(`  Failed to delete customer ${cust.id}: ${e.message}`);
      }
    }
    hasMore = customers.has_more;
    if (customers.data.length > 0) startingAfter = customers.data[customers.data.length - 1].id;
  }
  console.log(`  Total customers deleted: ${custCount}`);

  // Delete all Connect accounts
  console.log('\n--- Stripe: Deleting Connect accounts ---');
  let acctCount = 0;
  hasMore = true;
  startingAfter = undefined;
  while (hasMore) {
    const params = { limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;
    const accounts = await stripe.accounts.list(params);
    for (const acct of accounts.data) {
      try {
        await stripe.accounts.del(acct.id);
        console.log(`  Deleted Connect account ${acct.id} (${acct.email || 'no email'})`);
        acctCount++;
      } catch (e) {
        console.log(`  Failed to delete account ${acct.id}: ${e.message}`);
      }
    }
    hasMore = accounts.has_more;
    if (accounts.data.length > 0) startingAfter = accounts.data[accounts.data.length - 1].id;
  }
  console.log(`  Total Connect accounts deleted: ${acctCount}`);
}

// ---------------------------------------------------------------------------
// Database wipe
// ---------------------------------------------------------------------------

// Tables in dependency order (children first, parents last).
// Seed/reference tables (categories, badge_definitions, etc.) are wiped too,
// then re-seeded by running migrations.
const TABLES = [
  // Messaging
  'messages',
  'conversation_participants',
  'conversations',
  // Ratings & disputes
  'ratings',
  'disputes',
  // Transactions & payments
  'rto_payments',
  'rto_contracts',
  'borrow_transactions',
  // Listings & related
  'listing_discussions',
  'listing_availability',
  'listing_photos',
  'bundle_items',
  'bundles',
  'item_requests',
  'listings',
  // Lending circles
  'lending_circle_members',
  'lending_circles',
  // Community
  'community_library_items',
  'community_memberships',
  // Notifications & audit
  'notifications',
  'audit_log',
  // Subscriptions
  'subscription_history',
  'subscription_pricing',
  // User badges
  'user_badges',
  'badge_definitions',
  // Seasonal categories
  'seasonal_categories',
  // Social / friends
  'friendships',
  // Categories (seed data)
  'categories',
  // Communities
  'communities',
  // Users (last — everything references this)
  'users',
];

async function nukeDatabase() {
  console.log('\n--- Database: Wiping all tables ---');
  console.log(`Database: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, '//<redacted>@')}`);
  console.log('');

  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const result = await query(`DELETE FROM ${table}`);
      const count = result.rowCount || 0;
      totalRows += count;
      if (count > 0) {
        console.log(`  ${table}: deleted ${count} row(s)`);
      } else {
        console.log(`  ${table}: empty`);
      }
    } catch (e) {
      if (e.message.includes('does not exist')) {
        console.log(`  ${table}: table does not exist (skipped)`);
      } else {
        console.log(`  ${table}: ERROR - ${e.message}`);
      }
    }
  }

  // Reset sequences (auto-increment IDs) back to 1
  console.log('\n--- Database: Resetting sequences ---');
  const seqResult = await query(`
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  `);

  for (const row of seqResult.rows) {
    try {
      await query(`ALTER SEQUENCE ${row.sequence_name} RESTART WITH 1`);
      console.log(`  Reset ${row.sequence_name} → 1`);
    } catch (e) {
      console.log(`  ${row.sequence_name}: ERROR - ${e.message}`);
    }
  }

  console.log(`\nTotal rows deleted: ${totalRows}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== BorrowHood Full Data Nuke ===');
  console.log(`NODE_ENV: ${process.env.NODE_ENV || '(not set)'}`);
  console.log(`Stripe cleanup: ${hasStripe ? 'YES' : 'no (use --stripe to enable)'}`);

  const answer = await promptConfirmation();
  if (answer !== 'DELETE EVERYTHING') {
    console.log('\nAborted. No data was deleted.');
    process.exit(0);
  }

  console.log('\nProceeding with full data wipe...');

  // Stripe cleanup first (before DB wipe, so we can read Stripe IDs)
  if (hasStripe) {
    await nukeStripe();
  }

  // Database wipe
  await nukeDatabase();

  console.log('\n=== Nuke complete ===');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Re-run migrations to restore seed data (categories, badges, etc.):');
  console.log('     node scripts/migrate.js');
  console.log('  2. Verify Stripe Dashboard products/prices still exist');
  console.log('  3. Deploy fresh build to TestFlight');
}

main()
  .catch((err) => {
    console.error('\nNuke failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
