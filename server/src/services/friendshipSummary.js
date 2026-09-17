import { query } from '../utils/db.js';

export async function friendshipSummary(viewerId, profileId) {
  if (viewerId === profileId) return { status: 'self' };
  const { rows } = await query(
    `SELECT id, user_id, friend_id, status FROM friendships
     WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
       AND status IN ('accepted', 'pending')
     ORDER BY CASE WHEN status = 'accepted' THEN 0 WHEN friend_id = $1 THEN 1 ELSE 2 END
     LIMIT 1`,
    [viewerId, profileId]
  );
  const relationship = rows[0];
  if (!relationship) return { status: 'none' };
  if (relationship.status === 'accepted') return { status: 'accepted' };
  return { status: relationship.user_id === viewerId ? 'pending' : 'received' };
}
