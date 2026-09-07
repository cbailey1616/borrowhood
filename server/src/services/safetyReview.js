import { query, withTransaction } from '../utils/db.js';

export async function ensureSafetyReviewSchema() {
  await withTransaction(async db => {
    await db.query(`ALTER TABLE safety_reports
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
    // Reports survive account deletion without preventing the deletion itself.
    await db.query(`ALTER TABLE safety_reports
      DROP CONSTRAINT IF EXISTS safety_reports_reporter_id_fkey,
      DROP CONSTRAINT IF EXISTS safety_reports_reported_id_fkey`);
    await db.query(`ALTER TABLE safety_reports
      ADD CONSTRAINT safety_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
      ADD CONSTRAINT safety_reports_reported_id_fkey FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE SET NULL`);
    await db.query(`ALTER TABLE users
      ADD COLUMN IF NOT EXISTS moderation_suspended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS moderation_previous_status TEXT`);
    await db.query(`CREATE TABLE IF NOT EXISTS safety_review_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id UUID NOT NULL REFERENCES safety_reports(id) ON DELETE CASCADE,
      admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL CHECK (action IN ('dismiss','reopen','suspend','restore')),
      note TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await db.query('CREATE INDEX IF NOT EXISTS safety_reports_queue_idx ON safety_reports(status, created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS safety_reports_person_idx ON safety_reports(reported_id)');
    await db.query('CREATE INDEX IF NOT EXISTS safety_review_actions_report_idx ON safety_review_actions(report_id, created_at)');
  });
}

const failure = (status, message) => Object.assign(new Error(message), { status });
const personName = alias => `COALESCE(NULLIF(${alias}.display_name,''), NULLIF(TRIM(CONCAT_WS(' ',${alias}.first_name,${alias}.last_name)),''), 'Deleted account')`;

export async function listSafetyReports(status, page) {
  const result = await query(`SELECT r.id, r.reason, r.status, r.version, r.created_at AS "createdAt",
    r.reviewed_at AS "reviewedAt", r.reporter_id AS "reporterId", r.reported_id AS "reportedId",
    ${personName('reporter')} AS "reporterName", ${personName('reported')} AS "reportedName",
    reported.status AS "accountStatus", reported.is_admin AS "reportedIsAdmin",
    (reported.status = 'suspended' AND reported.moderation_suspended_at IS NOT NULL
      AND reported.email NOT LIKE '%@deleted.borrowhood.com') AS "canRestore",
    (SELECT COUNT(*)::int FROM safety_reports other WHERE other.reported_id=r.reported_id) AS "reportCount",
    (SELECT COUNT(*)::int FROM borrow_transactions b WHERE (b.borrower_id=r.reported_id OR b.lender_id=r.reported_id)
      AND b.status IN ('approved','paid','picked_up','return_pending')) AS "activeExchanges"
    FROM safety_reports r LEFT JOIN users reporter ON reporter.id=r.reporter_id
    LEFT JOIN users reported ON reported.id=r.reported_id
    WHERE ($1::text = 'all' OR r.status=$1)
    ORDER BY r.created_at DESC, r.id DESC LIMIT 26 OFFSET $2`, [status, (page - 1) * 25]);
  const reports = result.rows.slice(0, 25);
  if (reports.length) {
    const history = await query(`SELECT a.report_id AS "reportId", a.action, a.note, a.created_at AS "createdAt",
      ${personName('u')} AS "adminName" FROM safety_review_actions a LEFT JOIN users u ON u.id=a.admin_id
      WHERE a.report_id=ANY($1::uuid[]) ORDER BY a.created_at DESC, a.id DESC`, [reports.map(r => r.id)]);
    for (const report of reports) report.history = history.rows.filter(a => a.reportId === report.id);
  }
  return { reports, page, hasMore: result.rows.length > 25 };
}

export async function reviewSafetyReport(adminId, reportId, { action, note, version }) {
  return withTransaction(async db => {
    const report = (await db.query('SELECT * FROM safety_reports WHERE id=$1 FOR UPDATE', [reportId])).rows[0];
    if (!report) throw failure(404, 'Report not found.');
    if (report.version !== version) throw failure(409, 'This report changed. Refresh it before making a decision.');
    if (['suspend','restore'].includes(action)) {
      const account = (await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [report.reported_id])).rows[0];
      if (!account || account.email?.endsWith('@deleted.borrowhood.com')) throw failure(409, 'This account has been deleted.');
      if (account.id === adminId || account.is_admin) throw failure(403, 'Administrator accounts cannot be suspended here.');
      if (action === 'suspend') {
        if (account.status === 'suspended') throw failure(409, 'This account is already suspended.');
        await db.query(`UPDATE users SET moderation_previous_status=status::text,
          moderation_suspended_at=NOW(), status='suspended', token_invalidated_at=NOW() WHERE id=$1`, [account.id]);
      } else {
        if (account.status !== 'suspended' || !account.moderation_suspended_at) throw failure(409, 'This account has no review suspension to restore.');
        // Never elevate an unverified account during restoration.
        await db.query(`UPDATE users SET status=$2::user_status,
          moderation_suspended_at=NULL, moderation_previous_status=NULL WHERE id=$1`,
        [account.id, account.is_verified && account.moderation_previous_status === 'verified' ? 'verified' : 'pending']);
      }
    }
    const status = action === 'reopen' ? 'open' : action === 'dismiss' ? 'dismissed' : 'reviewed';
    await db.query(`UPDATE safety_reports SET status=$2, version=version+1, reviewed_at=NOW() WHERE id=$1`, [reportId, status]);
    await db.query(`INSERT INTO safety_review_actions(report_id, admin_id, action, note) VALUES($1,$2,$3,$4)`, [reportId, adminId, action, note]);
    return { ok: true, status, version: version + 1 };
  });
}
