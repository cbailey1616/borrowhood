import communityChat from './communityChat.js';
import { Router } from 'express';
import { query } from '../utils/db.js';
import { joinCommunity, leaveCommunity, removeCommunityMember, getRejoinRequests, reviewRejoinRequest, withCommunityMembershipLock, requireCommunityModerator } from '../services/communityMemberships.js';
import { authenticate, requireVerified, requireOrganizer } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { originalPhotoUrl } from '../services/privatePhotos.js';

const router = Router();
router.use('/:id/chat', communityChat);

// ============================================
// GET /api/communities
// List communities within 1 mile of user's location
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { search, member } = req.query;

  try {
    // If requesting only joined communities, skip distance filter
    if (member === 'true') {
      const result = await query(
        `SELECT c.*,
                m.role,
                (SELECT COUNT(*) FROM community_memberships WHERE community_id = c.id) as member_count,
                (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active' AND privacy_version = 1 AND 'town' = ANY(string_to_array(visibility::text, ','))) as listing_count,
                true as is_member
         FROM communities c
         JOIN community_memberships m ON m.community_id = c.id AND m.user_id = $1
         WHERE c.is_active = true
         ORDER BY c.name`,
        [req.user.id]
      );

      return res.json(result.rows.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        // Memberships are explicit joins. Legacy neighborhoods can have the
        // geographic 'town' default, which build 257 incorrectly filters out.
        description: c.description,
        city: c.city,
        state: c.state,
        bannerUrl: c.banner_url || null,
        announcement: c.announcement || null,
        announcementAt: c.announcement_at || null,
        memberCount: parseInt(c.member_count),
        listingCount: parseInt(c.listing_count),
        isMember: true,
        role: c.role,
      })));
    }

    // Get user's city for matching
    const cityResult = await query(
      'SELECT city, state FROM users WHERE id = $1',
      [req.user.id]
    );
    const userCity = cityResult.rows[0]?.city;
    const userState = cityResult.rows[0]?.state;

    // If user has no city set, return empty
    if (!userCity) {
      return res.json([]);
    }

    // Find communities in the same city/town
    let whereConditions = [
      'c.is_active = true',
      'LOWER(c.city) = LOWER($1)'
    ];
    let params = [userCity, req.user.id];

    // Optionally also match state if set
    if (userState) {
      whereConditions.push('(c.state IS NULL OR LOWER(c.state) = LOWER($3))');
      params.push(userState);
    }

    if (search) {
      whereConditions.push(`c.name ILIKE $${params.length + 1}`);
      params.push(`%${search}%`);
    }

    const result = await query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM community_memberships WHERE community_id = c.id) as member_count,
              (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active' AND privacy_version = 1 AND 'town' = ANY(string_to_array(visibility::text, ','))) as listing_count,
              EXISTS(SELECT 1 FROM community_memberships WHERE community_id = c.id AND user_id = $2) as is_member,
                (SELECT CASE WHEN r.requested_at IS NULL THEN 'removed' ELSE 'pending' END
                 FROM community_member_removals r WHERE r.community_id = c.id AND r.user_id = $2) AS rejoin_status
       FROM communities c
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY c.name`,
      params
    );

    res.json(result.rows.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      city: c.city,
      state: c.state,
      memberCount: parseInt(c.member_count),
      listingCount: parseInt(c.listing_count),
      isMember: c.is_member,
      rejoinStatus: c.rejoin_status || null,
    })));
  } catch (err) {
    console.error('Get communities error:', err);
    res.status(500).json({ error: 'Failed to get communities' });
  }
});

// ============================================
// GET /api/communities/nearby
// Find neighborhoods near coordinates (PostGIS)
// ============================================
router.get('/nearby', authenticate, async (req, res) => {
  const { lat, lng, radius = 5 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const radiusMiles = Math.min(parseFloat(radius), 25);

  try {
    // Check if PostGIS center column exists and has data
    const hasCenter = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'communities' AND column_name = 'center'
    `);

    let result;

    if (hasCenter.rows.length > 0) {
      // Use PostGIS ST_DWithin for distance-based search
      result = await query(
        `SELECT c.*,
                ST_Distance(c.center::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1609.34 as distance_miles,
                (SELECT COUNT(*) FROM community_memberships WHERE community_id = c.id) as member_count,
                (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active' AND privacy_version = 1 AND 'town' = ANY(string_to_array(visibility::text, ','))) as listing_count,
                EXISTS(SELECT 1 FROM community_memberships WHERE community_id = c.id AND user_id = $4) as is_member,
                (SELECT CASE WHEN r.requested_at IS NULL THEN 'removed' ELSE 'pending' END
                 FROM community_member_removals r WHERE r.community_id = c.id AND r.user_id = $4) AS rejoin_status
         FROM communities c
         WHERE c.is_active = true
           AND c.center IS NOT NULL
           AND ST_DWithin(c.center::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3 * 1609.34)
         ORDER BY distance_miles
         LIMIT 50`,
        [latitude, longitude, radiusMiles, req.user.id]
      );
    } else {
      // Fallback: match by city name from reverse geocoded location
      // User's city should already be set by the mobile app
      const userResult = await query('SELECT city, state FROM users WHERE id = $1', [req.user.id]);
      const userCity = userResult.rows[0]?.city;

      if (!userCity) {
        return res.json([]);
      }

      result = await query(
        `SELECT c.*,
                0 as distance_miles,
                (SELECT COUNT(*) FROM community_memberships WHERE community_id = c.id) as member_count,
                (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active' AND privacy_version = 1 AND 'town' = ANY(string_to_array(visibility::text, ','))) as listing_count,
                EXISTS(SELECT 1 FROM community_memberships WHERE community_id = c.id AND user_id = $2) as is_member,
                (SELECT CASE WHEN r.requested_at IS NULL THEN 'removed' ELSE 'pending' END
                 FROM community_member_removals r WHERE r.community_id = c.id AND r.user_id = $2) AS rejoin_status
         FROM communities c
         WHERE c.is_active = true AND LOWER(c.city) = LOWER($1)
         ORDER BY c.name
         LIMIT 50`,
        [userCity, req.user.id]
      );
    }

    res.json(result.rows.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      city: c.city,
      state: c.state,
      distanceMiles: parseFloat(c.distance_miles) || 0,
      memberCount: parseInt(c.member_count),
      listingCount: parseInt(c.listing_count),
      isMember: c.is_member,
      rejoinStatus: c.rejoin_status || null,
    })));
  } catch (err) {
    console.error('Get nearby communities error:', err);
    // If PostGIS functions fail, fall back to city-based matching
    try {
      const userResult = await query('SELECT city FROM users WHERE id = $1', [req.user.id]);
      const userCity = userResult.rows[0]?.city;
      if (!userCity) return res.json([]);

      const fallback = await query(
        `SELECT c.*,
                (SELECT COUNT(*) FROM community_memberships WHERE community_id = c.id) as member_count,
                (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active' AND privacy_version = 1 AND 'town' = ANY(string_to_array(visibility::text, ','))) as listing_count,
                EXISTS(SELECT 1 FROM community_memberships WHERE community_id = c.id AND user_id = $2) as is_member,
                (SELECT CASE WHEN r.requested_at IS NULL THEN 'removed' ELSE 'pending' END
                 FROM community_member_removals r WHERE r.community_id = c.id AND r.user_id = $2) AS rejoin_status
         FROM communities c
         WHERE c.is_active = true AND LOWER(c.city) = LOWER($1)
         ORDER BY c.name LIMIT 50`,
        [userCity, req.user.id]
      );

      res.json(fallback.rows.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        city: c.city,
        state: c.state,
        distanceMiles: 0,
        memberCount: parseInt(c.member_count),
        listingCount: parseInt(c.listing_count),
        isMember: c.is_member,
        rejoinStatus: c.rejoin_status || null,
      })));
    } catch (fallbackErr) {
      console.error('Nearby fallback error:', fallbackErr);
      res.status(500).json({ error: 'Failed to get nearby communities' });
    }
  }
});

