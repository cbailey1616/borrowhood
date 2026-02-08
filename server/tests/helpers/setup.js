/**
 * Vitest global setup — loads .env.test for all test files,
 * runs pending migrations, and verifies test safety.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.test first (test overrides), then fallback to .env
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Safety: verify we're using test keys
const secretKey = process.env.STRIPE_SECRET_KEY || '';
if (secretKey && !secretKey.startsWith('sk_test_')) {
  console.error('\n🚨 FATAL: Non-test Stripe key detected in test environment!\n');
  process.exit(1);
}

// Run pending migrations so the schema is up to date
try {
  const { runMigrations } = await import('../../src/utils/migrations.js');
  await runMigrations();
} catch (err) {
  console.warn('Migration warning during test setup:', err.message);
}
