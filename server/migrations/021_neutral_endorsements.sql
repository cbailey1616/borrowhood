-- NULL records neutral feedback without adding to the endorsement numerator or denominator.
-- Existing thumbs-up/down feedback and the one-vote-per-person constraint are preserved.
ALTER TABLE exchange_endorsements ALTER COLUMN positive DROP NOT NULL;
