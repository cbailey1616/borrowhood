import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, requireVerified, requireOrganizer } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';

const router = Router();

// ============================================
// GET /api/communities
// List communities (filtered by location)
// ============================================
router.get('/', authenticate, async (req, res) => {
  const { city, state, search } = req.query;

  try {
    let whereConditions = ['c.is_active = true'];
    let params = [];
    let paramIndex = 1;

    if (city) {
      whereConditions.push(`LOWER(c.city) = LOWER($${paramIndex++})`);
      params.push(city);
    }

    if (state) {
      whereConditions.push(`LOWER(c.state) = LOWER($${paramIndex++})`);
      params.push(state);
    }

    if (search) {
      whereConditions.push(`c.name ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    const result = await query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM community_memberships WHERE community_id = c.id) as member_count,
              (SELECT COUNT(*) FROM listings WHERE community_id = c.id AND status = 'active') as listing_count,
              EXISTS(SELECT 1 FROM community_memberships WHERE community_id = c.id AND user_id = $${paramIndex}) as is_member
       FROM communities c
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY c.name`,
      [...params, req.user.id]
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
// Request to create a new community (for areas without one)
// ============================================
router.post('/', authenticate, requireVerified,
  body('name').trim().isLength({ min: 3, max: 255 }),
  body('city').trim().notEmpty(),
  body('state').trim().notEmpty(),
  body('description').optional().isLength({ max: 1000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, city, state, description } = req.body;

    try {
      // Check if community exists for this city
      const existing = await query(
        'SELECT id FROM communities WHERE LOWER(city) = LOWER($1) AND LOWER(state) = LOWER($2)',
        [city, state]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({
          error: 'A community already exists for this area',
          existingId: existing.rows[0].id,
        });
      }

      // Create community with requester as organizer
      const slug = `${city.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}`;

      const result = await query(
        `INSERT INTO communities (name, slug, city, state, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [name, slug, city, state, description]
      );

      // Add creator as organizer
      await query(
        `INSERT INTO community_memberships (user_id, community_id, role)
         VALUES ($1, $2, 'organizer')`,
        [req.user.id, result.rows[0].id]
      );

      res.status(201).json({ id: result.rows[0].id, slug });
    } catch (err) {
      console.error('Create community error:', err);
      res.status(500).json({ error: 'Failed to create community' });
    }
  }
);

export default router;