// ============================================
// GET /api/communities/:id
// Get community details
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM community_memberships WHERE community_id = c.id) as member_count,
              (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active' AND privacy_version = 1 AND 'town' = ANY(string_to_array(visibility::text, ','))) as listing_count
       FROM communities c
       WHERE c.id::text = $1 OR c.slug = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const c = result.rows[0];

    // Get membership info
    const membership = await query(
      'SELECT role FROM community_memberships WHERE community_id = $1 AND user_id = $2',
      [c.id, req.user.id]
    );

    const removal = await query(`SELECT CASE WHEN requested_at IS NULL THEN 'removed' ELSE 'pending' END AS status
      FROM community_member_removals WHERE community_id = $1 AND user_id = $2`, [c.id, req.user.id]);

    // Get organizers
    const organizers = await query(
      `SELECT u.id, u.first_name, u.last_name, u.display_name, u.profile_photo_url
       FROM community_memberships m
       JOIN users u ON m.user_id = u.id
       WHERE m.community_id = $1 AND m.role = 'organizer'`,
      [c.id]
    );

    // Get announcement author if set
    let announcementAuthor = null;
    if (c.announcement_by) {
      const authorResult = await query(
        'SELECT id, first_name, display_name, profile_photo_url FROM users WHERE id = $1',
        [c.announcement_by]
      );
      if (authorResult.rows.length > 0) {
        const a = authorResult.rows[0];
        announcementAuthor = {
          id: a.id,
          firstName: a.display_name || a.first_name,
          profilePhotoUrl: a.profile_photo_url,
        };
      }
    }

    res.json({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      city: c.city,
      state: c.state,
      rejoinStatus: removal.rows[0]?.status || null,
      bannerUrl: c.banner_url || null,
      announcement: c.announcement || null,
      announcementAt: c.announcement_at || null,
      announcementAuthor,
      memberCount: parseInt(c.member_count),
      listingCount: parseInt(c.listing_count),
      requiresApproval: c.requires_approval,
      isMember: membership.rows.length > 0,
      role: membership.rows[0]?.role || null,
      organizers: organizers.rows.map(o => ({
        id: o.id,
        firstName: o.display_name || o.first_name,
        lastName: o.display_name ? '' : (o.last_name ? o.last_name.charAt(0) + '.' : ''),
        profilePhotoUrl: o.profile_photo_url,
      })),
    });
  } catch (err) {
    console.error('Get community error:', err);
    res.status(500).json({ error: 'Failed to get community' });
  }
});

