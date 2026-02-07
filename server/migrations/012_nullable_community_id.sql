-- Allow listings and requests without a community (e.g., close_friends only visibility)
ALTER TABLE listings ALTER COLUMN community_id DROP NOT NULL;
ALTER TABLE item_requests ALTER COLUMN community_id DROP NOT NULL;
