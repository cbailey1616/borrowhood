import { query } from '../utils/db.js';
import { visibleDiscussionSql } from './discussionControls.js';
import { unblockedSql } from './contentPolicy.js';

// Count the visible discussion, including replies, in one query for the page.
export async function attachFeedCommentCounts(items, viewerId) {
  const visible = items.filter(item => !item.ownerMasked && !item.previewOnly);
  if (!visible.length) return;
  const listingIds = [...new Set(visible.filter(item => item.type === 'listing').map(item => item.id))];
  const requestIds = [...new Set(visible.filter(item => item.type === 'request').map(item => item.id))];
  const { rows } = await query(`
    SELECT d.listing_id, d.request_id, COUNT(*)::int AS comment_count
    FROM listing_discussions d
    WHERE (d.listing_id = ANY($1::uuid[]) OR d.request_id = ANY($2::uuid[]))
      AND d.is_hidden = false AND ${unblockedSql('d.user_id', '$3')}
      AND ${visibleDiscussionSql('d', '$3')}
    GROUP BY d.listing_id, d.request_id`, [listingIds, requestIds, viewerId]);
  const counts = new Map(rows.map(row => [row.listing_id ? `listing:${row.listing_id}` : `request:${row.request_id}`, Number(row.comment_count)]));
  for (const item of visible) item.commentCount = counts.get(`${item.type}:${item.id}`) || 0;
}
