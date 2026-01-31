-- Migration 003: Fix messaging schema and add Rent-to-Own support
-- This migration fixes the conversations table to match the API expectations
-- and adds full RTO (Rent-to-Own) functionality

-- ============================================
-- FIX CONVERSATIONS TABLE SCHEMA
-- The API expects user1_id/user2_id columns, not a participants table
-- ============================================

-- Drop the old conversation_participants approach if it exists
DROP TABLE IF EXISTS conversation_participants CASCADE;

-- Recreate conversations table with the correct schema
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate conversations between same users for same listing
  UNIQUE(user1_id, user2_id, listing_id)
);

CREATE INDEX idx_conversations_user1 ON conversations(user1_id);
CREATE INDEX idx_conversations_user2 ON conversations(user2_id);
CREATE INDEX idx_conversations_listing ON conversations(listing_id);

-- Recreate messages table with is_read column
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_unread ON messages(conversation_id, sender_id) WHERE is_read = false;

-- Add trigger to update conversation updated_at
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RENT-TO-OWN ENUMS
-- ============================================

-- RTO contract status
CREATE TYPE rto_contract_status AS ENUM (
  'pending',       -- Waiting for lender approval
  'active',        -- Contract approved and payments in progress
  'completed',     -- All payments made, ownership transferred
  'defaulted',     -- Borrower missed payments, contract terminated
  'cancelled'      -- Cancelled by either party before completion
);

-- RTO payment status
CREATE TYPE rto_payment_status AS ENUM (
  'pending',       -- Payment due but not yet made
  'processing',    -- Payment initiated
  'completed',     -- Payment successful
  'failed',        -- Payment failed
  'refunded'       -- Payment refunded
);

-- ============================================
-- ADD RTO FIELDS TO LISTINGS
-- ============================================

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS rto_available BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS rto_purchase_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS rto_min_payments INT,
ADD COLUMN IF NOT EXISTS rto_max_payments INT,
ADD COLUMN IF NOT EXISTS rto_rental_credit_percent DECIMAL(5,2) DEFAULT 50.00;

-- Add index for RTO listings
CREATE INDEX IF NOT EXISTS idx_listings_rto ON listings(community_id, rto_available)
  WHERE status = 'active' AND rto_available = true;

-- ============================================
-- RTO CONTRACTS TABLE
-- ============================================

CREATE TABLE rto_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Parties
  listing_id UUID NOT NULL REFERENCES listings(id),
  borrower_id UUID NOT NULL REFERENCES users(id),
  lender_id UUID NOT NULL REFERENCES users(id),

  -- Contract terms (snapshot at contract creation)
  purchase_price DECIMAL(10,2) NOT NULL,         -- Total purchase price
  total_payments INT NOT NULL,                   -- Number of payments to complete
  payment_amount DECIMAL(10,2) NOT NULL,         -- Amount per payment
  rental_credit_percent DECIMAL(5,2) NOT NULL,   -- % of rental that goes toward purchase

  -- Payment schedule
  payment_frequency VARCHAR(20) DEFAULT 'monthly', -- 'weekly', 'biweekly', 'monthly'
  first_payment_date DATE NOT NULL,
  next_payment_date DATE,

  -- Progress tracking
  payments_completed INT DEFAULT 0,
  equity_accumulated DECIMAL(10,2) DEFAULT 0,    -- Total credited toward purchase
  rental_paid DECIMAL(10,2) DEFAULT 0,           -- Total rental portion paid

  -- Status
  status rto_contract_status DEFAULT 'pending',

  -- Stripe
  stripe_subscription_id VARCHAR(255),           -- For recurring payments

  -- Terms and conditions
  terms_accepted_at TIMESTAMPTZ,
  terms_document_url TEXT,

  -- Timestamps
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rto_contracts_borrower ON rto_contracts(borrower_id);
CREATE INDEX idx_rto_contracts_lender ON rto_contracts(lender_id);
CREATE INDEX idx_rto_contracts_listing ON rto_contracts(listing_id);
CREATE INDEX idx_rto_contracts_status ON rto_contracts(status);
CREATE INDEX idx_rto_contracts_next_payment ON rto_contracts(next_payment_date)
  WHERE status = 'active';

