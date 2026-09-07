// One deny-by-default policy for every listing read. SQL aliases/parameter
// references are supplied by application code, never by request input.
import { requestActiveSql } from './requestState.js';
export const LISTING_SCOPES = ['private', 'close_friends', 'neighborhood', 'circle', 'town'];

export function normalizeSharing(value) {
  const scopes = value === undefined ? ['private'] : value;
  if (!Array.isArray(scopes) || !scopes.length || scopes.some(s => !LISTING_SCOPES.includes(s))) {
    throw new Error('Choose a valid sharing audience.');
  }
  if (scopes.includes('private') && scopes.length > 1) {
    throw new Error('Only me cannot be combined with a shared audience.');
  }
  return [...new Set(scopes)];
}

export function audienceSql(alias, ownerColumn, viewer, { circle = false, town = true } = {}) {
  const owner = `${alias}.${ownerColumn}`;
  const scope = s => `'${s}' = ANY(string_to_array(${alias}.visibility::text, ','))`;
  return `(EXISTS (SELECT 1 FROM users audience_owner WHERE audience_owner.id=${owner} AND audience_owner.status != 'suspended') AND (
    ${owner} = ${viewer} OR
    (${scope('close_friends')} AND EXISTS (
      SELECT 1 FROM friendships sf WHERE sf.status = 'accepted'
      AND ((sf.user_id = ${owner} AND sf.friend_id = ${viewer})
        OR (sf.friend_id = ${owner} AND sf.user_id = ${viewer})))) OR
    ${circle ? `(${scope('circle')} AND EXISTS (
      SELECT 1 FROM lending_circle_members sm
      JOIN lending_circle_members so ON so.circle_id = sm.circle_id
      WHERE sm.circle_id = ${alias}.circle_id AND sm.user_id = ${viewer}
        AND so.user_id = ${owner} AND sm.status = 'active' AND so.status = 'active')) OR` : ''}
    (${scope('neighborhood')} AND EXISTS (
      SELECT 1 FROM community_memberships sm
      JOIN community_memberships so ON so.community_id = sm.community_id
      WHERE sm.community_id = ${alias}.community_id AND sm.user_id = ${viewer}
        AND so.user_id = ${owner})) OR
    ${town ? `(${scope('town')} AND EXISTS (
      SELECT 1 FROM users sv JOIN users so ON so.id = ${owner}
      WHERE sv.id = ${viewer} AND sv.is_verified = true
        AND sv.status != 'suspended' AND so.status != 'suspended'
        AND NULLIF(TRIM(sv.city), '') IS NOT NULL AND NULLIF(TRIM(sv.state), '') IS NOT NULL
        AND LOWER(TRIM(sv.city)) = LOWER(TRIM(so.city))
        AND LOWER(TRIM(sv.state)) = LOWER(TRIM(so.state))))` : 'false'}
  ))`;
}

export function listingAccessSql(alias, viewer, { discovery = false } = {}) {
  return `COALESCE((${alias}.status != 'deleted' AND (
    ${alias}.owner_id = ${viewer} OR
    (${alias}.privacy_version = 1 AND ${audienceSql(alias, 'owner_id', viewer, { circle: true })})
    ${discovery ? '' : `OR EXISTS (SELECT 1 FROM listing_shares ss
      JOIN item_requests sr ON sr.id = ss.request_id
      WHERE ss.listing_id = ${alias}.id AND ss.user_id = ${viewer}
        AND EXISTS (SELECT 1 FROM users share_owner WHERE share_owner.id=${alias}.owner_id AND share_owner.status != 'suspended')
        AND ss.revoked_at IS NULL AND ss.expires_at > NOW() AND ${requestActiveSql('sr')})
    OR EXISTS (SELECT 1 FROM borrow_transactions st
      WHERE st.listing_id = ${alias}.id AND st.borrower_id = ${viewer}
        AND st.status IN ('approved', 'paid', 'picked_up', 'return_pending', 'returned', 'completed', 'disputed'))`}
  )), false)`;
}

export const requestAccessSql = (alias, viewer) => audienceSql(alias, 'user_id', viewer);
