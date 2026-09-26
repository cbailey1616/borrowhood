import { query, withTransaction } from '../utils/db.js';
import { sendNotification } from './notifications.js';

// A deleted membership alone cannot distinguish removal from voluntarily leaving.
// Keep the restriction until a current moderator explicitly approves the return.
export async function ensureCommunityMembershipSchema(db = { query }) {
  await db.query(`CREATE TABLE IF NOT EXISTS community_member_removals (
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    removed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    removed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    requested_at TIMESTAMPTZ,
    PRIMARY KEY (community_id, user_id)
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS community_rejoin_pending
    ON community_member_removals (community_id, requested_at) WHERE requested_at IS NOT NULL`);
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

// All membership mutations take the same lock, including leave and promotion.
// A simultaneous join cannot slip between recording a removal and deleting access.
export async function withCommunityMembershipLock(communityId, action) {
  return withTransaction(async client => {
    const result = await client.query('SELECT * FROM communities WHERE id = $1 FOR UPDATE', [communityId]);
    if (!result.rows.length) fail(404, 'Community not found');
    return action(client, result.rows[0]);
  });
}

export async function requireCommunityModerator(client, communityId, userId) {
  const result = await client.query(
    'SELECT role FROM community_memberships WHERE community_id = $1 AND user_id = $2', [communityId, userId]);
  if (result.rows[0]?.role !== 'organizer') fail(403, 'Only neighborhood stewards can review requests or manage members');
}

async function checkJoinLocation(client, community, userId) {
  if (!community.is_active) fail(403, 'This neighborhood is no longer active.');
  const result = await client.query('SELECT city FROM users WHERE id = $1', [userId]);
  const userCity = result.rows[0]?.city;
  if (userCity && community.city && userCity.toLowerCase() !== community.city.toLowerCase()) {
    fail(403, 'You can only join communities in your city.');
  }
}

export async function joinCommunity(communityId, userId) {
  return withCommunityMembershipLock(communityId, async (client, community) => {
    await checkJoinLocation(client, community, userId);
    const removed = await client.query(
      'SELECT requested_at FROM community_member_removals WHERE community_id = $1 AND user_id = $2', [communityId, userId]);
    if (removed.rows.length) {
      if (!removed.rows[0].requested_at) {
        const pending = await client.query(`UPDATE community_member_removals SET requested_at = clock_timestamp()
          WHERE community_id = $1 AND user_id = $2 RETURNING requested_at::text`, [communityId, userId]);
        const requester = await client.query('SELECT first_name, display_name FROM users WHERE id = $1', [userId]);
        const moderators = await client.query(
          "SELECT user_id FROM community_memberships WHERE community_id = $1 AND role = 'organizer'", [communityId]);
        for (const moderator of moderators.rows) {
          await sendNotification(moderator.user_id, 'join_request', {
            communityId, communityName: community.name, rejoin: true,
            userName: requester.rows[0]?.display_name || requester.rows[0]?.first_name || 'A neighbor',
          }, {
            fromUserId: userId, runQuery: client.query.bind(client), throwOnError: true,
            dedupeKey: `rejoin:${communityId}:${userId}:${pending.rows[0].requested_at}`,
          });
        }
      }
      // Commit the request before returning the denial; throwing would roll it back.
      return { approvalRequired: true };
    }
    await client.query(`INSERT INTO community_memberships (user_id, community_id, joined_at)
      VALUES ($1, $2, clock_timestamp()) ON CONFLICT DO NOTHING`, [userId, communityId]);
    return { success: true };
  });
}

export async function removeCommunityMember(communityId, userId, moderatorId) {
  return withCommunityMembershipLock(communityId, async client => {
    await requireCommunityModerator(client, communityId, moderatorId);
    if (userId === moderatorId) fail(400, 'Cannot remove yourself');
    const target = await client.query(
      'SELECT role FROM community_memberships WHERE community_id = $1 AND user_id = $2', [communityId, userId]);
    if (!target.rows.length) fail(404, 'Member not found');
    if (target.rows[0].role === 'organizer') fail(400, 'Stewards cannot remove another steward');
    await client.query(`INSERT INTO community_member_removals (community_id, user_id, removed_by)
      VALUES ($1, $2, $3) ON CONFLICT (community_id, user_id) DO UPDATE
      SET removed_by = EXCLUDED.removed_by, removed_at = clock_timestamp(), requested_at = NULL`,
    [communityId, userId, moderatorId]);
    await client.query('DELETE FROM community_memberships WHERE community_id = $1 AND user_id = $2', [communityId, userId]);
    return { success: true };
  });
}

export async function getRejoinRequests(communityId, moderatorId) {
  return withCommunityMembershipLock(communityId, async client => {
    await requireCommunityModerator(client, communityId, moderatorId);
    const result = await client.query(`SELECT u.id, u.first_name, u.last_name, u.display_name, u.profile_photo_url, r.requested_at
      FROM community_member_removals r JOIN users u ON u.id = r.user_id
      WHERE r.community_id = $1 AND r.requested_at IS NOT NULL ORDER BY r.requested_at, u.id LIMIT 100`, [communityId]);
    return result.rows.map(row => ({
      id: row.id, firstName: row.display_name || row.first_name,
      lastName: row.display_name ? '' : (row.last_name ? `${row.last_name.charAt(0)}.` : ''),
      profilePhotoUrl: row.profile_photo_url, requestedAt: row.requested_at,
    }));
  });
}

export async function reviewRejoinRequest(communityId, userId, moderatorId, approve) {
  return withCommunityMembershipLock(communityId, async (client, community) => {
    await requireCommunityModerator(client, communityId, moderatorId);
    const pending = await client.query(`SELECT requested_at FROM community_member_removals
      WHERE community_id = $1 AND user_id = $2 AND requested_at IS NOT NULL`, [communityId, userId]);
    if (!pending.rows.length) fail(404, 'This request has already been reviewed or is no longer available.');
    if (approve) {
      await checkJoinLocation(client, community, userId);
      // An approved return starts a new membership and a new chat-history boundary.
      await client.query(`INSERT INTO community_memberships (community_id, user_id, role, joined_at)
        VALUES ($1, $2, 'member', clock_timestamp()) ON CONFLICT DO NOTHING`, [communityId, userId]);
      await client.query('DELETE FROM community_member_removals WHERE community_id = $1 AND user_id = $2', [communityId, userId]);
      await sendNotification(userId, 'join_approved', { communityId, communityName: community.name, rejoin: true }, {
        fromUserId: moderatorId, runQuery: client.query.bind(client), throwOnError: true,
      });
    } else {
      // Declining clears only the pending request, never the removal restriction.
      await client.query('UPDATE community_member_removals SET requested_at = NULL WHERE community_id = $1 AND user_id = $2', [communityId, userId]);
    }
    return { success: true };
  });
}
