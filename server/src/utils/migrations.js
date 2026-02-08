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

    // Migration: Add referral columns to users
    const hasReferralCode = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'referral_code'
    `);
    if (hasReferralCode.rows.length === 0) {
      logger.info('Running migration: Add referral columns to users');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id)');
      await query("UPDATE users SET referral_code = 'BH-' || LEFT(id::TEXT, 8) WHERE referral_code IS NULL");
      await query('CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)');
      logger.info('Migration complete: referral columns added');
    }

    // Migration: Make community_id nullable on item_requests (same as listings)
    const reqCommunityNullable = await query(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'item_requests' AND column_name = 'community_id'
    `);
    if (reqCommunityNullable.rows[0]?.is_nullable === 'NO') {
      logger.info('Running migration: Make item_requests.community_id nullable');
      await query('ALTER TABLE item_requests ALTER COLUMN community_id DROP NOT NULL');
      logger.info('Migration complete: item_requests.community_id now nullable');
    }

    // Migration: Seed categories if missing
    const categoryCount = await query('SELECT COUNT(*) FROM categories');
    if (parseInt(categoryCount.rows[0].count) <= 1) {
      logger.info('Running migration: Seed categories');
      await query(`UPDATE categories SET name = 'Tools & Hardware', slug = 'tools-hardware', icon = 'hammer-outline', sort_order = 1 WHERE slug = 'tools'`);
      await query(`INSERT INTO categories (name, slug, icon, sort_order) VALUES
        ('Tools & Hardware', 'tools-hardware', 'hammer-outline', 1),
        ('Kitchen & Cooking', 'kitchen-cooking', 'restaurant-outline', 2),
        ('Garden & Outdoor', 'garden-outdoor', 'leaf-outline', 3),
        ('Sports & Recreation', 'sports-recreation', 'football-outline', 4),
        ('Electronics & Tech', 'electronics-tech', 'laptop-outline', 5),
        ('Party & Events', 'party-events', 'gift-outline', 6),
        ('Kids & Baby', 'kids-baby', 'happy-outline', 7),
        ('Camping & Travel', 'camping-travel', 'bonfire-outline', 8),
        ('Cleaning', 'cleaning', 'sparkles-outline', 9),
        ('Other', 'other', 'ellipsis-horizontal-outline', 10)
        ON CONFLICT (slug) DO NOTHING`);
      logger.info('Migration complete: categories seeded');
    }

    // Migration: Add is_verified column to users
    const hasIsVerified = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'is_verified'
    `);
    if (hasIsVerified.rows.length === 0) {
      logger.info('Running migration: Add is_verified to users');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false');
      logger.info('Migration complete: users.is_verified added');
    }

    // Migration: Add identity verification columns to users
    const hasVerificationStatus = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'verification_status'
    `);
    if (hasVerificationStatus.rows.length === 0) {
      logger.info('Running migration: Add identity verification columns to users');
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20)");
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_identity_session_id VARCHAR(255)');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ');
      logger.info('Migration complete: identity verification columns added');
    }

    // Migration: Add expires_at column to item_requests
    const hasExpiresAt = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'item_requests' AND column_name = 'expires_at'
    `);
    if (hasExpiresAt.rows.length === 0) {
      logger.info('Running migration: Add expires_at to item_requests');
      await query('ALTER TABLE item_requests ADD COLUMN expires_at TIMESTAMPTZ');
      await query(`UPDATE item_requests SET expires_at = created_at + INTERVAL '1 day' WHERE status = 'open'`);
      logger.info('Migration complete: item_requests.expires_at added');
    }

    // Migration: Add type column to item_requests
    const hasType = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'item_requests' AND column_name = 'type'
    `);
    if (hasType.rows.length === 0) {
      logger.info('Running migration: Add type to item_requests');
      await query("ALTER TABLE item_requests ADD COLUMN type VARCHAR(10) DEFAULT 'item' NOT NULL");
      logger.info('Migration complete: item_requests.type added');
    }

    // Migration: Add request_id column to notifications
    const hasRequestId = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'notifications' AND column_name = 'request_id'
    `);
    if (hasRequestId.rows.length === 0) {
      logger.info('Running migration: Add request_id to notifications');
      await query('ALTER TABLE notifications ADD COLUMN request_id UUID REFERENCES item_requests(id) ON DELETE SET NULL');
      logger.info('Migration complete: notifications.request_id added');
    }

    // Migration: Add rental payment columns to borrow_transactions
    const hasPaymentStatus = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'borrow_transactions' AND column_name = 'payment_status'
    `);
    if (hasPaymentStatus.rows.length === 0) {
      logger.info('Running migration: Add rental payment columns');
      await query("ALTER TABLE borrow_transactions ADD COLUMN payment_status VARCHAR(30) DEFAULT 'none'");
      await query('ALTER TABLE borrow_transactions ADD COLUMN stripe_late_fee_payment_intent_id VARCHAR(255)');
      await query('ALTER TABLE borrow_transactions ADD COLUMN late_fee_amount_cents INT DEFAULT 0');
      await query('ALTER TABLE borrow_transactions ADD COLUMN damage_claim_amount_cents INT DEFAULT 0');
      await query('ALTER TABLE borrow_transactions ADD COLUMN damage_claim_notes TEXT');
      await query('ALTER TABLE borrow_transactions ADD COLUMN damage_evidence_urls TEXT[]');
      await query('ALTER TABLE listings ADD COLUMN IF NOT EXISTS late_fee_per_day DECIMAL(10,2) DEFAULT 0');
      await query(`CREATE INDEX IF NOT EXISTS idx_transactions_overdue
        ON borrow_transactions(requested_end_date, status) WHERE status = 'picked_up'`);
      logger.info('Migration complete: rental payment columns added');
    }

    // Migration: Add onboarding tracking columns to users
    const hasOnboardingStep = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'onboarding_step'
    `);
    if (hasOnboardingStep.rows.length === 0) {
      logger.info('Running migration: Add onboarding columns to users');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INT DEFAULT NULL');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false');
      await query('UPDATE users SET onboarding_completed = true WHERE city IS NOT NULL');
      logger.info('Migration complete: onboarding columns added');
    }

    logger.info('Migrations check complete');
  } catch (err) {
    logger.error('Migration error:', err);
    // Don't crash the server on migration errors - log and continue
  }
}
