import { query } from '../utils/db.js';
import { requestActiveSql } from '../utils/requestState.js';

// Existing posts keep their original audience until their owner enables previews.
// This never grants profile, discussion, messaging, borrowing or offer permission.
export function townPreviewSql(alias, ownerColumn, viewer, { listing = false } = {}) {
  return `(${alias}.town_preview_enabled = true
    AND 'town' = ANY(string_to_array(${alias}.visibility::text, ','))
    ${listing ? `AND ${alias}.privacy_version = 1 AND ${alias}.status = 'active'` : `AND ${requestActiveSql(alias)}`}
    AND EXISTS (SELECT 1 FROM users pv JOIN users po ON po.id = ${alias}.${ownerColumn}
      WHERE pv.id = ${viewer} AND pv.status != 'suspended' AND po.status != 'suspended'
      AND NULLIF(TRIM(pv.city), '') IS NOT NULL AND NULLIF(TRIM(pv.state), '') IS NOT NULL
      AND LOWER(TRIM(pv.city)) = LOWER(TRIM(po.city))
      AND LOWER(TRIM(pv.state)) = LOWER(TRIM(po.state))))`;
}
export async function canPreviewTownPost(id, userId, type = 'listing') {
  const listing = type === 'listing';
  const table = listing ? 'listings' : 'item_requests';
  const owner = listing ? 'owner_id' : 'user_id';
  const result = await query(`SELECT p.id FROM ${table} p WHERE p.id=$1 AND ${townPreviewSql('p', owner, '$2', { listing })}`, [id,userId]);
  return result.rows.length > 0;
}
const hiddenMember = () => ({ id: null, firstName: 'Town', lastName: 'neighbor', profilePhotoUrl: null, isVerified: false, totalTransactions: 0, rating: 0, ratingCount: 0 });
export function townListingPreview(row, photos) {
  return {
    id: row.id, type: 'listing', title: row.title, description: row.description,
    condition: row.condition, listingType: row.listing_type || 'lend',
    isFree: row.is_free, directFee: row.direct_fee || null, isAvailable: row.is_available,
    availabilityStatus: row.availability_status, isBorrowed: row.is_borrowed === true, photoUrl: row.photo_url || null,
    ...(photos ? { photos } : {}), category: row.category_name || null,
    categoryId: row.category_id || null, createdAt: row.created_at,
    user: hiddenMember(), owner: hiddenMember(), ownerMasked: true, previewOnly: true,
    isOwner: false, visibility: 'town',
  };
}
export function townRequestPreview(row, feed = false) {
  return {
    id: row.id, type: feed ? 'request' : row.type, title: row.title, description: row.description,
    ...(feed ? { requestType: row.request_type || row.type } : {}),
    neededFrom: row.needed_from, neededUntil: row.needed_until, createdAt: row.created_at,
    category: row.category_name || null, categoryId: row.category_id || null,
    status: row.status || 'open', visibility: 'town', isOwner: false,
    user: hiddenMember(), requester: hiddenMember(), ownerMasked: true, previewOnly: true,
  };
}
