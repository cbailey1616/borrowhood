-- Add neighborhood support to communities
-- Neighborhoods are defined by a center point + radius

-- Add center point and radius to communities
ALTER TABLE communities
ADD COLUMN IF NOT EXISTS center GEOGRAPHY(POINT, 4326),
ADD COLUMN IF NOT EXISTS radius_miles DECIMAL(5,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS community_type VARCHAR(20) DEFAULT 'town'; -- 'neighborhood' or 'town'

-- Create index for spatial queries on community centers
CREATE INDEX IF NOT EXISTS idx_communities_center ON communities USING GIST(center);

-- Add new notification type for messages
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_message';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'item_match';

-- Create messages table for chat
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_participants ON conversation_participants(user_id);

-- Function to calculate distance in miles between two points
CREATE OR REPLACE FUNCTION distance_miles(point1 GEOGRAPHY, point2 GEOGRAPHY)
RETURNS DECIMAL AS $$
BEGIN
  RETURN ST_Distance(point1, point2) / 1609.34; -- meters to miles
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update the Upton community with a center point (Upton, MA coordinates)
UPDATE communities
SET center = ST_SetSRID(ST_MakePoint(-71.6026, 42.1743), 4326)::geography,
    radius_miles = 1.0,
    community_type = 'neighborhood'
WHERE slug = 'upton-ma';
