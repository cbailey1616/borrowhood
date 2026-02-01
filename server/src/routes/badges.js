import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/badges
// Get all available badges
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, icon, category, requirement_type, requirement_value, points
       FROM badge_definitions
       WHERE is_active = true
       ORDER BY category, points`
    );

    res.json(result.rows.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      icon: b.icon,
      category: b.category,
      requirementType: b.requirement_type,
      requirementValue: b.requirement_value,
      points: b.points,
    })));
  } catch (err) {
    console.error('Get badges error:', err);
    res.status(500).json({ error: 'Failed to get badges' });
  }
});

// ============================================
// GET /api/badges/mine
// Get user's earned badges
// ============================================
router.get('/mine', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT bd.id, bd.name, bd.description, bd.icon, bd.category, bd.points, ub.earned_at
       FROM user_badges ub
       JOIN badge_definitions bd ON ub.badge_id = bd.id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      icon: b.icon,
      category: b.category,
      points: b.points,
      earnedAt: b.earned_at,
    })));
  } catch (err) {
    console.error('Get my badges error:', err);
    res.status(500).json({ error: 'Failed to get badges' });
  }
});

// ============================================
// GET /api/badges/user/:userId
// Get another user's badges
// ============================================
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT bd.id, bd.name, bd.description, bd.icon, bd.category, bd.points, ub.earned_at
       FROM user_badges ub
       JOIN badge_definitions bd ON ub.badge_id = bd.id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at DESC`,
      [req.params.userId]
    );

    res.json(result.rows.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      icon: b.icon,
      category: b.category,
      points: b.points,
      earnedAt: b.earned_at,
    })));
  } catch (err) {
    console.error('Get user badges error:', err);
    res.status(500).json({ error: 'Failed to get badges' });
  }
});

// ============================================
// GET /api/badges/leaderboard
// Get community leaderboard
// ============================================
router.get('/leaderboard', authenticate, async (req, res) => {
  try {
    // Get user's community
    const membershipResult = await query(
      `SELECT community_id FROM community_memberships
       WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [req.user.id]
    );

    if (membershipResult.rows.length === 0) {
      return res.json({ leaders: [], userRank: null });
    }

    const communityId = membershipResult.rows[0].community_id;

    const result = await query(
      `SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.profile_photo_url,
        u.reputation_score,
        u.items_shared_count,
        u.lending_streak,
        (SELECT COUNT(*) FROM user_badges WHERE user_id = u.id) as badge_count
       FROM users u
       JOIN community_memberships cm ON u.id = cm.user_id
       WHERE cm.community_id = $1 AND cm.status = 'active'
       ORDER BY u.reputation_score DESC
       LIMIT 20`,
      [communityId]
    );

    // Find user's rank
    const rankResult = await query(
      `SELECT rank FROM (
        SELECT u.id, RANK() OVER (ORDER BY u.reputation_score DESC) as rank
        FROM users u
        JOIN community_memberships cm ON u.id = cm.user_id
        WHERE cm.community_id = $1 AND cm.status = 'active'
      ) ranked WHERE id = $2`,
      [communityId, req.user.id]
    );

    res.json({
      leaders: result.rows.map((u, index) => ({
        rank: index + 1,
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        profilePhotoUrl: u.profile_photo_url,
        reputationScore: u.reputation_score,
        itemsShared: u.items_shared_count,
        lendingStreak: u.lending_streak,
        badgeCount: parseInt(u.badge_count),
      })),
      userRank: rankResult.rows[0]?.rank || null,
    });
  } catch (err) {
    console.error('Get leaderboard error:', err);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// ============================================
// POST /api/badges/check
// Check and award any new badges (called after actions)
// ============================================
router.post('/check', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user stats
    const userStats = await query(
      `SELECT items_shared_count, items_borrowed_count, lending_streak, co2_saved_kg
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userStats.rows.length === 0) {
      return res.json({ newBadges: [] });
    }

    const stats = userStats.rows[0];
    const newBadges = [];

    // Get badges user doesn't have yet
    const availableBadges = await query(
      `SELECT bd.* FROM badge_definitions bd
       WHERE bd.is_active = true
       AND bd.id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = $1)`,
      [userId]
    );

    for (const badge of availableBadges.rows) {
      let earned = false;

      switch (badge.requirement_type) {
        case 'count':
          if (badge.category === 'lending' && stats.items_shared_count >= badge.requirement_value) {
            earned = true;
          } else if (badge.category === 'borrowing' && stats.items_borrowed_count >= badge.requirement_value) {
            earned = true;
          }
          break;
        case 'streak':
          if (stats.lending_streak >= badge.requirement_value) {
            earned = true;
          }
          break;
      }

      if (earned) {
        await query(
          `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2)
           ON CONFLICT (user_id, badge_id) DO NOTHING`,
          [userId, badge.id]
        );
        newBadges.push({
          id: badge.id,
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          points: badge.points,
        });

        // Add points to reputation
        await query(
          `UPDATE users SET reputation_score = reputation_score + $1 WHERE id = $2`,
          [badge.points, userId]
        );
      }
    }

    res.json({ newBadges });
  } catch (err) {
    console.error('Check badges error:', err);
    res.status(500).json({ error: 'Failed to check badges' });
  }
});

export default router;
