-- Migration: Request Discussions (Extend discussions to wanted posts)
-- Created: 2026-03-04

-- Add request_id column to listing_discussions
ALTER TABLE listing_discussions ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES item_requests(id) ON DELETE CASCADE;

-- Make listing_id nullable (was NOT NULL) since request discussions won't have one
ALTER TABLE listing_discussions ALTER COLUMN listing_id DROP NOT NULL;

-- Add CHECK constraint: exactly one of listing_id or request_id must be set
ALTER TABLE listing_discussions ADD CONSTRAINT chk_discussion_target
  CHECK (
    (listing_id IS NOT NULL AND request_id IS NULL) OR
    (listing_id IS NULL AND request_id IS NOT NULL)
  );

-- Index for fetching top-level posts for a request
CREATE INDEX idx_discussions_request_toplevel ON listing_discussions(request_id, created_at DESC)
  WHERE parent_id IS NULL AND is_hidden = false;

-- Index for general request_id lookups
CREATE INDEX idx_discussions_request_id ON listing_discussions(request_id)
  WHERE request_id IS NOT NULL;

-- Add request_comment notification type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'request_comment'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'request_comment';
  END IF;
END $$;
