-- Also support installations replaying numbered migrations before startup upgrades.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_type VARCHAR(20) DEFAULT 'lend';
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS pickup_review_at TIMESTAMPTZ;
ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS pickup_review_notified_at TIMESTAMPTZ;

-- Calendar pickup dates have no timezone. Check at noon UTC the following day,
-- after that day has ended throughout the US, and give late approvals 24 hours.
CREATE OR REPLACE FUNCTION pickup_review_time(item_type TEXT, pickup_date DATE, accepted TIMESTAMPTZ)
RETURNS TIMESTAMPTZ LANGUAGE SQL STABLE AS $$
  SELECT CASE WHEN item_type IN ('giveaway', 'sell') THEN accepted + INTERVAL '7 days'
    ELSE GREATEST((pickup_date::timestamp + INTERVAL '36 hours') AT TIME ZONE 'UTC',
      accepted + INTERVAL '24 hours') END;
$$;

CREATE OR REPLACE FUNCTION schedule_pickup_review() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('approved', 'paid') AND NEW.actual_pickup_at IS NULL AND NEW.pickup_review_at IS NULL THEN
    NEW.pickup_review_at := pickup_review_time(
      (SELECT listing_type::text FROM listings WHERE id=NEW.listing_id), NEW.requested_start_date,
      COALESCE(NEW.accepted_at, NOW()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS schedule_pickup_review ON borrow_transactions;
CREATE TRIGGER schedule_pickup_review BEFORE INSERT OR UPDATE OF status ON borrow_transactions
  FOR EACH ROW EXECUTE FUNCTION schedule_pickup_review();

-- Preserve previous extensions and notification receipts on repeated startup.
UPDATE borrow_transactions t SET pickup_review_at = pickup_review_time(l.listing_type::text,
  t.requested_start_date, COALESCE(t.accepted_at, t.updated_at, t.created_at))
FROM listings l WHERE t.listing_id=l.id AND t.status IN ('approved', 'paid')
  AND t.actual_pickup_at IS NULL AND t.pickup_review_at IS NULL;

CREATE INDEX IF NOT EXISTS pending_pickup_reviews ON borrow_transactions(pickup_review_at)
  WHERE status IN ('approved', 'paid') AND actual_pickup_at IS NULL;

-- Resolving or postponing a check also clears its unread badge and prevents a
-- still-queued push from being delivered after the decision, including on old clients.
CREATE OR REPLACE FUNCTION resolve_pickup_review_notice() RETURNS trigger AS $$
BEGIN
  IF NEW.status NOT IN ('approved', 'paid') OR NEW.actual_pickup_at IS NOT NULL
    OR NEW.pickup_review_at IS DISTINCT FROM OLD.pickup_review_at THEN
    UPDATE notifications SET is_read=true WHERE transaction_id=NEW.id AND user_id=NEW.lender_id
      AND type::text='pickup_check' AND is_read=false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS resolve_pickup_review_notice ON borrow_transactions;
CREATE TRIGGER resolve_pickup_review_notice AFTER UPDATE OF status, actual_pickup_at, pickup_review_at ON borrow_transactions
  FOR EACH ROW EXECUTE FUNCTION resolve_pickup_review_notice();
