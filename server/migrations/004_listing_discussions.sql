-- Migration: Listing Discussions (Threaded Q&A on listings)
-- Created: 2026-01-31

-- Create listing_discussions table
CREATE TABLE listing_discussions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES listing_discussions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_hidden BOOLEAN DEFAULT false,
  hidden_by UUID REFERENCES users(id),
  hidden_at TIMESTAMPTZ,
  reply_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching top-level posts for a listing
CREATE INDEX idx_discussions_listing_toplevel ON listing_discussions(listing_id, created_at DESC)
  WHERE parent_id IS NULL AND is_hidden = false;

-- Index for fetching replies to a post
CREATE INDEX idx_discussions_replies ON listing_discussions(parent_id, created_at ASC)
  WHERE parent_id IS NOT NULL AND is_hidden = false;

-- Index for user's discussion posts
CREATE INDEX idx_discussions_user ON listing_discussions(user_id, created_at DESC);

-- Trigger to update reply_count on parent when reply is added/removed
CREATE OR REPLACE FUNCTION update_discussion_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE listing_discussions
      SET reply_count = reply_count + 1, updated_at = NOW()
      WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NOT NULL THEN
      UPDATE listing_discussions
      SET reply_count = reply_count - 1, updated_at = NOW()
      WHERE id = OLD.parent_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle hiding/unhiding
    IF OLD.is_hidden = false AND NEW.is_hidden = true AND NEW.parent_id IS NOT NULL THEN
      UPDATE listing_discussions
      SET reply_count = reply_count - 1, updated_at = NOW()
      WHERE id = NEW.parent_id;
    ELSIF OLD.is_hidden = true AND NEW.is_hidden = false AND NEW.parent_id IS NOT NULL THEN
      UPDATE listing_discussions
      SET reply_count = reply_count + 1, updated_at = NOW()
      WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reply_count
  AFTER INSERT OR DELETE OR UPDATE OF is_hidden ON listing_discussions
  FOR EACH ROW EXECUTE FUNCTION update_discussion_reply_count();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_discussion_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_discussion_timestamp
  BEFORE UPDATE ON listing_discussions
  FOR EACH ROW EXECUTE FUNCTION update_discussion_timestamp();

-- Add new notification types for discussions
-- First check if the enum exists and add values if needed
DO $$
BEGIN
  -- Add discussion_reply if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'discussion_reply'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'discussion_reply';
  END IF;

  -- Add listing_comment if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'listing_comment'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'listing_comment';
  END IF;
END $$;

-- Add discussion_id column to notifications table for linking
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS discussion_id UUID REFERENCES listing_discussions(id) ON DELETE SET NULL;
