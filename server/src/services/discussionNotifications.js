import { query } from '../utils/db.js';
import { canViewListing, canViewRequest } from './listingAccess.js';
import { sendNotification } from './notifications.js';

export async function notifyThreadParticipants({ threadId, listingId, requestId, senderId, discussionId, posterName, itemTitle, db = { query }, throwOnError = false }) {
  const { rows } = await db.query(`SELECT DISTINCT user_id FROM listing_discussions
    WHERE (id=$1 OR parent_id=$1) AND is_hidden=false AND user_id<>$2
    AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
      (b.user_id=$2 AND b.blocked_id=listing_discussions.user_id) OR
      (b.blocked_id=$2 AND b.user_id=listing_discussions.user_id))`, [threadId, senderId]);
  for (const { user_id } of rows) {
    const allowed = requestId ? await canViewRequest(requestId, user_id, db) : await canViewListing(listingId, user_id, undefined, db);
    if (allowed) await sendNotification(user_id, 'discussion_reply', { posterName, itemTitle }, {
      fromUserId: senderId, listingId, requestId, discussionId, threadId,
      dedupeKey: `discussion:${discussionId}`,
      runQuery: db.query.bind(db), throwOnError,
    });
  }
}

export async function getDiscussionThread(target, targetId, postId, userId) {
  const column = target === 'request' ? 'request_id' : 'listing_id';
  const { rows: [post] } = await query(`SELECT root.id, root.content, root.reply_count, root.created_at,
    u.id AS user_id, u.first_name, u.last_name, u.display_name, u.profile_photo_url,
    target.id AS target_id, target.parent_id,
    (SELECT COUNT(*) FROM listing_discussions r WHERE r.parent_id=root.id AND r.is_hidden=false
      AND (r.created_at, r.id)<=(target.created_at, target.id)) AS reply_position
    FROM listing_discussions target
    JOIN listing_discussions root ON root.id=COALESCE(target.parent_id, target.id)
    JOIN users u ON u.id=root.user_id
    WHERE target.id=$1 AND target.${column}=$2 AND root.${column}=$2
      AND target.is_hidden=false AND root.is_hidden=false`, [postId, targetId]);
  if (!post) return null;
  return {
    post: { id: post.id, content: post.content, replyCount: post.reply_count, createdAt: post.created_at,
      isOwn: post.user_id === userId, user: { id: post.user_id,
        firstName: post.display_name || post.first_name,
        lastName: post.display_name ? '' : post.last_name ? `${post.last_name[0]}.` : '', profilePhotoUrl: post.profile_photo_url } },
    replyPage: post.parent_id ? Math.max(1, Math.ceil(Number(post.reply_position) / 50)) : 1,
  };
}
