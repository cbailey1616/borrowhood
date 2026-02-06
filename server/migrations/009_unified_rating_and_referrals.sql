-- Migration: Unified Rating & Referral System
-- Created: 2026-02-06
--
-- 1. Merge borrower/lender ratings into single unified rating
-- 2. Add referral code system for invite-3-get-Plus-free

-- ============================================
-- UNIFIED RATING
-- ============================================

-- Add unified rating columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0;

-- Backfill: weighted average of existing borrower + lender ratings
UPDATE users SET
  rating = CASE
    WHEN (borrower_rating_count + lender_rating_count) > 0 THEN
      ((borrower_rating * borrower_rating_count) + (lender_rating * lender_rating_count))
      / (borrower_rating_count + lender_rating_count)
    ELSE 0
  END,
  rating_count = borrower_rating_count + lender_rating_count
WHERE borrower_rating_count > 0 OR lender_rating_count > 0;

-- Replace trigger to aggregate ALL ratings (ignore is_lender_rating)
CREATE OR REPLACE FUNCTION update_user_ratings()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET
    rating = (
      SELECT AVG(rating)::DECIMAL(3,2) FROM ratings
      WHERE ratee_id = NEW.ratee_id
    ),
    rating_count = (
      SELECT COUNT(*) FROM ratings
      WHERE ratee_id = NEW.ratee_id
    )
  WHERE id = NEW.ratee_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Keep old columns for now (no DROP) — they'll still get populated by the
-- trigger's previous version on any already-running servers until they restart.

-- ============================================
-- REFERRAL SYSTEM
-- ============================================

-- Add 'plus' to subscription_tier enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'plus'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'subscription_tier')
  ) THEN
    ALTER TYPE subscription_tier ADD VALUE 'plus';
  END IF;
END $$;

-- Add referral notification types to notification_type enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'referral_joined'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'referral_joined';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'referral_reward'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'referral_reward';
  END IF;
END $$;

-- Add referral columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id);

-- Backfill existing users with BH- + first 8 chars of their UUID
UPDATE users SET referral_code = 'BH-' || LEFT(id::TEXT, 8)
WHERE referral_code IS NULL;

-- Indexes for referral lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
