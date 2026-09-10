ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS endorsement_started_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS exchange_endorsements (
  transaction_id UUID NOT NULL REFERENCES borrow_transactions(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  positive BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, rater_id),
  CHECK (rater_id != ratee_id)
);
CREATE INDEX IF NOT EXISTS exchange_endorsements_ratee ON exchange_endorsements(ratee_id);
CREATE OR REPLACE FUNCTION start_endorsement_window() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status IN ('returned', 'completed') AND COALESCE(NEW.payment_status::text, 'none') != 'authorized')
    OR (NEW.status = 'cancelled' AND NEW.accepted_at IS NOT NULL) THEN
    NEW.endorsement_started_at := COALESCE(OLD.endorsement_started_at, NEW.endorsement_started_at, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS start_exchange_endorsements ON borrow_transactions;
CREATE TRIGGER start_exchange_endorsements BEFORE UPDATE ON borrow_transactions
  FOR EACH ROW EXECUTE FUNCTION start_endorsement_window();
UPDATE borrow_transactions SET endorsement_started_at = COALESCE(updated_at, NOW())
WHERE endorsement_started_at IS NULL AND
  ((status IN ('returned','completed') AND COALESCE(payment_status::text, 'none') != 'authorized')
    OR (status = 'cancelled' AND accepted_at IS NOT NULL));
