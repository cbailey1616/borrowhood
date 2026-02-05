import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, requireVerified, requireOrganizer } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';

const router = Router();

// ============================================
// GET /api/communities
// List communities within 1 mile of user's location
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { search, member } = req.query;

  try {
    // Get user's saved location
    const userResult = await query(
      'SELECT latitude, longitude FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    // If requesting only joined communities, skip distance filter
    if (member === 'true') {
      const result = await query(
        `SELECT c.*,
                m.role,
                (SELECT COUNT(*) FROM community_memberships WHERE community_id = c.id) as member_count,
                (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active') as listing_count,
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
        description: c.description,
        city: c.city,
        state: c.state,
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
              (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active') as listing_count,
              EXISTS(SELECT 1 FROM community_memberships WHERE community_id = c.id AND user_id = $2) as is_member
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
    })));
  } catch (err) {
    console.error('Get communities error:', err);
    res.status(500).json({ error: 'Failed to get communities' });
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
              (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active') as listing_count
       FROM communities c
       WHERE c.id = $1 OR c.slug = $1`,
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

    // Get organizers
    const organizers = await query(
      `SELECT u.id, u.first_name, u.last_name, u.profile_photo_url
       FROM community_memberships m
       JOIN users u ON m.user_id = u.id
       WHERE m.community_id = $1 AND m.role = 'organizer'`,
      [c.id]
    );

    res.json({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      city: c.city,
      state: c.state,
      memberCount: parseInt(c.member_count),
      listingCount: parseInt(c.listing_count),
      requiresApproval: c.requires_approval,
      isMember: membership.rows.length > 0,
      role: membership.rows[0]?.role || null,
      organizers: organizers.rows.map(o => ({
        id: o.id,
        firstName: o.first_name,
        lastName: o.last_name,
        profilePhotoUrl: o.profile_photo_url,
      })),
    });
  } catch (err) {
    console.error('Get community error:', err);
    res.status(500).json({ error: 'Failed to get community' });
  }
});

// ============================================
// POST /api/communities/:id/join
// Join a community
// ============================================
router.post('/:id/join', authenticate, async (req, res) => {
  try {
    // Verify community exists
    const community = await query(
      'SELECT * FROM communities WHERE id = $1',
      [req.params.id]
    );

    if (community.rows.length === 0) {
      return res.status(404).json({ error: 'Community not found' });
    }

    await query(
      `INSERT INTO community_memberships (user_id, community_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.user.id, req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Join community error:', err);
    res.status(500).json({ error: 'Failed to join community' });
  }
});

// ============================================
// POST /api/communities/:id/leave
// Leave a community
// ============================================
router.post('/:id/leave', authenticate, async (req, res) => {
  try {
    // Check if user has active listings or transactions
    const active = await query(
      `SELECT
        (SELECT COUNT(*) FROM listings WHERE owner_id = $1 AND community_id = $2 AND status = 'active') as listings,
        (SELECT COUNT(*) FROM borrow_transactions t
         JOIN listings l ON t.listing_id = l.id
         WHERE (t.borrower_id = $1 OR t.lender_id = $1) AND l.community_id = $2
         AND t.status NOT IN ('completed', 'cancelled')) as transactions`,
      [req.user.id, req.params.id]
    );

    const counts = active.rows[0];

    if (parseInt(counts.listings) > 0 || parseInt(counts.transactions) > 0) {
      return res.status(400).json({
        error: 'Cannot leave community with active listings or transactions',
        activeListings: parseInt(counts.listings),
        activeTransactions: parseInt(counts.transactions),
      });
    }

    await query(
      'DELETE FROM community_memberships WHERE user_id = $1 AND community_id = $2',
      [req.user.id, req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Leave community error:', err);
    res.status(500).json({ error: 'Failed to leave community' });
  }
});

// ============================================
// GET /api/communities/:id/members
// Get community members
// ============================================
router.get('/:id/members', authenticate, async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.profile_photo_url,
              u.lender_rating, u.lender_rating_count, u.borrower_rating, u.borrower_rating_count,
              m.role, m.joined_at
       FROM community_memberships m
       JOIN users u ON m.user_id = u.id
       WHERE m.community_id = $1
       ORDER BY m.role DESC, m.joined_at
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );

    res.json(result.rows.map(m => ({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      profilePhotoUrl: m.profile_photo_url,
      role: m.role,
      lenderRating: parseFloat(m.lender_rating) || 0,
      lenderRatingCount: m.lender_rating_count,
      borrowerRating: parseFloat(m.borrower_rating) || 0,
      borrowerRatingCount: m.borrower_rating_count,
      joinedAt: m.joined_at,
    })));
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: 'Failed to get members' });
  }
});

// ============================================
// POST /api/communities
// Create a new neighborhood (creator becomes moderator)
// ============================================
router.post('/', authenticate,
  body('name').trim().isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ max: 1000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;

    try {
      // Get creator's location from profile
      const userResult = await query(
        'SELECT city, state, latitude, longitude FROM users WHERE id = $1',
        [req.user.id]
      );
      const user = userResult.rows[0];

      if (!user.latitude || !user.longitude) {
        return res.status(400).json({
          error: 'Please set your location in your profile before creating a neighborhood',
          code: 'LOCATION_REQUIRED'
        });
      }

      if (!user.city || !user.state) {
        return res.status(400).json({
          error: 'Please set your city and state in your profile before creating a neighborhood',
          code: 'LOCATION_REQUIRED'
        });
      }

      // Create slug from name
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

      // Create community at creator's location
      const result = await query(
        `INSERT INTO communities (name, slug, city, state, description, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [name, uniqueSlug, user.city, user.state, description, user.latitude, user.longitude]
      );

      // Add creator as organizer (moderator)
      await query(
        `INSERT INTO community_memberships (user_id, community_id, role)
         VALUES ($1, $2, 'organizer')`,
        [req.user.id, result.rows[0].id]
      );

      res.status(201).json({ id: result.rows[0].id, slug: uniqueSlug });
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
  const { userId } = req.body;

  try {
    // Check if requester is an organizer
    const membership = await query(
      'SELECT role FROM community_memberships WHERE community_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (membership.rows.length === 0 || membership.rows[0].role !== 'organizer') {
      return res.status(403).json({ error: 'Only organizers can add admins' });
    }

    // Check if target user is a member
    const targetMembership = await query(
      'SELECT id FROM community_memberships WHERE community_id = $1 AND user_id = $2',
      [req.params.id, userId]
    );

    if (targetMembership.rows.length === 0) {
      return res.status(400).json({ error: 'User must be a member first' });
    }

    // Promote to organizer
    await query(
      `UPDATE community_memberships SET role = 'organizer' WHERE community_id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Add admin error:', err);
    res.status(500).json({ error: 'Failed to add admin' });
  }
});

export default router;
