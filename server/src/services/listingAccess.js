import { query } from '../utils/db.js';
import { listingAccessSql, requestAccessSql, normalizeSharing } from '../utils/sharingPolicy.js';
import { requestActiveSql } from '../utils/requestState.js';

export async function canViewListing(listingId, userId, options) {
  const result = await query(`SELECT l.id FROM listings l WHERE l.id = $1
    AND ${listingAccessSql('l', '$2', options)}`, [listingId, userId]);
  return result.rows.length > 0;
}

export async function canViewRequest(requestId, userId) {
  const result = await query(`SELECT r.id FROM item_requests r WHERE r.id = $1
    AND ${requestAccessSql('r', '$2')}`, [requestId, userId]);
  return result.rows.length > 0;
}

export async function validateSharing(body, userId) {
  let scopes;
  try { scopes = normalizeSharing(body.visibility); }
  catch (error) { return { error: error.message }; }
  if (!scopes.includes('private') && body.sharingConfirmed !== true) {
    return { error: 'Please review and confirm who can see this item in the latest app.' };
  }
  if (scopes.includes('town')) {
    const town = await query(`SELECT id FROM users WHERE id = $1 AND status != 'suspended'
      AND NULLIF(TRIM(city), '') IS NOT NULL AND NULLIF(TRIM(state), '') IS NOT NULL`, [userId]);
    if (!town.rows.length) return { error: 'Add your town and state to your profile before posting to Town.' };
  }
  if (scopes.includes('neighborhood')) {
    if (!body.communityId) return { error: 'Join a neighborhood before sharing with neighbors.' };
    const member = await query(`SELECT 1 FROM community_memberships
      WHERE community_id = $1 AND user_id = $2`, [body.communityId, userId]);
    if (!member.rows.length) return { error: 'Choose a neighborhood you belong to.' };
  }
  if (scopes.includes('circle')) {
    if (!body.circleId) return { error: 'Choose the invite-only group that can see this item.' };
    const member = await query(`SELECT 1 FROM lending_circle_members
      WHERE circle_id = $1 AND user_id = $2 AND status = 'active'`, [body.circleId, userId]);
    if (!member.rows.length) return { error: 'You must be an active member of the selected group.' };
  }
  return {
    scopes,
    circleId: scopes.includes('circle') ? body.circleId : null,
    communityId: scopes.includes('neighborhood') ? body.communityId : null,
  };
}

// An offer grants access to one item, to one requester, for a limited time.
// It does not change the item's audience or grant access to the owner's profile inventory.
export async function offerListing(requestId, listingId, ownerId) {
  const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
  const request = await query(`SELECT r.user_id, ${requestActiveSql('r')} AS accepting_offers
    FROM item_requests r WHERE r.id = $1 AND ${requestAccessSql('r', '$2')}`, [requestId, ownerId]);
  if (!request.rows.length) throw fail(404, 'REQUEST_NOT_FOUND', 'Request not found or no longer shared with you.');
  if (request.rows[0].user_id === ownerId) throw fail(400, 'OWN_REQUEST', 'You cannot offer an item to your own request.');
  if (!request.rows[0].accepting_offers) throw fail(410, 'REQUEST_ENDED', 'This request has ended. Ask the requester to renew it.');
  const result = await query(`INSERT INTO listing_shares (listing_id, user_id, request_id, expires_at)
    SELECT l.id, r.user_id, r.id, NOW() + INTERVAL '14 days'
    FROM listings l CROSS JOIN item_requests r
    WHERE l.id = $1 AND l.owner_id = $2 AND l.status = 'active' AND l.is_available = true
      AND r.id = $3 AND r.user_id != $2 AND ${requestActiveSql('r')}
      AND ${requestAccessSql('r', '$2')}
    ON CONFLICT (listing_id, user_id, request_id) DO UPDATE
      SET revoked_at = NULL, expires_at = NOW() + INTERVAL '14 days'
    RETURNING user_id`, [listingId, ownerId, requestId]);
  if (!result.rows.length) throw fail(409, 'OFFER_UNAVAILABLE', 'The item or request is no longer available. Refresh and try again.');
  return result.rows[0].user_id;
}
