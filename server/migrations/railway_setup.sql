-- Borrowhood Database Schema for Railway
-- PostgreSQL (without PostGIS)

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_status AS ENUM ('pending', 'verified', 'suspended');
CREATE TYPE membership_role AS ENUM ('member', 'organizer');
CREATE TYPE visibility_level AS ENUM ('close_friends', 'neighborhood', 'town');
CREATE TYPE item_condition AS ENUM ('like_new', 'good', 'fair', 'worn');
CREATE TYPE listing_status AS ENUM ('active', 'paused', 'deleted');
CREATE TYPE request_status AS ENUM ('open', 'fulfilled', 'closed');
CREATE TYPE borrow_status AS ENUM (
  'pending',
  'approved',
  'paid',
  'picked_up',
  'return_pending',
  'returned',
  'disputed',
  'cancelled',
  'completed'
);
CREATE TYPE dispute_status AS ENUM ('open', 'resolved_lender', 'resolved_borrower', 'resolved_split');
CREATE TYPE notification_type AS ENUM (
  'borrow_request',
  'request_approved',
  'request_declined',
  'pickup_confirmed',
  'return_reminder',
  'item_overdue',
  'return_confirmed',
  'dispute_opened',
  'dispute_resolved',
  'rating_received',
  'new_listing_match'
);

-- ============================================
-- USERS
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  profile_photo_url TEXT,
  bio TEXT,
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  status user_status DEFAULT 'pending',
  stripe_customer_id VARCHAR(255),
  stripe_connect_account_id VARCHAR(255),
  stripe_identity_verified_at TIMESTAMPTZ,
  identity_verification_session_id VARCHAR(255),
  borrower_rating DECIMAL(3,2) DEFAULT 0,
  borrower_rating_count INT DEFAULT 0,
  lender_rating DECIMAL(3,2) DEFAULT 0,
  lender_rating_count INT DEFAULT 0,
  total_transactions INT DEFAULT 0,
  push_token TEXT,
  notification_preferences JSONB DEFAULT '{"email": true, "push": true}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_city_state ON users(city, state);

-- ============================================
-- COMMUNITIES
-- ============================================

CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_communities_city_state ON communities(city, state);
CREATE INDEX idx_communities_slug ON communities(slug);

-- ============================================
-- COMMUNITY MEMBERSHIPS
-- ============================================

CREATE TABLE community_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  role membership_role DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, community_id)
);

CREATE INDEX idx_memberships_user ON community_memberships(user_id);
CREATE INDEX idx_memberships_community ON community_memberships(community_id);

-- ============================================
-- FRIENDSHIPS
-- ============================================

CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

CREATE INDEX idx_friendships_user ON friendships(user_id);

-- ============================================
-- CATEGORIES
-- ============================================

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  icon VARCHAR(50),
  parent_id UUID REFERENCES categories(id),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO categories (name, slug, icon) VALUES ('Tools', 'tools', 'tool');

-- ============================================
-- LISTINGS
-- ============================================

CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES communities(id),
  category_id UUID REFERENCES categories(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  condition item_condition NOT NULL,
  is_free BOOLEAN DEFAULT false,
  price_per_day DECIMAL(10,2),
  deposit_amount DECIMAL(10,2) DEFAULT 0,
  min_duration INT DEFAULT 1,
  max_duration INT DEFAULT 14,
  visibility visibility_level DEFAULT 'neighborhood',
  status listing_status DEFAULT 'active',
  is_available BOOLEAN DEFAULT true,
  times_borrowed INT DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_listings_owner ON listings(owner_id);
CREATE INDEX idx_listings_community ON listings(community_id);
CREATE INDEX idx_listings_category ON listings(category_id);

-- ============================================
-- LISTING PHOTOS
-- ============================================

CREATE TABLE listing_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_listing_photos ON listing_photos(listing_id);

-- ============================================
-- ITEM REQUESTS
-- ============================================

CREATE TABLE item_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES communities(id),
  category_id UUID REFERENCES categories(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  needed_from DATE,
  needed_until DATE,
  visibility visibility_level DEFAULT 'neighborhood',
  status request_status DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_item_requests_user ON item_requests(user_id);
CREATE INDEX idx_item_requests_community ON item_requests(community_id, status);

-- ============================================
-- BORROW TRANSACTIONS
-- ============================================

CREATE TABLE borrow_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  borrower_id UUID NOT NULL REFERENCES users(id),
  lender_id UUID NOT NULL REFERENCES users(id),
  requested_start_date DATE NOT NULL,
  requested_end_date DATE NOT NULL,
  actual_pickup_at TIMESTAMPTZ,
  actual_return_at TIMESTAMPTZ,
  rental_days INT NOT NULL,
  daily_rate DECIMAL(10,2) NOT NULL,
  rental_fee DECIMAL(10,2) NOT NULL,
  deposit_amount DECIMAL(10,2) NOT NULL,
  platform_fee DECIMAL(10,2) NOT NULL,
  lender_payout DECIMAL(10,2) NOT NULL,
  status borrow_status DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(255),
  stripe_deposit_hold_id VARCHAR(255),
  stripe_transfer_id VARCHAR(255),
  condition_at_pickup item_condition,
  condition_at_return item_condition,
  condition_notes TEXT,
  borrower_message TEXT,
  lender_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_borrower ON borrow_transactions(borrower_id);
CREATE INDEX idx_transactions_lender ON borrow_transactions(lender_id);
CREATE INDEX idx_transactions_listing ON borrow_transactions(listing_id);
CREATE INDEX idx_transactions_status ON borrow_transactions(status);

-- ============================================
-- DISPUTES
-- ============================================

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES borrow_transactions(id),
  opened_by_id UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  evidence_urls TEXT[],
  status dispute_status DEFAULT 'open',
  resolved_by_id UUID REFERENCES users(id),
  resolution_notes TEXT,
  deposit_to_lender DECIMAL(10,2),
  deposit_to_borrower DECIMAL(10,2),
  organizer_fee DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_disputes_transaction ON disputes(transaction_id);

-- ============================================
-- RATINGS
-- ============================================

CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES borrow_transactions(id),
  rater_id UUID NOT NULL REFERENCES users(id),
  ratee_id UUID NOT NULL REFERENCES users(id),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_lender_rating BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(transaction_id, rater_id)
);

CREATE INDEX idx_ratings_ratee ON ratings(ratee_id);
CREATE INDEX idx_ratings_transaction ON ratings(transaction_id);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  transaction_id UUID REFERENCES borrow_transactions(id),
  listing_id UUID REFERENCES listings(id),
  from_user_id UUID REFERENCES users(id),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  push_sent BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ============================================
-- AUDIT LOG
-- ============================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);

-- ============================================
-- CONVERSATIONS (for messaging)
-- ============================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES borrow_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_conversation_participants ON conversation_participants(user_id);

-- ============================================
-- LISTING DISCUSSIONS
-- ============================================

CREATE TABLE listing_discussions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES listing_discussions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_listing_discussions_listing ON listing_discussions(listing_id, created_at);
CREATE INDEX idx_listing_discussions_parent ON listing_discussions(parent_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_communities_updated_at BEFORE UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_item_requests_updated_at BEFORE UPDATE ON item_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON borrow_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION update_user_ratings()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_lender_rating THEN
    UPDATE users SET
      lender_rating = (
        SELECT AVG(rating)::DECIMAL(3,2) FROM ratings
        WHERE ratee_id = NEW.ratee_id AND is_lender_rating = true
      ),
      lender_rating_count = (
        SELECT COUNT(*) FROM ratings
        WHERE ratee_id = NEW.ratee_id AND is_lender_rating = true
      )
    WHERE id = NEW.ratee_id;
  ELSE
    UPDATE users SET
      borrower_rating = (
        SELECT AVG(rating)::DECIMAL(3,2) FROM ratings
        WHERE ratee_id = NEW.ratee_id AND is_lender_rating = false
      ),
      borrower_rating_count = (
        SELECT COUNT(*) FROM ratings
        WHERE ratee_id = NEW.ratee_id AND is_lender_rating = false
      )
    WHERE id = NEW.ratee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ratings_trigger AFTER INSERT ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_user_ratings();

CREATE OR REPLACE FUNCTION update_transaction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE users SET total_transactions = total_transactions + 1
    WHERE id IN (NEW.borrower_id, NEW.lender_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transaction_count_trigger AFTER UPDATE ON borrow_transactions
  FOR EACH ROW EXECUTE FUNCTION update_transaction_count();

-- ============================================
-- SEED DATA
-- ============================================

INSERT INTO communities (name, slug, city, state, description)
VALUES (
  'Upton Tool Library',
  'upton-ma',
  'Upton',
  'Massachusetts',
  'Share tools with your neighbors in Upton, MA. Borrow what you need, lend what you have!'
);
