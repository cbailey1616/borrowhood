-- Synthetic launch fixtures. Real access rules and SQL run against PostgreSQL's
-- PGlite engine; this schema intentionally excludes unrelated spatial/payment data.
CREATE TABLE users(id UUID PRIMARY KEY, email TEXT, first_name TEXT DEFAULT 'Test', last_name TEXT DEFAULT 'Neighbor',
 display_name TEXT, status TEXT DEFAULT 'verified', is_admin BOOLEAN DEFAULT false, token_invalidated_at TIMESTAMPTZ,
 city TEXT DEFAULT 'Test Town', state TEXT DEFAULT 'MA', is_verified BOOLEAN DEFAULT true, profile_photo_url TEXT,
 lender_rating NUMERIC DEFAULT 0, lender_rating_count INT DEFAULT 0, total_transactions INT DEFAULT 0,
 push_token TEXT, notification_preferences JSONB DEFAULT '{}');
CREATE TABLE categories(id UUID PRIMARY KEY,name TEXT,icon TEXT);
CREATE TABLE listings(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),owner_id UUID REFERENCES users(id),title TEXT,
 description TEXT,condition TEXT DEFAULT 'good',is_free BOOLEAN DEFAULT true,direct_fee JSONB,is_available BOOLEAN DEFAULT true,
 price_per_day NUMERIC DEFAULT 0,deposit_amount NUMERIC DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW(),
 listing_type TEXT DEFAULT 'lend',visibility TEXT DEFAULT 'town',category_id UUID,community_id UUID,circle_id UUID,
 status TEXT DEFAULT 'active',privacy_version INT DEFAULT 1,town_preview_enabled BOOLEAN DEFAULT false);
CREATE TABLE listing_photos(listing_id UUID REFERENCES listings(id),url TEXT,sort_order INT DEFAULT 0);
CREATE INDEX launch_photos_listing ON listing_photos(listing_id);
CREATE TABLE item_requests(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id),
 title TEXT,description TEXT,type TEXT DEFAULT 'item',photo_url TEXT,needed_from DATE,needed_until DATE,expires_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ DEFAULT NOW(),visibility TEXT DEFAULT 'town',community_id UUID,status TEXT DEFAULT 'open',
 time_zone TEXT DEFAULT 'UTC',town_preview_enabled BOOLEAN DEFAULT true);
CREATE TABLE user_blocks(user_id UUID,blocked_id UUID,PRIMARY KEY(user_id,blocked_id));
CREATE TABLE friendships(user_id UUID,friend_id UUID,status TEXT,PRIMARY KEY(user_id,friend_id));
CREATE TABLE communities(id UUID PRIMARY KEY,name TEXT,is_active BOOLEAN DEFAULT true,banner_url TEXT,community_type TEXT);
CREATE TABLE community_memberships(community_id UUID,user_id UUID,role TEXT,PRIMARY KEY(community_id,user_id));
CREATE TABLE lending_circle_members(circle_id UUID,user_id UUID,status TEXT,PRIMARY KEY(circle_id,user_id));
CREATE TABLE lending_circles(id UUID PRIMARY KEY,photo_url TEXT);
CREATE TABLE listing_shares(listing_id UUID,user_id UUID,request_id UUID,revoked_at TIMESTAMPTZ,expires_at TIMESTAMPTZ);
CREATE TABLE borrow_transactions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),listing_id UUID,borrower_id UUID,lender_id UUID,
 status TEXT,payment_status TEXT,accepted_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT NOW(),
 created_at TIMESTAMPTZ DEFAULT NOW(),damage_evidence_urls TEXT[]);
CREATE INDEX launch_transactions_listing ON borrow_transactions(listing_id,status);
CREATE INDEX launch_transactions_borrower ON borrow_transactions(borrower_id);
CREATE INDEX launch_transactions_lender ON borrow_transactions(lender_id);
CREATE TABLE feed_events(user_id UUID,item_type TEXT,item_id UUID,seen_at TIMESTAMPTZ,clicked_at TIMESTAMPTZ,
 PRIMARY KEY(user_id,item_type,item_id));
CREATE INDEX feed_events_item_idx ON feed_events(item_type,item_id,clicked_at);
CREATE TABLE feed_sessions(user_id UUID,token UUID,filter_key TEXT,item_keys JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(user_id,token));
CREATE TYPE notification_type AS ENUM ('new_message');
CREATE TABLE notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id),type TEXT,
 title TEXT,body TEXT,from_user_id UUID,transaction_id UUID,listing_id UUID,request_id UUID,conversation_id UUID,dispute_id UUID,
 is_read BOOLEAN DEFAULT false,read_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW(),push_sent BOOLEAN DEFAULT false);
CREATE TABLE conversations(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user1_id UUID,user2_id UUID,listing_id UUID,created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE messages(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id UUID,sender_id UUID,content TEXT,
 image_url TEXT,deleted_at TIMESTAMPTZ,is_read BOOLEAN DEFAULT false,created_at TIMESTAMPTZ DEFAULT NOW(),parent_id UUID,
 client_request_id UUID,client_request_hash TEXT);
CREATE UNIQUE INDEX idx_messages_client_request ON messages(sender_id,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX launch_messages_conversation ON messages(conversation_id,created_at);
CREATE TABLE message_reactions(message_id UUID,user_id UUID,emoji TEXT);
CREATE TABLE disputes(id UUID PRIMARY KEY,transaction_id UUID,created_at TIMESTAMPTZ,photo_urls TEXT[],response_photo_urls TEXT[],evidence_urls TEXT[],claimant_user_id UUID,respondent_user_id UUID);
CREATE TABLE bundles(id UUID PRIMARY KEY,owner_id UUID,photo_url TEXT);
CREATE TABLE bundle_items(bundle_id UUID,listing_id UUID);