// ============================================
// PATCH /api/communities/:id
// Update community details (organizer or app admin)
// ============================================
router.patch('/:id', authenticate, async (req, res) => {
  const { name, description, bannerUrl, announcement } = req.body;

  try {
    // Check if caller is an organizer or app admin
    const membership = await query(
      'SELECT role FROM community_memberships WHERE community_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const isOrganizer = membership.rows.length > 0 && membership.rows[0].role === 'organizer';

    if (!isOrganizer && !req.user.is_admin) {
      return res.status(403).json({ error: 'Only neighborhood stewards or app admins can edit neighborhood details' });
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description.trim());
    }
    if (bannerUrl !== undefined) {
      let source = null;
      try {
        if (bannerUrl !== null && typeof bannerUrl !== 'string') throw new Error('Invalid cover');
        source = bannerUrl ? originalPhotoUrl(bannerUrl, req.user.id) : null;
        if (source && !['https:', 'http:'].includes(new URL(source).protocol)) throw new Error('Invalid cover');
      } catch {
        return res.status(400).json({ error: 'Please choose the cover photo again.' });
      }
      updates.push(`banner_url = $${paramIndex++}`);
      params.push(source);
    }
    if (announcement !== undefined) {
      if (announcement && announcement.trim()) {
        updates.push(`announcement = $${paramIndex++}`);
        params.push(announcement.trim());
        updates.push(`announcement_at = NOW()`);
        updates.push(`announcement_by = $${paramIndex++}`);
        params.push(req.user.id);
      } else {
        updates.push('announcement = NULL');
        updates.push('announcement_at = NULL');
        updates.push('announcement_by = NULL');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    const updated = await query(
      `UPDATE communities SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING banner_url`,
      params
    );

    res.json({ success: true, bannerUrl: updated.rows[0]?.banner_url || null });
  } catch (err) {
    console.error('Update community error:', err);
    res.status(500).json({ error: 'Failed to update community' });
  }
});

// ============================================
// POST /api/communities/:id/join
// Join a community
// ============================================
router.post('/:id/join', authenticate, async (req, res) => {
  try {
    const result = await joinCommunity(req.params.id, req.user.id);
    if (result.approvalRequired) return res.status(403).json({
      code: 'REJOIN_APPROVAL_REQUIRED', rejoinStatus: 'pending',
      error: 'Request sent. A neighborhood steward must approve your return.',
    });
    res.json(result);
  } catch (err) {
    membershipError(res, err, 'Failed to join community');
  }
});

// ============================================
// POST /api/communities/:id/leave
// Leave a community
// ============================================
router.post('/:id/leave', authenticate, async (req, res) => {
  try {
    res.json(await leaveCommunity(req.params.id, req.user.id, req.body?.successorId));
  } catch (err) {
    membershipError(res, err, 'Failed to leave community');
  }
});

// ============================================
// DELETE /api/communities/:id/members/:userId
// Remove a member (neighborhood moderator only; creators are moderators)
// ============================================
function membershipError(res, err, fallback) {
  if (err.status) return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

router.delete('/:id/members/:userId', authenticate, async (req, res) => {
  try {
    res.json(await removeCommunityMember(req.params.id, req.params.userId, req.user.id));
  } catch (err) {
    membershipError(res, err, 'Failed to remove member');
  }
});

router.get('/:id/rejoin-requests', authenticate, async (req, res) => {
  try {
    res.json(await getRejoinRequests(req.params.id, req.user.id));
  } catch (err) {
    membershipError(res, err, 'Failed to load rejoin requests');
  }
});

for (const decision of ['approve', 'decline']) {
  router.post(`/:id/rejoin-requests/:userId/${decision}`, authenticate, async (req, res) => {
    try {
      res.json(await reviewRejoinRequest(req.params.id, req.params.userId, req.user.id, decision === 'approve'));
    } catch (err) {
      membershipError(res, err, 'Failed to review rejoin request');
    }
  });
}

// ============================================
// GET /api/communities/:id/members
// Get community members
// ============================================
router.get('/:id/members', authenticate, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const forSteward = req.query.forSteward === 'true';
  const offset = (page - 1) * limit;

  try {
    if (forSteward) await requireCommunityModerator({ query }, req.params.id, req.user.id);
    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.display_name, u.profile_photo_url,
              u.lender_rating as rating, u.lender_rating_count as rating_count,
              m.role, m.joined_at
       FROM community_memberships m
       JOIN users u ON m.user_id = u.id
       WHERE m.community_id = $1
       ${forSteward ? "AND m.user_id <> $4 AND u.status <> 'suspended'" : ''}
       ORDER BY m.role DESC, m.joined_at, m.user_id
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset, ...(forSteward ? [req.user.id] : [])]
    );

    res.json(result.rows.map(m => ({
      id: m.id,
      firstName: m.display_name || m.first_name,
      lastName: m.display_name ? '' : (m.last_name ? m.last_name.charAt(0) + '.' : ''),
      profilePhotoUrl: m.profile_photo_url,
      role: m.role,
      rating: parseFloat(m.rating) || 0,
      ratingCount: m.rating_count,
      joinedAt: m.joined_at,
    })));
  } catch (err) {
    membershipError(res, err, 'Failed to get members');
  }
});

