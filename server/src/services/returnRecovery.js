import { query, withTransaction } from '../utils/db.js';
import { sendNotification } from './notifications.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
export async function ensureReturnRecoverySchema() {
  await withTransaction(async db => {
    await db.query(`CREATE TABLE IF NOT EXISTS return_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id UUID UNIQUE NOT NULL REFERENCES borrow_transactions(id),
      owner_id UUID REFERENCES users(id) ON DELETE SET NULL, borrower_id UUID REFERENCES users(id) ON DELETE SET NULL,
      detail TEXT NOT NULL, response TEXT, response_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','confirmed','dismissed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), response_due_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '48 hours',
      confirmed_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, version INTEGER NOT NULL DEFAULT 0,
      appeal TEXT, appeal_status TEXT CHECK(appeal_status IN ('pending','upheld','denied')));
      ALTER TABLE return_reports ADD COLUMN IF NOT EXISTS reported_due_date DATE;
      CREATE TABLE IF NOT EXISTS borrowing_restrictions (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        state TEXT NOT NULL CHECK(state IN ('hold','review','permanent')),
        until_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '14 days', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS return_review_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), report_id UUID NOT NULL REFERENCES return_reports(id),
        reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
        note TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS return_reports_borrower ON return_reports(borrower_id, created_at);
      CREATE INDEX IF NOT EXISTS return_reports_queue ON return_reports(status, appeal_status);
      CREATE OR REPLACE FUNCTION guard_restricted_borrowing() RETURNS trigger AS $$
      BEGIN
        IF (TG_OP='INSERT' AND NEW.status IN ('pending','approved','paid','picked_up')) OR
          (TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','paid','picked_up')) THEN
          PERFORM pg_advisory_xact_lock(hashtextextended(NEW.borrower_id::text,812770));
          IF EXISTS (SELECT 1 FROM borrowing_restrictions WHERE user_id=NEW.borrower_id) THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='Borrowing is paused. Open Return help in your profile to review your account.';
          END IF;
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS guard_restricted_borrowing ON borrow_transactions;
      CREATE TRIGGER guard_restricted_borrowing BEFORE INSERT OR UPDATE ON borrow_transactions
        FOR EACH ROW EXECUTE FUNCTION guard_restricted_borrowing();
      CREATE OR REPLACE FUNCTION resolve_return_report() RETURNS trigger AS $$
      BEGIN
        IF NEW.actual_return_at IS NOT NULL AND OLD.actual_return_at IS NULL THEN
          UPDATE return_reports SET resolved_at=NOW(), version=version+1 WHERE transaction_id=NEW.id AND resolved_at IS NULL;
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS resolve_return_report ON borrow_transactions;
      CREATE TRIGGER resolve_return_report AFTER UPDATE ON borrow_transactions FOR EACH ROW EXECUTE FUNCTION resolve_return_report();`);
  });
}
const lockBorrower = (db, id) => db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,812770))', [id]);
const notify = async (db, userId, type, t, key) => {
  const result = await sendNotification(userId, type, { transactionId: t.id, listingId: t.listing_id },
    { runQuery: db.query.bind(db), throwOnError: true, dedupeKey: key });
  if (!result) throw new Error('Could not save return update');
};
async function exchange(db, id, userId, admin = false) {
  const t = (await db.query(`SELECT t.*, l.listing_type FROM borrow_transactions t JOIN listings l ON l.id=t.listing_id
    WHERE t.id=$1 AND ($3 OR t.lender_id=$2 OR t.borrower_id=$2) FOR UPDATE OF t`, [id, userId, admin])).rows[0];
  if (!t) throw fail(404, 'Exchange not found.');
  return t;
}
function activeLoan(t) {
  if (['sell','giveaway'].includes(t.listing_type) || !t.actual_pickup_at || t.actual_return_at ||
    !['picked_up','return_pending'].includes(t.status)) throw fail(409, 'This item is not currently awaiting return. Refresh the exchange.');
}
export async function reportNonReturn(id, ownerId, detail) {
  return withTransaction(async db => {
    const t = await exchange(db, id, ownerId);
    if (t.lender_id !== ownerId) throw fail(403, 'Only the owner can report a missing return.');
    activeLoan(t);
    await lockBorrower(db, t.borrower_id);
    const overdue = (await db.query('SELECT $1::date < CURRENT_DATE AS overdue', [t.requested_end_date])).rows[0].overdue;
    if (!overdue) throw fail(409, 'Wait until the agreed return date has passed, or message your neighbor.');
    const existing = (await db.query(`SELECT *, reported_due_date < $2::date AS new_deadline FROM return_reports WHERE transaction_id=$1`, [id,t.requested_end_date])).rows[0];
    if (existing) {
      if (existing.status!=='dismissed' || !existing.new_deadline) return { id: existing.id, alreadyReported: true };
      await db.query(`INSERT INTO return_review_actions(report_id,reviewer_id,action,note) VALUES($1,$2,'Previous report',$3)`,
        [existing.id,ownerId,existing.detail + (existing.response ? '\nBorrower response: '+existing.response : '')]);
      await db.query(`UPDATE return_reports SET status='open',detail=$2,reported_due_date=$3,created_at=NOW(),response_due_at=NOW()+INTERVAL '48 hours',
        response=NULL,response_at=NULL,confirmed_at=NULL,resolved_at=NULL,appeal=NULL,appeal_status=NULL,version=version+1 WHERE id=$1`,[existing.id,detail,t.requested_end_date]);
      await notify(db,t.borrower_id,'return_reported_missing',t,`return-report:${existing.id}:${existing.version+1}`);
      return {id:existing.id};
    }
    const r = (await db.query(`INSERT INTO return_reports(transaction_id,owner_id,borrower_id,detail,reported_due_date)
      VALUES($1,$2,$3,$4,$5) RETURNING id`, [id, ownerId, t.borrower_id, detail,t.requested_end_date])).rows[0];
    await notify(db, t.borrower_id, 'return_reported_missing', t, `return-report:${r.id}`);
    return r;
  });
}
export async function extendReturn(id, ownerId, date) {
  return withTransaction(async db => {
    const t = await exchange(db, id, ownerId);
    if (t.lender_id !== ownerId) throw fail(403, 'Only the owner can extend the return date.');
    activeLoan(t);
    const valid = (await db.query(`SELECT $1::date > $2::date AND $1::date >= CURRENT_DATE
      AND $1::date <= CURRENT_DATE+90 AS valid`, [date, t.requested_end_date])).rows[0].valid;
    if (!valid) throw fail(400, 'Choose a later return date within the next 90 days.');
    await lockBorrower(db, t.borrower_id);
    await db.query('UPDATE borrow_transactions SET requested_end_date=$2, reminder_day_before_sent=false, reminder_day_of_sent=false WHERE id=$1', [id, date]);
    // An agreed new deadline ends an unconfirmed allegation. It never erases a reviewed incident.
    await db.query(`UPDATE return_reports SET status='dismissed', resolved_at=NOW(), version=version+1
      WHERE transaction_id=$1 AND status='open'`, [id]);
    await notify(db, t.borrower_id, 'return_date_extended', t, `return-date:${id}:${date}`);
    return { ok: true };
  });
}
export async function returnHelp(userId, admin = false, page = 1, transactionId = null) {
  const reports = (await query(`SELECT r.*, l.title, t.status AS exchange_status, t.requested_end_date AS due_date,
    t.actual_pickup_at, t.actual_return_at,
    COALESCE(NULLIF(o.display_name,''),o.first_name,'Deleted account') AS owner_name,
    COALESCE(NULLIF(b.display_name,''),b.first_name,'Deleted account') AS borrower_name
    FROM return_reports r JOIN borrow_transactions t ON t.id=r.transaction_id JOIN listings l ON l.id=t.listing_id
    LEFT JOIN users o ON o.id=r.owner_id LEFT JOIN users b ON b.id=r.borrower_id
    WHERE ($2 OR r.owner_id=$1 OR r.borrower_id=$1) AND ($4::uuid IS NULL OR r.transaction_id=$4)
    ORDER BY (r.appeal_status='pending') DESC NULLS LAST,(r.status='open') DESC,r.created_at DESC,r.id LIMIT 26 OFFSET $3`,
  [userId, admin, (page-1)*25, transactionId])).rows;
  const own = (await query('SELECT state,until_at FROM borrowing_restrictions WHERE user_id=$1', [userId])).rows[0] || null;
  for (const r of reports.slice(0,25)) {
    r.history = (await query(`SELECT action,note,created_at FROM return_review_actions WHERE report_id=$1 ORDER BY created_at,id`, [r.id])).rows;
    if (admin) {
      r.confirmed_owners = await confirmedOwners({ query }, r.borrower_id);
      r.restriction = (await query('SELECT state,until_at FROM borrowing_restrictions WHERE user_id=$1', [r.borrower_id])).rows[0] || null;
    }
  }
  return { reports: reports.slice(0,25), restriction: own, page, hasMore: reports.length>25 };
}
export async function respondReturnReport(reportId, borrowerId, text, version, appeal = false) {
  return withTransaction(async db => {
    const lookup = (await db.query('SELECT transaction_id FROM return_reports WHERE id=$1 AND borrower_id=$2', [reportId, borrowerId])).rows[0];
    if (!lookup) throw fail(404, 'Report not found.');
    const t = await exchange(db, lookup.transaction_id, borrowerId);
    await lockBorrower(db, borrowerId);
    const r = (await db.query('SELECT * FROM return_reports WHERE id=$1 FOR UPDATE', [reportId])).rows[0];
    if (r.version !== version) throw fail(409, 'This report changed. Refresh before responding.');
    if (appeal ? r.status!=='confirmed' || r.appeal_status==='pending' : r.status!=='open') throw fail(409, 'This report is no longer awaiting that response.');
    if (appeal) await db.query(`UPDATE return_reports SET appeal=$2,appeal_status='pending',version=version+1 WHERE id=$1`, [reportId,text]);
    else await db.query('UPDATE return_reports SET response=$2,response_at=NOW(),version=version+1 WHERE id=$1',[reportId,text]);
    await notify(db, t.lender_id, 'return_case_updated', t, `return-response:${reportId}:${version}`);
    return { ok: true };
  });
}
async function confirmedOwners(db, borrowerId) {
  return (await db.query(`SELECT COUNT(DISTINCT owner_id)::int AS count FROM return_reports
    WHERE borrower_id=$1 AND status='confirmed' AND created_at>=NOW()-INTERVAL '12 months'`, [borrowerId])).rows[0].count;
}
async function reconcileRestriction(db, borrowerId, create = true) {
  if (!create && !(await db.query('SELECT 1 FROM borrowing_restrictions WHERE user_id=$1',[borrowerId])).rows.length) return;
  const count = await confirmedOwners(db, borrowerId);
  if (count < 2) await db.query('DELETE FROM borrowing_restrictions WHERE user_id=$1', [borrowerId]);
  else await db.query(`INSERT INTO borrowing_restrictions(user_id,state) VALUES($1,$2)
    ON CONFLICT(user_id) DO UPDATE SET state=CASE
      WHEN $2='hold' THEN 'hold' WHEN borrowing_restrictions.state='permanent' THEN 'permanent' ELSE 'review' END,
      updated_at=NOW()`, [borrowerId, count>=3?'review':'hold']);
  return count;
}
export async function reviewReturnReport(reportId, adminId, action, note, version) {
  return withTransaction(async db => {
    const admin = (await db.query('SELECT is_admin FROM users WHERE id=$1', [adminId])).rows[0];
    if (!admin?.is_admin) throw fail(403, 'Administrator access is required.');
    const lookup = (await db.query('SELECT transaction_id FROM return_reports WHERE id=$1',[reportId])).rows[0];
    if (!lookup) throw fail(404,'Report not found.');
    const t = await exchange(db, lookup.transaction_id, adminId, true);
    if ([t.lender_id,t.borrower_id].includes(adminId)) throw fail(403,'Another administrator must review your own exchange.');
    await lockBorrower(db,t.borrower_id);
    const r = (await db.query('SELECT *,response_due_at<=NOW() AS response_due FROM return_reports WHERE id=$1 FOR UPDATE',[reportId])).rows[0];
    if (r.version !== version) throw fail(409,'This report changed. Refresh before deciding.');
    if (['confirm','dismiss'].includes(action)) {
      if (r.status!=='open') throw fail(409,'This report has already been reviewed.');
      if (action==='confirm' && (!r.response_due && !r.response)) throw fail(409,'Allow the borrower 48 hours to respond before confirming this report.');
      if (action==='confirm' && r.resolved_at) throw fail(409,'The item was returned or its deadline extended. A late return alone is not a non-return.');
      await db.query(`UPDATE return_reports SET status=$2,confirmed_at=CASE WHEN $2='confirmed' THEN NOW() ELSE NULL END WHERE id=$1`,[reportId,action==='confirm'?'confirmed':'dismissed']);
      if (action==='confirm') await reconcileRestriction(db,t.borrower_id);
    } else if (['overturn','uphold'].includes(action)) {
      if (r.appeal_status!=='pending') throw fail(409,'There is no pending appeal.');
      await db.query(`UPDATE return_reports SET appeal_status=$2,status=$3 WHERE id=$1`,[reportId,action==='overturn'?'upheld':'denied',action==='overturn'?'dismissed':'confirmed']);
      if (action==='overturn') await reconcileRestriction(db,t.borrower_id,false);
    } else if (action==='ban') {
      if (await confirmedOwners(db,t.borrower_id)<3 || r.status!=='confirmed' || r.appeal_status==='pending') throw fail(409,'Review three independent confirmed incidents and any pending appeal before a permanent ban.');
      const pending = (await db.query("SELECT 1 FROM return_reports WHERE borrower_id=$1 AND appeal_status='pending'",[t.borrower_id])).rows.length;
      if (pending) throw fail(409,'Review pending appeals first.');
      await db.query("UPDATE borrowing_restrictions SET state='permanent',updated_at=NOW() WHERE user_id=$1",[t.borrower_id]);
    } else if (action==='restore') {
      const restriction=(await db.query('SELECT * FROM borrowing_restrictions WHERE user_id=$1 FOR UPDATE',[t.borrower_id])).rows[0];
      if (!restriction || restriction.state!=='hold' || new Date(restriction.until_at)>new Date()) throw fail(409,'A temporary restriction must last at least 14 days. Review appeals to overturn an incorrect decision.');
      const unresolved=(await db.query("SELECT 1 FROM return_reports WHERE borrower_id=$1 AND status IN ('open','confirmed') AND resolved_at IS NULL",[t.borrower_id])).rows.length;
      if (unresolved) throw fail(409,'Resolve the outstanding returns before restoring borrowing.');
      await db.query('DELETE FROM borrowing_restrictions WHERE user_id=$1',[t.borrower_id]);
    } else throw fail(400,'Choose a review action.');
    await db.query('UPDATE return_reports SET version=version+1 WHERE id=$1',[reportId]);
    await db.query('INSERT INTO return_review_actions(report_id,reviewer_id,action,note) VALUES($1,$2,$3,$4)',[reportId,adminId,action,note]);
    await notify(db,t.borrower_id,'return_case_updated',t,`return-decision:${reportId}:${version}`);
    await notify(db,t.lender_id,'return_case_updated',t,`return-decision-owner:${reportId}:${version}`);
    return { ok:true };
  });
}
