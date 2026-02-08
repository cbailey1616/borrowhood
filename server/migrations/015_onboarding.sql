-- Onboarding tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false;

-- Mark existing users with city as completed so they skip onboarding
UPDATE users SET onboarding_completed = true WHERE city IS NOT NULL;
