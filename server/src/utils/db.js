import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import logger from './logger.js';

const { Pool } = pg;

const context = new AsyncLocalStorage();
const positiveInteger = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
function createPool(max, name) {
  const value = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    statement_timeout: 15000, idle_in_transaction_session_timeout: 30000,
    application_name: `borrowhood-${name}`,
  });
  value.on('error', error => logger.error('Database connection failed', { pool: name, code: error.code || 'unknown' }));
  return value;
}
export const pool = createPool(positiveInteger(process.env.DATABASE_POOL_MAX, 10), 'api');
let backgroundPool;
export function withBackgroundDatabase(callback) {
  backgroundPool ||= createPool(positiveInteger(process.env.BACKGROUND_DATABASE_POOL_MAX, 8), 'jobs');
  return context.run(backgroundPool, callback);
}
export function databasePoolMetrics() {
  const stats = value => ({ total: value?.totalCount || 0, idle: value?.idleCount || 0, waiting: value?.waitingCount || 0 });
  return { api: stats(pool), jobs: stats(backgroundPool) };
}
export async function closeDatabase() {
  await Promise.all([pool.end(), backgroundPool?.end()]);
}

// Helper for single queries
export async function query(text, params) {
  const start = Date.now();
  const result = await (context.getStore() || pool).query(text, params);
  const duration = Date.now() - start;
  if (duration > 100) {
    logger.warn('Slow database query', { durationMs: duration, rows: result.rowCount });
  }
  return result;
}

// Helper for transactions
export async function withTransaction(callback) {
  const client = await (context.getStore() || pool).connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export default { pool, query, withTransaction };
