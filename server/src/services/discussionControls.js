import { query } from '../utils/db.js';
import { unblockedSql } from './contentPolicy.js';
import { canViewListing, canViewRequest } from './listingAccess.js';
import { getDiscussionThread } from './discussionNotifications.js';

// Identifiers are supplied only by internal route code, never by request text.
export function discussionVoteSql(alias, viewer) {
  return `COALESCE((SELECT SUM(v.value)::int FROM discussion_votes v WHERE v.discussion_id=${alias}.id
    AND ${unblockedSql('v.user_id', viewer)}),0) AS score,
    COALESCE((SELECT v.value FROM discussion_votes v WHERE v.discussion_id=${alias}.id AND v.user_id=${viewer}),0) AS viewer_vote`;
}

// A visible child must have an entirely visible ancestry, including both block directions.
// The path guard also makes legacy or manually corrupted cycles fail closed.
export function visibleDiscussionSql(alias, viewer) {
  return `NOT EXISTS (WITH RECURSIVE ancestors AS (
    SELECT p.id, p.parent_id, p.reply_to_id, p.user_id, p.is_hidden, ARRAY[p.id] AS path
      FROM listing_discussions p WHERE p.id=COALESCE(${alias}.reply_to_id,${alias}.parent_id)
    UNION ALL
    SELECT p.id,p.parent_id,p.reply_to_id,p.user_id,p.is_hidden,a.path||p.id
      FROM listing_discussions p JOIN ancestors a ON p.id=COALESCE(a.reply_to_id,a.parent_id)
      WHERE NOT p.id=ANY(a.path)
  ) SELECT 1 FROM ancestors a WHERE a.is_hidden=true OR NOT ${unblockedSql('a.user_id', viewer)}
    OR COALESCE(a.reply_to_id,a.parent_id)=ANY(a.path))`;
}

export function discussionVote(target) {
  return async (req, res) => {
    const targetId = req.params.listingId || req.params.requestId;
    const ids = [targetId, req.params.postId];
    if (!ids.every(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      || ![-1, 0, 1].includes(req.body.value)) return res.status(400).json({ error: 'Choose a valid vote' });
    try {
      const allowed = target === 'listing' ? await canViewListing(targetId, req.user.id) : await canViewRequest(targetId, req.user.id);
      if (!allowed || !await getDiscussionThread(target, targetId, req.params.postId, req.user.id)) return res.status(404).json({ error: 'Comment no longer available' });
      // Set the requested state, rather than toggling on the server: retries are safe.
      if (req.body.value === 0) await query('DELETE FROM discussion_votes WHERE discussion_id=$1 AND user_id=$2', ids.slice(1).concat(req.user.id));
      else await query(`INSERT INTO discussion_votes(discussion_id,user_id,value) VALUES($1,$2,$3)
        ON CONFLICT(discussion_id,user_id) DO UPDATE SET value=EXCLUDED.value`, [req.params.postId, req.user.id, req.body.value]);
      const { rows: [vote] } = await query(`SELECT ${discussionVoteSql('d', '$2')} FROM listing_discussions d WHERE d.id=$1`, [req.params.postId, req.user.id]);
      res.json({ score: vote.score, viewerVote: vote.viewer_vote });
    } catch { res.status(500).json({ error: 'Could not update vote' }); }
  };
}
