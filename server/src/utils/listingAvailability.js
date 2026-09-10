// Public inventory state only; never exposes an exchange ID or participant.
export function listingAvailabilitySql(alias = 'l') {
  return `CASE
    WHEN ${alias}.status = 'given_away' THEN CASE WHEN ${alias}.listing_type = 'sell' THEN 'sold' ELSE 'given_away' END
    WHEN ${alias}.status = 'paused' THEN 'paused'
    WHEN EXISTS (SELECT 1 FROM borrow_transactions av WHERE av.listing_id = ${alias}.id AND av.status IN ('picked_up', 'return_pending')) THEN 'borrowed'
    WHEN EXISTS (SELECT 1 FROM borrow_transactions av WHERE av.listing_id = ${alias}.id AND av.status IN ('approved', 'paid')) THEN 'reserved'
    WHEN ${alias}.is_available THEN 'available'
    ELSE 'unavailable' END`;
}