-- Trigger for updated_at
CREATE TRIGGER update_rto_contracts_updated_at BEFORE UPDATE ON rto_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RTO PAYMENTS TABLE
-- ============================================

CREATE TABLE rto_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  contract_id UUID NOT NULL REFERENCES rto_contracts(id) ON DELETE CASCADE,
  payment_number INT NOT NULL,                   -- Which payment this is (1, 2, 3...)

  -- Amount breakdown
  total_amount DECIMAL(10,2) NOT NULL,           -- Total payment amount
  equity_portion DECIMAL(10,2) NOT NULL,         -- Amount credited toward ownership
  rental_portion DECIMAL(10,2) NOT NULL,         -- Amount for rental/usage
  platform_fee DECIMAL(10,2) NOT NULL,           -- Platform fee (2%)
  lender_payout DECIMAL(10,2) NOT NULL,          -- Amount to lender

  -- Payment details
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  status rto_payment_status DEFAULT 'pending',

  -- Stripe
  stripe_payment_intent_id VARCHAR(255),
  stripe_transfer_id VARCHAR(255),

  -- Retry tracking
  failure_reason TEXT,
  retry_count INT DEFAULT 0,
  last_retry_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rto_payments_contract ON rto_payments(contract_id, payment_number);
CREATE INDEX idx_rto_payments_status ON rto_payments(status) WHERE status = 'pending';
CREATE INDEX idx_rto_payments_due ON rto_payments(due_date) WHERE status = 'pending';

-- Trigger for updated_at
CREATE TRIGGER update_rto_payments_updated_at BEFORE UPDATE ON rto_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ADD RTO NOTIFICATION TYPES
-- ============================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'rto_request';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'rto_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'rto_payment_due';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'rto_payment_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'rto_payment_failed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'rto_completed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'rto_defaulted';

-- ============================================
-- FUNCTION: Calculate RTO Payment Schedule
-- ============================================

CREATE OR REPLACE FUNCTION calculate_rto_payment(
  purchase_price DECIMAL,
  rental_credit_percent DECIMAL,
  total_payments INT
)
RETURNS TABLE (
  payment_amount DECIMAL,
  equity_per_payment DECIMAL,
  rental_per_payment DECIMAL
) AS $$
DECLARE
  equity_portion DECIMAL;
  total_equity_needed DECIMAL;
BEGIN
  -- Calculate total equity needed (the purchase price)
  total_equity_needed := purchase_price;

  -- Each payment contributes rental_credit_percent toward equity
  -- Payment = (equity_per_payment / rental_credit_percent) * 100
  equity_per_payment := total_equity_needed / total_payments;
  payment_amount := equity_per_payment / (rental_credit_percent / 100);
  rental_per_payment := payment_amount - equity_per_payment;

  RETURN QUERY SELECT payment_amount, equity_per_payment, rental_per_payment;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- FUNCTION: Update RTO Contract After Payment
-- ============================================

CREATE OR REPLACE FUNCTION process_rto_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Update contract progress
    UPDATE rto_contracts SET
      payments_completed = payments_completed + 1,
      equity_accumulated = equity_accumulated + NEW.equity_portion,
      rental_paid = rental_paid + NEW.rental_portion,
      next_payment_date = CASE
        WHEN payment_frequency = 'weekly' THEN next_payment_date + INTERVAL '1 week'
        WHEN payment_frequency = 'biweekly' THEN next_payment_date + INTERVAL '2 weeks'
        ELSE next_payment_date + INTERVAL '1 month'
      END
    WHERE id = NEW.contract_id;

    -- Check if contract is complete
    UPDATE rto_contracts SET
      status = 'completed',
      completed_at = NOW()
    WHERE id = NEW.contract_id
      AND payments_completed >= total_payments;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rto_payment_completed_trigger
  AFTER UPDATE ON rto_payments
  FOR EACH ROW EXECUTE FUNCTION process_rto_payment();
