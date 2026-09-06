// Disposable local-cluster rehearsal. Never import application startup or .env.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { listingAccessSql } from '../src/utils/sharingPolicy.js';

const connectionString = process.env.PRIVACY_TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : null;
if (!target || !['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || target.pathname !== '/borrowhood_privacy_test' || target.search || target.hash
    || process.env.PRIVACY_TEST_FRESH_CLUSTER !== 'yes') {
  console.error('Not run: use npm run test:privacy:local -- --migrations to create a disposable local cluster.');
  process.exit(2);
}
const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 3000 });
let pool;
try {
  await client.connect();
  const existing = await client.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public'");
  assert.equal(existing.rows.length, 0, 'Refusing to migrate a nonempty database.');
  // Reconstruct the checked-in PostGIS baseline. This does not claim parity with
  // production's current schema. Skip the historical demo-password data change.
  const dir = new URL('../migrations/', import.meta.url);
  const files = (await readdir(dir)).filter(file => /^\d{3}_.*\.sql$/.test(file) && !file.startsWith('011_')).sort();
  for (const file of files) {
    console.log(`Rehearsing ${file}`);
    await client.query(await readFile(new URL(file, dir), 'utf8'));
  }
  const owner = '10000000-0000-4000-8000-000000000001';
  const neighbor = '10000000-0000-4000-8000-000000000002';
  for (const [id, name] of [[owner, 'Owner'], [neighbor, 'Neighbor']]) {
    await client.query(`INSERT INTO users (id, email, first_name, last_name, city, state)
      VALUES ($1, $2, $3, 'Test', 'Upton', 'MA')`, [id, `${name}@example.invalid`, name]);
  }
  const legacy = (await client.query(`INSERT INTO listings (owner_id, title, condition, is_free, visibility)
    VALUES ($1, 'Legacy test item', 'good', true, 'town') RETURNING id`, [owner])).rows[0].id;
  process.env.DATABASE_URL = connectionString;
  process.env.NODE_ENV = 'test';
  ({ pool } = await import('../src/utils/db.js'));
  const { logger } = await import('../src/utils/logger.js');
  const errors = [];
  const originalError = logger.error.bind(logger);
  logger.error = (...args) => { errors.push(args); return originalError(...args); };
  const { runMigrations } = await import('../src/utils/migrations.js');
  await runMigrations();
  assert.equal(errors.length, 0, 'Runtime migrations logged errors.');
  await client.query('UPDATE users SET is_verified = true');
  const result = await client.query(`SELECT privacy_version,
    ${listingAccessSql('l', '$2')} AS owner_access,
    ${listingAccessSql('l', '$3')} AS neighbor_access FROM listings l WHERE id = $1`, [legacy, owner, neighbor]);
  assert.deepEqual(result.rows[0], { privacy_version: 0, owner_access: true, neighbor_access: false });
  const fresh = (await client.query(`INSERT INTO listings (owner_id, title, condition, is_free)
    VALUES ($1, 'New test item', 'good', true) RETURNING visibility`, [owner])).rows[0];
  assert.equal(fresh.visibility, 'private');
  const indexes = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    AND indexname IN ('idx_transactions_due', 'idx_transactions_overdue')`);
  assert.equal(indexes.rows.length, 2, 'Borrow due-date indexes must survive the enum conversion.');
  await runMigrations();
  assert.equal(errors.length, 0, 'Repeated runtime migrations logged errors.');
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM listings')).rows[0].count, 2);
  console.log('Passed: schema reconstruction, privacy migration, private default, legacy protection, and repeat migration.');
  const { runPrivacyHttpChecks } = await import('./privacy-http-checks.js');
  await runPrivacyHttpChecks(client, owner, neighbor);
} catch (error) {
  console.error(`Migration rehearsal failed: ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
  if (pool) await pool.end();
}
