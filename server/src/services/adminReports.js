import { query } from '../utils/db.js';

const personName = alias => `COALESCE(NULLIF(${alias}.display_name,''),
  NULLIF(TRIM(CONCAT_WS(' ',${alias}.first_name,${alias}.last_name)),''), 'Deleted account')`;

// The dashboard reads both queues. Decisions still use their existing review
// services, including response periods, appeals and version checks.
const reportQueue = `WITH reports AS (
  SELECT r.id, 'return'::text AS source, 'non_return'::text AS issue,
    COALESCE(l.title, 'Borrowed item') AS title, 'Item wasn’t returned'::text AS reason,
    LEFT(r.detail, 180) AS detail, r.status, r.created_at,
    ${personName('reporter')} AS reporter_name, ${personName('reported')} AS reported_name,
    'owner'::text AS reporter_role, reported.status::text AS account_status,
    CARDINALITY(r.photos) AS photo_count, r.response_due_at,
    (r.resolved_at IS NOT NULL) AS return_resolved,
    CASE WHEN r.appeal_status='pending' THEN 'appeal'
      WHEN r.status='open' AND r.resolved_at IS NULL AND r.response IS NULL AND r.response_due_at>NOW() THEN 'waiting'
      WHEN r.status='open' THEN 'ready' ELSE 'reviewed' END AS queue_status
  FROM return_reports r
  LEFT JOIN borrow_transactions t ON t.id=r.transaction_id
  LEFT JOIN listings l ON l.id=t.listing_id
  LEFT JOIN users reporter ON reporter.id=r.owner_id
  LEFT JOIN users reported ON reported.id=r.borrower_id
  UNION ALL
  SELECT r.id, 'safety'::text,
    CASE WHEN r.content_type='exchange' THEN 'damage' ELSE 'other' END,
    COALESCE(NULLIF(r.content_snapshot->>'title',''),
      CASE WHEN r.content_type='exchange' THEN 'Item damage report' ELSE 'Safety report' END),
    r.reason, LEFT(r.content_snapshot->>'content', 180), r.status, r.created_at,
    ${personName('reporter')}, ${personName('reported')},
    CASE WHEN r.content_type='exchange' THEN r.content_snapshot->>'reporterRole' END,
    reported.status::text,
    CASE WHEN JSONB_TYPEOF(r.content_snapshot->'photos')='array'
      THEN JSONB_ARRAY_LENGTH(r.content_snapshot->'photos') ELSE 0 END,
    NULL::timestamptz, false,
    CASE WHEN r.status='open' THEN 'ready' ELSE 'reviewed' END
  FROM safety_reports r
  LEFT JOIN users reporter ON reporter.id=r.reporter_id
  LEFT JOIN users reported ON reported.id=r.reported_id
), scoped AS (SELECT * FROM reports WHERE ($1::text='all' OR issue=$1))`;

export async function listAdminReports(issue = 'all', state = 'pending', page = 1) {
  const [counts, result] = await Promise.all([
    query(`${reportQueue} SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE queue_status='ready')::int AS ready,
      COUNT(*) FILTER (WHERE queue_status='waiting')::int AS waiting,
      COUNT(*) FILTER (WHERE queue_status='appeal')::int AS appeals,
      COUNT(*) FILTER (WHERE queue_status='reviewed')::int AS reviewed FROM scoped`, [issue]),
    query(`${reportQueue} SELECT * FROM scoped
      WHERE ($2::text='all' OR ($2='pending' AND queue_status<>'reviewed') OR ($2='reviewed' AND queue_status='reviewed'))
      ORDER BY CASE queue_status WHEN 'appeal' THEN 0 WHEN 'ready' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
        created_at DESC, id DESC, source LIMIT 26 OFFSET $3`, [issue, state, (page - 1) * 25]),
  ]);
  const reports = result.rows.slice(0, 25).map(row => ({
    id: row.id, source: row.source, issue: row.issue, title: row.title,
    reason: row.reason, detail: row.detail, status: row.status, createdAt: row.created_at,
    reporterName: row.reporter_name, reportedName: row.reported_name,
    reporterRole: row.reporter_role, accountStatus: row.account_status,
    photoCount: row.photo_count, responseDueAt: row.response_due_at,
    returnResolved: row.return_resolved, queueStatus: row.queue_status,
  }));
  return { reports, counts: counts.rows[0], page, hasMore: result.rows.length > 25 };
}
