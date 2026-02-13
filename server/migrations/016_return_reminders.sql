-- Add columns to track return reminder notifications
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS reminder_day_before_sent BOOLEAN DEFAULT false;
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS reminder_day_of_sent BOOLEAN DEFAULT false;
