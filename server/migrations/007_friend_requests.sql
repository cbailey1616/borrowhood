-- Migration: Friend Requests
-- Add status to friendships for request/accept flow

-- Add status column (pending, accepted)
ALTER TABLE friendships
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'accepted';

-- Set all existing friendships to accepted
UPDATE friendships SET status = 'accepted' WHERE status IS NULL;

-- Add index for finding pending requests
CREATE INDEX IF NOT EXISTS idx_friendships_pending
ON friendships(friend_id, status) WHERE status = 'pending';
