-- Migration: Subscription Tiers
-- Created: 2026-01-31
--
-- Tiers:
--   free: Borrow and lend to friends only (free items only)
--   neighborhood ($1/mo): Borrow and lend to neighborhood + rentals
--   town ($2/mo): Borrow and lend to entire town + rentals

-- Subscription tier enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
    CREATE TYPE subscription_tier AS ENUM ('free', 'neighborhood', 'town');
  END IF;
END $$;

-- Add subscription fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Subscription history for tracking
CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier subscription_tier NOT NULL,
  action VARCHAR(20) NOT NULL, -- 'subscribe', 'upgrade', 'downgrade', 'cancel', 'renew'
  amount_cents INT,
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_history_user ON subscription_history(user_id, created_at DESC);

-- Tier pricing configuration
CREATE TABLE IF NOT EXISTS subscription_pricing (
  tier subscription_tier PRIMARY KEY,
  price_cents INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  features TEXT[],
  is_active BOOLEAN DEFAULT true
);

INSERT INTO subscription_pricing (tier, price_cents, name, description, features) VALUES
  ('free', 0, 'Friends', 'Share freely with close friends',
   ARRAY['Lend to close friends', 'Borrow from close friends', 'Free items only', 'Basic support']),
  ('neighborhood', 100, 'Neighborhood', 'Expand your sharing circle',
   ARRAY['Everything in Friends', 'Lend to your neighborhood', 'Borrow from neighborhood', 'Charge rental fees', 'Priority support']),
  ('town', 200, 'Town', 'Share across your entire town',
   ARRAY['Everything in Neighborhood', 'Lend to entire town', 'Borrow from entire town', 'Featured listings', 'Premium support'])
ON CONFLICT (tier) DO UPDATE SET
  price_cents = EXCLUDED.price_cents,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  features = EXCLUDED.features;

-- Function to check if user can access a visibility level
CREATE OR REPLACE FUNCTION can_access_visibility(user_tier subscription_tier, visibility_level TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  CASE visibility_level
    WHEN 'close_friends' THEN RETURN true; -- Everyone can access friends
    WHEN 'neighborhood' THEN RETURN user_tier IN ('neighborhood', 'town');
    WHEN 'town' THEN RETURN user_tier = 'town';
    ELSE RETURN false;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can charge for rentals
CREATE OR REPLACE FUNCTION can_charge_rentals(user_tier subscription_tier)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN user_tier IN ('neighborhood', 'town');
END;
$$ LANGUAGE plpgsql;
