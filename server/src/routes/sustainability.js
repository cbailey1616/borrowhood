import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/sustainability/stats
// Get user's sustainability impact stats
// ============================================
router.get('/stats', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        total_money_saved,
        items_shared_count,
        items_borrowed_count,
        co2_saved_kg,
        reputation_score,
        lending_streak,
        longest_lending_streak
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = result.rows[0];

    // Calculate additional metrics
    const treesEquivalent = (parseFloat(stats.co2_saved_kg) / 21).toFixed(1); // ~21kg CO2 per tree per year
    const totalTransactions = stats.items_shared_count + stats.items_borrowed_count;

    res.json({
      moneySaved: parseFloat(stats.total_money_saved) || 0,
      itemsShared: stats.items_shared_count || 0,
      itemsBorrowed: stats.items_borrowed_count || 0,
      co2SavedKg: parseFloat(stats.co2_saved_kg) || 0,
      treesEquivalent: parseFloat(treesEquivalent) || 0,
      totalTransactions,
      reputationScore: stats.reputation_score || 0,
      lendingStreak: stats.lending_streak || 0,
      longestStreak: stats.longest_lending_streak || 0,
    });
  } catch (err) {
    console.error('Get sustainability stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ============================================
// GET /api/sustainability/community
// Get community-wide sustainability stats
// ============================================
router.get('/community', authenticate, async (req, res) => {
  try {
    // Get user's community
    const membershipResult = await query(
      `SELECT community_id FROM community_memberships
       WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [req.user.id]
    );

    if (membershipResult.rows.length === 0) {
      return res.json({
        totalMoneySaved: 0,
        totalItemsShared: 0,
        totalCo2Saved: 0,
        memberCount: 0,
      });
    }

    const communityId = membershipResult.rows[0].community_id;

    const result = await query(
      `SELECT
        SUM(u.total_money_saved) as total_money_saved,
        SUM(u.items_shared_count) as total_items_shared,
        SUM(u.co2_saved_kg) as total_co2_saved,
        COUNT(DISTINCT u.id) as member_count
       FROM users u
       JOIN community_memberships cm ON u.id = cm.user_id
       WHERE cm.community_id = $1 AND cm.status = 'active'`,
      [communityId]
    );

    const stats = result.rows[0];

    res.json({
      totalMoneySaved: parseFloat(stats.total_money_saved) || 0,
      totalItemsShared: parseInt(stats.total_items_shared) || 0,
      totalCo2Saved: parseFloat(stats.total_co2_saved) || 0,
      memberCount: parseInt(stats.member_count) || 0,
    });
  } catch (err) {
    console.error('Get community stats error:', err);
    res.status(500).json({ error: 'Failed to get community stats' });
  }
});

export default router;