// ============================================
// POST /api/communities
// Create a new neighborhood (creator becomes moderator)
// ============================================
router.post('/', authenticate,
  body('name').trim().isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ max: 1000 }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('radius').optional().isFloat({ min: 0.25, max: 2 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, latitude, longitude, radius } = req.body;

    try {
      // Get creator's location from profile
      const userResult = await query(
        'SELECT city, state FROM users WHERE id = $1',
        [req.user.id]
      );
      const user = userResult.rows[0];

      if (!user.city || !user.state) {
        return res.status(400).json({
          error: 'Please set your city and state in your profile before creating a neighborhood',
          code: 'LOCATION_REQUIRED'
        });
      }

      // If coordinates provided, check for overlapping neighborhoods
      if (latitude && longitude) {
        try {
          const hasCenter = await query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'communities' AND column_name = 'center'
          `);

          if (hasCenter.rows.length > 0) {
            const overlapRadius = (radius || 1) * 1609.34; // Convert miles to meters
            const overlapping = await query(
              `SELECT name FROM communities
               WHERE is_active = true
                 AND center IS NOT NULL
                 AND ST_DWithin(center::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
               LIMIT 5`,
              [latitude, longitude, overlapRadius]
            );

            if (overlapping.rows.length > 0) {
              return res.status(409).json({
                error: 'A neighborhood already exists in this area',
                code: 'OVERLAP',
                overlapping: overlapping.rows.map(r => r.name),
              });
            }
          }
        } catch (gisErr) {
          // PostGIS may not be available; skip overlap check
          console.warn('PostGIS overlap check skipped:', gisErr.message);
        }
      }

      // Create slug from name
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

      // Build INSERT dynamically based on whether we have coords
      let insertQuery, insertParams;
      if (latitude && longitude) {
        // Check if center column exists before trying to set it
        const hasCenter = await query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'communities' AND column_name = 'center'
        `);

        if (hasCenter.rows.length > 0) {
          insertQuery = `INSERT INTO communities (name, slug, city, state, description, center, radius_miles, community_type)
            VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($7, $6), 4326), $8, 'neighborhood')
            RETURNING id`;
          insertParams = [name, uniqueSlug, user.city, user.state, description, latitude, longitude, radius || 1];
        } else {
          insertQuery = `INSERT INTO communities (name, slug, city, state, description, community_type)
            VALUES ($1, $2, $3, $4, $5, 'neighborhood') RETURNING id`;
          insertParams = [name, uniqueSlug, user.city, user.state, description];
        }
      } else {
        insertQuery = `INSERT INTO communities (name, slug, city, state, description, community_type)
          VALUES ($1, $2, $3, $4, $5, 'neighborhood') RETURNING id`;
        insertParams = [name, uniqueSlug, user.city, user.state, description];
      }

      const result = await query(insertQuery, insertParams);

      // Add creator as organizer (moderator)
      await query(
        `INSERT INTO community_memberships (user_id, community_id, role)
         VALUES ($1, $2, 'organizer')`,
        [req.user.id, result.rows[0].id]
      );

      // Mark creator as founder
      await query(
        'UPDATE users SET is_founder = true WHERE id = $1',
        [req.user.id]
      );

      res.status(201).json({ id: result.rows[0].id, slug: uniqueSlug, isFounder: true });
    } catch (err) {
      console.error('Create community error:', err);
      res.status(500).json({ error: 'Failed to create community' });
    }
  }
);

// ============================================
// POST /api/communities/:id/add-admin
// Add another user as admin/organizer (only current organizers can do this)
// ============================================
router.post('/:id/add-admin', authenticate, async (req, res) => {
  try {
    await withCommunityMembershipLock(req.params.id, async client => {
      await requireCommunityModerator(client, req.params.id, req.user.id);
      const result = await client.query(`UPDATE community_memberships SET role = 'organizer'
        WHERE community_id = $1 AND user_id = $2 RETURNING user_id`, [req.params.id, req.body.userId]);
      if (!result.rows.length) throw Object.assign(new Error('User must be a member first'), { status: 400 });
    });
    res.json({ success: true });
  } catch (err) {
    membershipError(res, err, 'Failed to make this neighbor a steward');
  }
});

export default router;
