import { query } from '../utils/db.js';
import logger from '../utils/logger.js';

export async function ensureExchangeCompletionSchema() {
  await query('ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ');
  await query('ALTER TABLE borrow_transactions ADD COLUMN IF NOT EXISTS return_auto_closed_at TIMESTAMPTZ');
  // Recover the original return notice for older pending returns. Where no
  // notice survives, start a fresh window rather than guessing from the due date.
  await query(`UPDATE borrow_transactions bt SET return_requested_at=COALESCE(
    (SELECT MIN(n.created_at) FROM notifications n WHERE n.transaction_id=bt.id
      AND n.type::text='return_requested' AND n.created_at>=bt.actual_pickup_at), NOW())
    WHERE bt.status='return_pending' AND bt.return_requested_at IS NULL`);
  await query("CREATE INDEX IF NOT EXISTS borrow_pending_return_timer ON borrow_transactions(return_requested_at) WHERE status='return_pending'");
  // Commit the enum addition before using its new value. Older installations
  // only have active/paused/deleted; newer test databases may use a text column.
  await query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status' AND typtype = 'e') THEN
      ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'given_away';
    END IF;
  END $$`);

  // The old pickup handler committed the handoff before delisting failed.
  // Repair only that exact state, preserving later owner edits and reservations.
  const repaired = await query(`UPDATE listings l SET status = 'given_away', is_available = false
    WHERE l.listing_type IN ('giveaway', 'sell') AND l.status = 'active' AND l.is_available = false
      AND EXISTS (SELECT 1 FROM borrow_transactions bt WHERE bt.listing_id = l.id
        AND bt.status IN ('returned', 'completed') AND bt.actual_pickup_at IS NOT NULL
        AND bt.actual_return_at = bt.actual_pickup_at AND l.updated_at <= bt.actual_pickup_at)
      AND NOT EXISTS (SELECT 1 FROM borrow_transactions pending WHERE pending.listing_id = l.id
        AND pending.status IN ('approved', 'paid', 'picked_up', 'return_pending'))`);
  logger.info('Exchange completion schema ready', { repairedListings: repaired.rowCount });
}
