export const REPORT_RETURN_NOTICE = 'If the item is still missing, this exchange automatically closes 48 hours after the non-return report. It will be marked ‘Closed — item not returned’.';

export function exchangeIssueStatus(transaction) {
  if (transaction?.status === 'closed_unreturned') return {
    title: 'Closed — item not returned',
    detail: 'The exchange closed after the 48-hour response window. The report stays available for account review. Borrowhood does not recover items, cover loss or damage, or resolve disputes. If the item comes back later, the owner can record its return.',
  };
  if (!['picked_up', 'return_pending'].includes(transaction?.status) || transaction.actualReturnAt) return null;
  const reports = (transaction.issueReports || []).filter(report => report.status !== 'dismissed' && !report.resolved);
  if (!reports.length) return null;
  const missing = reports.some(report => report.reason === 'non_return');
  return {
    title: missing ? 'Item not returned · Issue reported' : 'Damage reported',
    detail: `${missing ? REPORT_RETURN_NOTICE : 'Damage report saved. Confirm the return only after the item is back.'} Borrowhood reviews reports for account access only; it does not recover items, cover loss or damage, or resolve disputes.`,
  };
}

export function reportReviewLabel(report) {
  return report.status === 'dismissed' ? 'Report dismissed'
    : report.status === 'confirmed' || report.status === 'reviewed' ? 'Account review complete'
    : 'Submitted for account review';
}
