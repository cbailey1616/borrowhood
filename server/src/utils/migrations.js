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

    // Migration: Add verification_grace_until column to users
    const hasGraceUntil = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'verification_grace_until'
    `);
    if (hasGraceUntil.rows.length === 0) {
      logger.info('Running migration: Add verification_grace_until to users');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_grace_until TIMESTAMPTZ');
      logger.info('Migration complete: users.verification_grace_until added');
    }

    // Migration: Add date_of_birth column to users (for pre-filling Connect onboarding)
    const hasDob = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'date_of_birth'
    `);
    if (hasDob.rows.length === 0) {
      logger.info('Running migration: Add date_of_birth to users');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE');
      logger.info('Migration complete: users.date_of_birth added');
    }

    // Migration: Add conversation_id column to notifications (for message tap navigation)
    const hasConversationId = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'notifications' AND column_name = 'conversation_id'
    `);
    if (hasConversationId.rows.length === 0) {
      logger.info('Running migration: Add conversation_id to notifications');
      await query('ALTER TABLE notifications ADD COLUMN conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL');
      logger.info('Migration complete: notifications.conversation_id added');
    }

    // Migration: Create processed_webhook_events table for idempotency
    const hasWebhookTable = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'processed_webhook_events'
    `);
    if (hasWebhookTable.rows.length === 0) {
      logger.info('Running migration: Create processed_webhook_events table');
      await query(`CREATE TABLE processed_webhook_events (
        event_id VARCHAR(255) PRIMARY KEY,
        processed_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      // Auto-clean old events after 7 days
      await query(`CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON processed_webhook_events(processed_at)`);
      logger.info('Migration complete: processed_webhook_events table created');
    }

    // Migration: Add deleted_at to messages for soft delete
    const hasDeletedAt = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'deleted_at'
    `);
    if (hasDeletedAt.rows.length === 0) {
      logger.info('Running migration: Add deleted_at to messages');
      await query('ALTER TABLE messages ADD COLUMN deleted_at TIMESTAMPTZ');
      logger.info('Migration complete: messages.deleted_at added');
    }

    // Migration: Add image_url to messages and make content nullable
    const hasImageUrl = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'image_url'
    `);
    if (hasImageUrl.rows.length === 0) {
      logger.info('Running migration: Add image_url to messages');
      await query('ALTER TABLE messages ADD COLUMN image_url TEXT');
      await query('ALTER TABLE messages ALTER COLUMN content DROP NOT NULL');
      logger.info('Migration complete: messages.image_url added, content now nullable');
    }

    // Migration: Create message_reactions table
    const hasReactionsTable = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'message_reactions'
    `);
    if (hasReactionsTable.rows.length === 0) {
      logger.info('Running migration: Create message_reactions table');
      await query(`CREATE TABLE message_reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(10) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(message_id, user_id)
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id)');
      logger.info('Migration complete: message_reactions table created');
    }

    // Migration: Add borrower_service_fee column to borrow_transactions
    const hasBorrowerServiceFee = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'borrow_transactions' AND column_name = 'borrower_service_fee'
    `);
    if (hasBorrowerServiceFee.rows.length === 0) {
      logger.info('Running migration: Add borrower_service_fee to borrow_transactions');
      await query('ALTER TABLE borrow_transactions ADD COLUMN borrower_service_fee DECIMAL(10,2) DEFAULT 0');
      logger.info('Migration complete: borrow_transactions.borrower_service_fee added');
    }

    // Migration: Add stripe_verification_payment_intent_id column to users
    const hasVerificationPI = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'stripe_verification_payment_intent_id'
    `);
    if (hasVerificationPI.rows.length === 0) {
      logger.info('Running migration: Add stripe_verification_payment_intent_id to users');
      await query('ALTER TABLE users ADD COLUMN stripe_verification_payment_intent_id VARCHAR(255)');
      logger.info('Migration complete: users.stripe_verification_payment_intent_id added');
    }

    // Migration: Enhance disputes table with claim-response workflow
    const hasClaimantUserId = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'disputes' AND column_name = 'claimant_user_id'
    `);
    if (hasClaimantUserId.rows.length === 0) {
      logger.info('Running migration: Enhance disputes table');

      // New role columns
      await query('ALTER TABLE disputes ADD COLUMN claimant_user_id UUID REFERENCES users(id)');
      await query('ALTER TABLE disputes ADD COLUMN respondent_user_id UUID REFERENCES users(id)');

      // Dispute type
      await query("ALTER TABLE disputes ADD COLUMN type VARCHAR(30) DEFAULT 'damagesClaim'");

      // Description + photos (replaces reason/evidence_urls)
      await query('ALTER TABLE disputes ADD COLUMN description TEXT');
      await query('ALTER TABLE disputes ADD COLUMN photo_urls TEXT[]');

      // Respondent fields
      await query('ALTER TABLE disputes ADD COLUMN response_description TEXT');
      await query('ALTER TABLE disputes ADD COLUMN response_photo_urls TEXT[]');
      await query('ALTER TABLE disputes ADD COLUMN responded_at TIMESTAMPTZ');

      // Financial fields
      await query('ALTER TABLE disputes ADD COLUMN requested_amount DECIMAL(10,2)');
      await query('ALTER TABLE disputes ADD COLUMN resolved_amount DECIMAL(10,2)');

      // Expired hold flag
      await query('ALTER TABLE disputes ADD COLUMN hold_expired BOOLEAN DEFAULT false');

      // Backfill from existing data
      await query('UPDATE disputes SET claimant_user_id = opened_by_id WHERE claimant_user_id IS NULL');
      await query(`
        UPDATE disputes d SET respondent_user_id = CASE
          WHEN d.opened_by_id = t.borrower_id THEN t.lender_id
          ELSE t.borrower_id
        END
        FROM borrow_transactions t
        WHERE d.transaction_id = t.id AND d.respondent_user_id IS NULL
      `);
      await query('UPDATE disputes SET description = reason WHERE description IS NULL AND reason IS NOT NULL');
      await query('UPDATE disputes SET photo_urls = evidence_urls WHERE photo_urls IS NULL AND evidence_urls IS NOT NULL');

      // Rename old status column and create new one with enhanced values
      await query('ALTER TABLE disputes RENAME COLUMN status TO old_status');
      await query("ALTER TABLE disputes ADD COLUMN status VARCHAR(40) DEFAULT 'pending'");
      await query(`
        UPDATE disputes SET status = CASE
          WHEN old_status = 'open' THEN 'pending'
          WHEN old_status = 'resolved_lender' THEN 'resolvedInFavorOfClaimant'
          WHEN old_status = 'resolved_borrower' THEN 'resolvedInFavorOfRespondent'
          WHEN old_status = 'resolved_split' THEN 'resolvedInFavorOfClaimant'
          ELSE 'pending'
        END
      `);

      // Indexes for scheduler queries
      await query("CREATE INDEX IF NOT EXISTS idx_disputes_status_created ON disputes(status, created_at) WHERE status IN ('pending', 'awaitingResponse')");
      await query('CREATE INDEX IF NOT EXISTS idx_disputes_claimant ON disputes(claimant_user_id)');
      await query('CREATE INDEX IF NOT EXISTS idx_disputes_respondent ON disputes(respondent_user_id)');

      logger.info('Migration complete: disputes table enhanced');
    }

    // Migration: Add counter_amount column to disputes
    const hasCounterAmount = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'disputes' AND column_name = 'counter_amount'
    `);
    if (hasCounterAmount.rows.length === 0) {
      logger.info('Running migration: Add counter_amount to disputes');
      await query('ALTER TABLE disputes ADD COLUMN counter_amount DECIMAL(10,2)');
      logger.info('Migration complete: counter_amount added to disputes');
    }

    // Migration: Add is_admin column to users
    const hasIsAdmin = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'is_admin'
    `);
    if (hasIsAdmin.rows.length === 0) {
      logger.info('Running migration: Add is_admin to users');
      await query('ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false');
      logger.info('Migration complete: users.is_admin added');
    }

    // Migration: Add password reset security columns to users
    const hasResetCodeHash = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'reset_code_hash'
    `);
    if (hasResetCodeHash.rows.length === 0) {
      logger.info('Running migration: Add password reset security columns');
      await query('ALTER TABLE users ADD COLUMN reset_code_hash VARCHAR(64)');
      await query('ALTER TABLE users ADD COLUMN reset_code_expires TIMESTAMPTZ');
      await query('ALTER TABLE users ADD COLUMN reset_code_attempts INT DEFAULT 0');
      await query('ALTER TABLE users ADD COLUMN reset_token_hash VARCHAR(64)');
      await query('ALTER TABLE users ADD COLUMN reset_token_expires TIMESTAMPTZ');
      await query('ALTER TABLE users ADD COLUMN token_invalidated_at TIMESTAMPTZ');
      // Sparse indexes for account lookup
      await query('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL');
      await query('CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL');
      await query('CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL');
      logger.info('Migration complete: password reset security columns added');
    }

    // Migration: Add return reminder tracking columns to borrow_transactions
    const hasReminderDayBefore = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'borrow_transactions' AND column_name = 'reminder_day_before_sent'
    `);
    if (hasReminderDayBefore.rows.length === 0) {
      logger.info('Running migration: Add return reminder columns to borrow_transactions');
      await query('ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS reminder_day_before_sent BOOLEAN DEFAULT false');
      await query('ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS reminder_day_of_sent BOOLEAN DEFAULT false');
      logger.info('Migration complete: return reminder columns added');
    }

    // Migration: Add dispute_id column to notifications (for dispute tap navigation)
    const hasDisputeId = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'notifications' AND column_name = 'dispute_id'
    `);
    if (hasDisputeId.rows.length === 0) {
      logger.info('Running migration: Add dispute_id to notifications');
      await query('ALTER TABLE notifications ADD COLUMN dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL');
      logger.info('Migration complete: notifications.dispute_id added');
    }

    // Add request_id to listing_discussions for wanted post threads
    const hasDiscussionRequestId = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'listing_discussions' AND column_name = 'request_id'
    `);
    if (hasDiscussionRequestId.rows.length === 0) {
      logger.info('Running migration: Add request_id to listing_discussions');
      await query('ALTER TABLE listing_discussions ADD COLUMN request_id UUID REFERENCES item_requests(id) ON DELETE CASCADE');
      await query('ALTER TABLE listing_discussions ALTER COLUMN listing_id DROP NOT NULL');
      await query(`ALTER TABLE listing_discussions ADD CONSTRAINT chk_discussion_target
        CHECK ((listing_id IS NOT NULL AND request_id IS NULL) OR (listing_id IS NULL AND request_id IS NOT NULL))`);
      await query(`CREATE INDEX idx_discussions_request_toplevel ON listing_discussions(request_id, created_at DESC)
        WHERE parent_id IS NULL AND is_hidden = false`);
      await query(`CREATE INDEX idx_discussions_request_id ON listing_discussions(request_id) WHERE request_id IS NOT NULL`);
      logger.info('Migration complete: listing_discussions.request_id added');
    }

    // Add request_comment notification type
    const hasRequestComment = await query(`
      SELECT 1 FROM pg_enum WHERE enumlabel = 'request_comment'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
    `);
    if (hasRequestComment.rows.length === 0) {
      logger.info('Running migration: Add request_comment notification type');
      await query("ALTER TYPE notification_type ADD VALUE 'request_comment'");
      logger.info('Migration complete: request_comment notification type added');
    }

    // Add admin_notes jsonb column to disputes for admin activity tracking
    const hasAdminNotes = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'disputes' AND column_name = 'admin_notes'
    `);
    if (hasAdminNotes.rows.length === 0) {
      logger.info('Running migration: Add admin_notes to disputes');
      await query("ALTER TABLE disputes ADD COLUMN admin_notes jsonb DEFAULT '[]'");
      logger.info('Migration complete: disputes.admin_notes added');
    }

    // Migration: Add listing_type column to listings (lend vs giveaway)
    const hasListingType = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'listings' AND column_name = 'listing_type'
    `);
    if (hasListingType.rows.length === 0) {
      logger.info('Running migration: Add listing_type to listings');
      await query("ALTER TABLE listings ADD COLUMN listing_type VARCHAR(10) DEFAULT 'lend' NOT NULL");
      logger.info('Migration complete: listings.listing_type added');
    }

    logger.info('Migrations check complete');
  } catch (err) {
    logger.error('Migration error:', err);
    // Don't crash the server on migration errors - log and continue
  }
}
