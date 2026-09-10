import { SOURCE_PREFERENCES } from './notificationPreferences.js';

// This only narrows push delivery. Existing post visibility still determines
// recipients, and muted notifications remain in the in-app activity history.
export async function notificationAudienceAllowsPush(query, recipientId, senderId, prefs = {}) {
  if (SOURCE_PREFERENCES.every(key => prefs[key] !== false)) return true;
  if (!senderId || SOURCE_PREFERENCES.every(key => prefs[key] === false)) return false;
  const { rows } = await query(`SELECT
    EXISTS (SELECT 1 FROM friendships f WHERE f.status='accepted'
      AND ((f.user_id=$1 AND f.friend_id=$2) OR (f.friend_id=$1 AND f.user_id=$2))) AS is_friend,
    EXISTS (SELECT 1 FROM community_memberships a JOIN community_memberships b
      ON a.community_id=b.community_id WHERE a.user_id=$1 AND b.user_id=$2) AS is_neighbor,
    EXISTS (SELECT 1 FROM users a JOIN users b ON b.id=$2 WHERE a.id=$1
      AND NULLIF(TRIM(a.city),'') IS NOT NULL AND NULLIF(TRIM(a.state),'') IS NOT NULL
      AND LOWER(TRIM(a.city))=LOWER(TRIM(b.city))
      AND LOWER(TRIM(a.state))=LOWER(TRIM(b.state))) AS is_town`, [recipientId, senderId]);
  // Count each person once, using the closest connection.
  const match = rows[0];
  const source = match?.is_friend ? 'source_friends' : match?.is_neighbor ? 'source_neighborhood'
    : match?.is_town ? 'source_town' : null;
  return source !== null && prefs[source] !== false;
}
