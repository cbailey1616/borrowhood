import { withTransaction } from '../utils/db.js';
import { ownedPhotoReferences } from './privatePhotos.js';
import { reportNonReturn } from './returnRecovery.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

// These are account reports, with no claim, reimbursement or recovery process.
export async function reportExchangeIssue(id, reporterId, { reason, detail = '', photos = [] }) {
  if (!['non_return', 'damage'].includes(reason) || typeof detail !== 'string' || detail.trim().length > 2000
    || !Array.isArray(photos) || photos.length > 5 || photos.some(photo => typeof photo !== 'string')) {
    throw fail(400, 'Choose an issue and use up to five photos. Details must be under 2,000 characters.');
  }
  let evidence;
  try { evidence = await ownedPhotoReferences(photos, reporterId); }
  catch { throw fail(400, 'Use photos uploaded by you for this report.'); }
  const notes = detail.trim() || (reason === 'non_return' ? 'Item wasn’t returned.' : 'Item was damaged.');
  if (reason === 'non_return') return reportNonReturn(id, reporterId, notes, evidence);
  return withTransaction(async db => {
    const t = (await db.query(`SELECT t.*, l.listing_type, l.title FROM borrow_transactions t
      JOIN listings l ON l.id=t.listing_id WHERE t.id=$1 AND (t.lender_id=$2 OR t.borrower_id=$2)
      FOR UPDATE OF t`, [id, reporterId])).rows[0];
    if (!t) throw fail(404, 'Exchange not found.');
    if (['sell', 'giveaway'].includes(t.listing_type) || !t.actual_pickup_at || t.actual_return_at
      || !['picked_up', 'return_pending'].includes(t.status)) {
      throw fail(409, 'This exchange is no longer awaiting a return. Refresh the exchange.');
    }
    const existing = (await db.query(`SELECT id FROM safety_reports WHERE content_type='exchange'
      AND content_id=$1 AND reporter_id=$2 AND reason='Item was damaged' AND status!='dismissed'
      ORDER BY created_at DESC LIMIT 1`, [id, reporterId])).rows[0];
    if (existing) return { id: existing.id, alreadyReported: true };
    // A borrower can disclose damage to their own borrowed item. Record that
    // explicitly; this report must never silently accuse the owner instead.
    const snapshot = { title: t.title, content: notes, photos: evidence, reporterRole: t.lender_id === reporterId ? 'owner' : 'borrower',
      listingId: t.listing_id, transactionId: id, pickupAt: t.actual_pickup_at, dueDate: t.requested_end_date };
    return (await db.query(`INSERT INTO safety_reports(reporter_id,reported_id,reason,content_type,content_id,content_snapshot)
      VALUES($1,$2,'Item was damaged','exchange',$3,$4::jsonb) RETURNING id`,
    [reporterId, t.borrower_id, id, JSON.stringify(snapshot)])).rows[0];
  });
}
