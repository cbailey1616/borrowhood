import { readFile } from 'node:fs/promises';
import { query } from '../utils/db.js';
import { unblockedSql } from './contentPolicy.js';
import { canViewListing, canViewRequest } from './listingAccess.js';
import { getDiscussionThread } from './discussionNotifications.js';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👎'];
export const DISCUSSION_EMOJIS = [...REACTION_EMOJIS, '🔥', '🎉', '👀', '💯', '🙏', '🤔', '👏', '🙌', '😊', '✅', '🤝', '✨', '🛋️'];
export async function ensureDiscussionReactionSchema(db = { query }) {
  await db.query(await readFile(new URL('../../migrations/025_discussion_thread_controls.sql', import.meta.url), 'utf8'));
}
// Internal identifiers only. Blocked neighbors' reactions never expose identity.
export function publicReactionSql(table, column, alias, viewer) {
  return `COALESCE((SELECT json_agg(json_build_object('userId', rx.user_id, 'emoji', rx.emoji))
    FROM ${table} rx WHERE rx.${column}=${alias}.id AND ${unblockedSql('rx.user_id', viewer)}), '[]'::json)`;
}
export function discussionReaction(target) {
  return async (req, res) => {
    if (![req.params.listingId || req.params.requestId,req.params.postId].every(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return res.status(400).json({error:'Invalid comment'});
    const targetId = req.params.listingId || req.params.requestId;
    if ((req.method !== 'DELETE' || req.query.emoji) && !DISCUSSION_EMOJIS.includes(req.method === 'DELETE' ? req.query.emoji : req.body.emoji)) return res.status(400).json({ error: 'Choose a supported reaction' });
    try {
      const allowed = target === 'listing' ? await canViewListing(targetId, req.user.id) : await canViewRequest(targetId, req.user.id);
      if (!allowed || !await getDiscussionThread(target, targetId, req.params.postId, req.user.id)) return res.status(404).json({ error: 'Comment no longer available' });
      if (req.method === 'DELETE') await query(`DELETE FROM discussion_reactions WHERE discussion_id=$1 AND user_id=$2${req.query.emoji ? ' AND emoji=$3' : ''}`,
        [req.params.postId, req.user.id, ...(req.query.emoji ? [req.query.emoji] : [])]);
      else await query(`INSERT INTO discussion_reactions(discussion_id,user_id,emoji) VALUES($1,$2,$3)
        ON CONFLICT(discussion_id,user_id,emoji) DO NOTHING`, [req.params.postId, req.user.id, req.body.emoji]);
      res.json({ success: true });
    } catch { res.status(500).json({ error: 'Could not update reaction' }); }
  };
}
