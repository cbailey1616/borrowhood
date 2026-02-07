-- Migration 013: Add request type and request notifications

-- Add type column to item_requests (item or service)
ALTER TABLE item_requests ADD COLUMN IF NOT EXISTS type VARCHAR(10) DEFAULT 'item' NOT NULL;
ALTER TABLE item_requests ADD CONSTRAINT item_requests_type_check CHECK (type IN ('item', 'service'));

-- Add new_request notification type enum value
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'new_request'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type'))
  THEN ALTER TYPE notification_type ADD VALUE 'new_request'; END IF;
END$$;

-- Add request_id column to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES item_requests(id) ON DELETE SET NULL;
