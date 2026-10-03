// Damage reports stay private to their author. Non-return reports are shared
// with the borrower so they can use the existing response/appeal workflow.
// Only summary fields are returned; moderation notes and evidence stay private.
export function exchangeReportSummarySql(viewer) {
  return `(SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'status', r.status,
    'createdAt', r.created_at, 'autoCloseAt', r.auto_close_at, 'resolved', r.resolved,
    'reportedByMe', r.reporter_id=${viewer}) ORDER BY r.created_at DESC, r.id), '[]'::jsonb)
    FROM (
      SELECT id, 'non_return'::text AS reason, status, created_at,
        resolved_at IS NOT NULL AS resolved, owner_id AS reporter_id, response_due_at AS auto_close_at
      FROM return_reports WHERE transaction_id=t.id
      UNION ALL
      SELECT id, 'damage'::text, status, created_at, false, reporter_id, NULL::timestamptz
      FROM safety_reports WHERE content_type='exchange' AND content_id=t.id
        AND reason='Item was damaged' AND reporter_id=${viewer}
    ) r) AS issue_reports`;
}
