import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { sendNotification } from '../services/notifications.js';

const router = Router();

// ============================================
// GET /api/circles
// Get user's lending circles
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT lc.*, lcm.role,
              (SELECT COUNT(*) FROM lending_circle_members WHERE circle_id = lc.id AND status = 'active') as member_count
       FROM lending_circles lc
       JOIN lending_circle_members lcm ON lc.id = lcm.circle_id
       WHERE lcm.user_id = $1 AND lcm.status = 'active'
       ORDER BY lc.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      photoUrl: c.photo_url,
      isPrivate: c.is_private,
      requireDeposit: c.require_deposit,
      memberCount: parseInt(c.member_count),
      role: c.role,
      createdAt: c.created_at,
    })));
  } catch (err) {
    console.error('Get circles error:', err);
    res.status(500).json({ error: 'Failed to get circles' });
  }
});

// ============================================
// GET /api/circles/:id
// Get circle details
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Verify membership
    const memberCheck = await query(
      `SELECT role FROM lending_circle_members WHERE circle_id = $1 AND user_id = $2 AND status = 'active'`,
      [req.params.id, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this circle' });
    }

    const result = await query(
      `SELECT lc.* FROM lending_circles lc WHERE lc.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    const circle = result.rows[0];

    // Get members
    const members = await query(
      `SELECT u.id, u.first_name, u.last_name, u.profile_photo_url, lcm.role, lcm.joined_at
       FROM lending_circle_members lcm
       JOIN users u ON lcm.user_id = u.id
       WHERE lcm.circle_id = $1 AND lcm.status = 'active'
       ORDER BY lcm.role, u.first_name`,
      [req.params.id]
    );

    // Get circle's shared items
    const items = await query(
      `SELECT l.id, l.title, l.is_free, l.price_per_day,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url,
              u.first_name as owner_first_name
       FROM listings l
       JOIN users u ON l.owner_id = u.id
       WHERE l.circle_id = $1 AND l.status = 'active'
       ORDER BY l.created_at DESC
       LIMIT 20`,
      [req.params.id]
    );

    res.json({
      id: circle.id,
      name: circle.name,
      description: circle.description,
      photoUrl: circle.photo_url,
      isPrivate: circle.is_private,
      requireDeposit: circle.require_deposit,
      userRole: memberCheck.rows[0].role,
      members: members.rows.map(m => ({
        id: m.id,
        firstName: m.first_name,
        lastName: m.last_name,
        profilePhotoUrl: m.profile_photo_url,
        role: m.role,
        joinedAt: m.joined_at,
      })),
      items: items.rows.map(i => ({
        id: i.id,
        title: i.title,
        isFree: i.is_free,
        pricePerDay: i.price_per_day ? parseFloat(i.price_per_day) : null,
        photoUrl: i.photo_url,
        ownerFirstName: i.owner_first_name,
      })),
    });
  } catch (err) {
    console.error('Get circle error:', err);
    res.status(500).json({ error: 'Failed to get circle' });
  }
});

// ============================================
// POST /api/circles
// Create a new lending circle
// ============================================
router.post('/', authenticate,
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('description').optional().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, photoUrl, isPrivate = true, requireDeposit = false } = req.body;

    try {
      // Create circle
      const result = await query(
        `INSERT INTO lending_circles (name, description, photo_url, created_by, is_private, require_deposit)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [name, description, photoUrl, req.user.id, isPrivate, requireDeposit]
      );

      const circleId = result.rows[0].id;

      // Add creator as owner
      await query(
        `INSERT INTO lending_circle_members (circle_id, user_id, role, status, joined_at)
         VALUES ($1, $2, 'owner', 'active', NOW())`,
        [circleId, req.user.id]
      );

      res.status(201).json({ id: circleId });
    } catch (err) {
      console.error('Create circle error:', err);
      res.status(500).json({ error: 'Failed to create circle' });
    }
  }
);

// ============================================
// POST /api/circles/:id/invite
// Invite a user to the circle
// ============================================
router.post('/:id/invite', authenticate,
  body('userId').isUUID(),
  async (req, res) => {
    const { userId } = req.body;

    try {
      // Verify requester is owner or admin
      const memberCheck = await query(
        `SELECT role FROM lending_circle_members
         WHERE circle_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner', 'admin')`,
        [req.params.id, req.user.id]
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized to invite' });
      }

      // Check if already member or invited
      const existingCheck = await query(
        `SELECT status FROM lending_circle_members WHERE circle_id = $1 AND user_id = $2`,
        [req.params.id, userId]
      );

      if (existingCheck.rows.length > 0) {
        return res.status(400).json({ error: 'User already invited or member' });
      }

      // Create invitation
      await query(
        `INSERT INTO lending_circle_members (circle_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'pending')`,
        [req.params.id, userId]
      );

      // Get circle name for notification
      const circle = await query(`SELECT name FROM lending_circles WHERE id = $1`, [req.params.id]);

      // Send notification
      await sendNotification(userId, 'circle_invite', {
        circleName: circle.rows[0].name,
        inviterName: req.user.firstName,
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Invite to circle error:', err);
      res.status(500).json({ error: 'Failed to invite' });
    }
  }
);

// ============================================
// POST /api/circles/:id/join
// Accept circle invitation
// ============================================
router.post('/:id/join', authenticate, async (req, res) => {
  try {
    const result = await query(
      `UPDATE lending_circle_members
       SET status = 'active', joined_at = NOW()
       WHERE circle_id = $1 AND user_id = $2 AND status = 'pending'
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No pending invitation found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Join circle error:', err);
    res.status(500).json({ error: 'Failed to join circle' });
  }
});

// ============================================
// POST /api/circles/:id/leave
// Leave a circle
// ============================================
router.post('/:id/leave', authenticate, async (req, res) => {
  try {
    // Check if user is the owner
    const memberCheck = await query(
      `SELECT role FROM lending_circle_members WHERE circle_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Not a member' });
    }

    if (memberCheck.rows[0].role === 'owner') {
      return res.status(400).json({ error: 'Owner cannot leave. Transfer ownership first.' });
    }

    await query(
      `UPDATE lending_circle_members SET status = 'removed' WHERE circle_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Leave circle error:', err);
    res.status(500).json({ error: 'Failed to leave circle' });
  }
});

export default router;
