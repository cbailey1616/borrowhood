-- Migration: New Features (Sustainability, Skill Sharing, Bundles, Circles, Calendar, Reputation, Community Library, Badges)
-- Created: 2026-01-31

-- ============================================
-- SUSTAINABILITY TRACKING
-- ============================================

-- Add sustainability stats to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_money_saved DECIMAL(10,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS items_shared_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS items_borrowed_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS co2_saved_kg DECIMAL(10,2) DEFAULT 0;

-- ============================================
-- SKILL SHARING
-- ============================================

-- Add skill sharing fields to listings
ALTER TABLE listings ADD COLUMN IF NOT EXISTS skill_sharing_available BOOLEAN DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS skill_description TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lesson_duration_mins INT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS skill_level TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced'));

-- ============================================
-- ITEM BUNDLES
-- ============================================

CREATE TABLE IF NOT EXISTS bundles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID REFERENCES communities(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  photo_url TEXT,
  is_free BOOLEAN DEFAULT true,
  price_per_day DECIMAL(10,2),
  deposit_amount DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted')),
  times_borrowed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bundle_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bundle_id, listing_id)
);

CREATE INDEX idx_bundles_owner ON bundles(owner_id);
CREATE INDEX idx_bundle_items_bundle ON bundle_items(bundle_id);

-- ============================================
-- LENDING CIRCLES
-- ============================================

CREATE TABLE IF NOT EXISTS lending_circles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  photo_url TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_private BOOLEAN DEFAULT true,
  require_deposit BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lending_circle_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  circle_id UUID NOT NULL REFERENCES lending_circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removed')),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(circle_id, user_id)
);

CREATE INDEX idx_circle_members_circle ON lending_circle_members(circle_id);
CREATE INDEX idx_circle_members_user ON lending_circle_members(user_id);

-- Add circle visibility to listings
ALTER TABLE listings ADD COLUMN IF NOT EXISTS circle_id UUID REFERENCES lending_circles(id) ON DELETE SET NULL;

-- ============================================
-- AVAILABILITY CALENDAR
-- ============================================

CREATE TABLE IF NOT EXISTS listing_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_available BOOLEAN DEFAULT false,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_availability_listing ON listing_availability(listing_id, start_date, end_date);

-- Add booking fields to transactions
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS scheduled_pickup_date DATE;
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS scheduled_return_date DATE;
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- ============================================
-- REPUTATION SCORES
-- ============================================

