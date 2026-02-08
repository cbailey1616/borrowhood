-- ============================================
-- 014: Rental Payment System
-- Adds columns for enhanced rental payment lifecycle:
-- partial capture, damage claims, late fees, payment status tracking
-- ============================================

-- Payment status tracking on transactions
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'none';

-- Late fee tracking
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS stripe_late_fee_payment_intent_id VARCHAR(255);
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS late_fee_amount_cents INT DEFAULT 0;

-- Damage claim tracking
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS damage_claim_amount_cents INT DEFAULT 0;
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS damage_claim_notes TEXT;
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS damage_evidence_urls TEXT[];

-- Late fee configuration on listings
ALTER TABLE listings ADD COLUMN IF NOT EXISTS late_fee_per_day DECIMAL(10,2) DEFAULT 0;

-- Index for finding overdue rentals
CREATE INDEX IF NOT EXISTS idx_transactions_overdue
  ON borrow_transactions(requested_end_date, status)
  WHERE status = 'picked_up';
