import { query } from './db.js';
import { logger } from './logger.js';

/**
 * Run pending migrations on server startup
 */
export async function runMigrations() {
  try {
    logger.info('Checking for pending migrations...');

    // Migration: Add status column to friendships for friend request flow
    const hasStatus = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'friendships' AND column_name = 'status'
    `);

    if (hasStatus.rows.length === 0) {
      logger.info('Running migration: Add status to friendships');
      await query(`ALTER TABLE friendships ADD COLUMN status VARCHAR(20) DEFAULT 'accepted'`);
      await query(`UPDATE friendships SET status = 'accepted' WHERE status IS NULL`);
      await query(`CREATE INDEX IF NOT EXISTS idx_friendships_pending ON friendships(friend_id, status) WHERE status = 'pending'`);
      logger.info('Migration complete: friendships.status added');
    }

    logger.info('Migrations check complete');
  } catch (err) {
    logger.error('Migration error:', err);
    // Don't crash the server on migration errors - log and continue
  }
}