-- Add reputation fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_score INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS response_time_avg_hours DECIMAL(5,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS on_time_return_rate DECIMAL(3,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS item_care_rating DECIMAL(3,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS lending_streak INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_lending_streak INT DEFAULT 0;

-- ============================================
-- COMMUNITY TOOL LIBRARY
-- ============================================

CREATE TABLE IF NOT EXISTS community_library_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  donated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  donation_date TIMESTAMPTZ DEFAULT NOW(),
  condition_notes TEXT,
  is_available BOOLEAN DEFAULT true,
  checkout_limit_days INT DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mark listings as community-owned
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_community_owned BOOLEAN DEFAULT false;

CREATE INDEX idx_community_library_community ON community_library_items(community_id);

-- ============================================
-- SEASONAL SUGGESTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS seasonal_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  keywords TEXT[], -- Array of keywords to match listings
  active_months INT[], -- Array of months (1-12) when this is active
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default seasonal categories
INSERT INTO seasonal_categories (name, description, icon, keywords, active_months, priority) VALUES
  ('Winter Ready', 'Prepare for winter weather', 'snow-outline', ARRAY['snow blower', 'shovel', 'ice', 'winter', 'heater', 'salt spreader'], ARRAY[11, 12, 1, 2], 10),
  ('Spring Cleaning', 'Deep clean your home', 'sparkles-outline', ARRAY['pressure washer', 'carpet cleaner', 'ladder', 'paint', 'cleaning'], ARRAY[3, 4, 5], 10),
  ('Summer Fun', 'Outdoor activities', 'sunny-outline', ARRAY['grill', 'bbq', 'lawn mower', 'pool', 'camping', 'tent', 'cooler'], ARRAY[5, 6, 7, 8], 10),
  ('Fall Yard Work', 'Prepare your yard', 'leaf-outline', ARRAY['leaf blower', 'rake', 'chainsaw', 'wood splitter'], ARRAY[9, 10, 11], 10),
  ('Moving Season', 'Everything for moving', 'cube-outline', ARRAY['dolly', 'hand truck', 'moving', 'boxes', 'truck'], ARRAY[5, 6, 7, 8], 8),
  ('Party Time', 'Host the perfect party', 'balloon-outline', ARRAY['table', 'chairs', 'tent', 'speaker', 'projector', 'party'], ARRAY[1,2,3,4,5,6,7,8,9,10,11,12], 5),
  ('DIY Projects', 'Home improvement tools', 'hammer-outline', ARRAY['drill', 'saw', 'sander', 'router', 'level', 'tool'], ARRAY[1,2,3,4,5,6,7,8,9,10,11,12], 3)
ON CONFLICT DO NOTHING;

-- ============================================
-- BADGES & STREAKS
-- ============================================

CREATE TABLE IF NOT EXISTS badge_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'lending', 'borrowing', 'community', 'milestone', 'special'
  requirement_type VARCHAR(50) NOT NULL, -- 'count', 'streak', 'rating', 'special'
  requirement_value INT,
  points INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON user_badges(user_id);

-- Insert default badges
INSERT INTO badge_definitions (name, description, icon, category, requirement_type, requirement_value, points) VALUES
  -- Lending badges
  ('First Lend', 'Shared your first item', 'gift-outline', 'lending', 'count', 1, 10),
  ('Generous Neighbor', 'Shared 10 items', 'heart-outline', 'lending', 'count', 10, 25),
  ('Super Lender', 'Shared 50 items', 'star-outline', 'lending', 'count', 50, 100),
  ('Lending Legend', 'Shared 100 items', 'trophy-outline', 'lending', 'count', 100, 250),

  -- Borrowing badges
  ('First Borrow', 'Borrowed your first item', 'hand-right-outline', 'borrowing', 'count', 1, 10),
  ('Regular Borrower', 'Borrowed 10 items', 'repeat-outline', 'borrowing', 'count', 10, 25),
  ('Trusted Borrower', 'Maintained 5-star rating on 10+ borrows', 'shield-checkmark-outline', 'borrowing', 'rating', 10, 50),

  -- Community badges
  ('Community Builder', 'Invited 5 neighbors', 'people-outline', 'community', 'count', 5, 30),
  ('Helpful Neighbor', 'Answered 10 questions on listings', 'chatbubbles-outline', 'community', 'count', 10, 25),
  ('Circle Starter', 'Created a lending circle', 'ellipse-outline', 'community', 'count', 1, 20),

  -- Streak badges
  ('Week Warrior', '7-day lending streak', 'flame-outline', 'milestone', 'streak', 7, 15),
  ('Month Master', '30-day lending streak', 'bonfire-outline', 'milestone', 'streak', 30, 50),

  -- Special badges
  ('Early Adopter', 'Joined during launch', 'rocket-outline', 'special', 'special', NULL, 50),
  ('Eco Warrior', 'Saved 100kg CO2 through sharing', 'leaf-outline', 'special', 'count', 100, 75),
  ('Tool Library Hero', 'Donated an item to community library', 'library-outline', 'special', 'count', 1, 40)
ON CONFLICT (name) DO NOTHING;

-- Add status column to community_memberships if not exists
ALTER TABLE community_memberships ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Leaderboard view
CREATE OR REPLACE VIEW community_leaderboard AS
SELECT
  u.id,
  u.first_name,
  u.last_name,
  u.profile_photo_url,
  u.reputation_score,
  u.items_shared_count,
  u.items_borrowed_count,
  u.lending_streak,
  u.co2_saved_kg,
  (SELECT COUNT(*) FROM user_badges WHERE user_id = u.id) as badge_count,
  cm.community_id
FROM users u
JOIN community_memberships cm ON u.id = cm.user_id
WHERE cm.status = 'active' OR cm.status IS NULL
ORDER BY u.reputation_score DESC;

-- ============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================

-- Update sustainability stats after transaction completion
CREATE OR REPLACE FUNCTION update_sustainability_stats()
RETURNS TRIGGER AS $$
DECLARE
  item_value DECIMAL(10,2);
  co2_per_item DECIMAL(10,2) := 5.0; -- Estimate 5kg CO2 saved per shared item
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Get estimated item value (use deposit as proxy, or default)
    SELECT COALESCE(l.deposit_amount, 50) INTO item_value
    FROM listings l WHERE l.id = NEW.listing_id;

    -- Update lender stats
    UPDATE users SET
      items_shared_count = items_shared_count + 1,
      co2_saved_kg = co2_saved_kg + co2_per_item,
      reputation_score = reputation_score + 5
    WHERE id = NEW.lender_id;

    -- Update borrower stats
    UPDATE users SET
      items_borrowed_count = items_borrowed_count + 1,
      total_money_saved = total_money_saved + item_value,
      co2_saved_kg = co2_saved_kg + co2_per_item
    WHERE id = NEW.borrower_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_sustainability ON borrow_transactions;
CREATE TRIGGER trigger_update_sustainability
  AFTER UPDATE ON borrow_transactions
  FOR EACH ROW EXECUTE FUNCTION update_sustainability_stats();

-- Update lending streak
CREATE OR REPLACE FUNCTION update_lending_streak()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    UPDATE users SET
      lending_streak = lending_streak + 1,
      longest_lending_streak = GREATEST(longest_lending_streak, lending_streak + 1)
    WHERE id = NEW.lender_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lending_streak ON borrow_transactions;
CREATE TRIGGER trigger_update_lending_streak
  AFTER UPDATE ON borrow_transactions
  FOR EACH ROW EXECUTE FUNCTION update_lending_streak();
