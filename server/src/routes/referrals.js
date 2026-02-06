import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { sendNotification } from '../services/notifications.js';

const router = Router();

// ============================================
// GET /api/referrals/code
// Get current user's referral code (generate if missing)
// ============================================
router.get('/code', authenticate, async (req, res) => {
  try {
    let result = await query(
      'SELECT referral_code FROM users WHERE id = $1',
      [req.user.id]
    );

    let code = result.rows[0]?.referral_code;

    if (!code) {
      code = 'BH-' + req.user.id.replace(/-/g, '').substring(0, 8);
      await query(
        'UPDATE users SET referral_code = $1 WHERE id = $2',
        [code, req.user.id]
      );
    }

    res.json({ referralCode: code });
  } catch (err) {
    console.error('Get referral code error:', err);
    res.status(500).json({ error: 'Failed to get referral code' });
  }
});

// ============================================
// GET /api/referrals/status
// Get referral progress: count, target, reward status, referred friends
// ============================================
router.get('/status', authenticate, async (req, res) => {
  try {
    // Get referred users
    const referred = await query(
      `SELECT id, first_name, last_name, profile_photo_url, created_at
       FROM users
       WHERE referred_by = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    // Check if reward already claimed (subscription_tier = 'plus' with no stripe_subscription_id)
    const userResult = await query(
      `SELECT subscription_tier, subscription_expires_at, stripe_subscription_id
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = userResult.rows[0];
    const rewardClaimed = user.subscription_tier === 'plus' && !user.stripe_subscription_id;

    res.json({
      referralCount: referred.rows.length,
      target: 3,
      rewardClaimed,
      eligible: referred.rows.length >= 3 && !rewardClaimed,
      referredFriends: referred.rows.map(f => ({
        id: f.id,
        firstName: f.first_name,
        lastName: f.last_name,
        profilePhotoUrl: f.profile_photo_url,
        joinedAt: f.created_at,
      })),
    });
  } catch (err) {
    console.error('Get referral status error:', err);
    res.status(500).json({ error: 'Failed to get referral status' });
  }
});

// ============================================
// POST /api/referrals/claim
// Claim free Plus for 1 year (requires 3+ referrals)
// ============================================
router.post('/claim', authenticate, async (req, res) => {
  try {
    // Check referral count
    const countResult = await query(
      'SELECT COUNT(*) as count FROM users WHERE referred_by = $1',
      [req.user.id]
    );
    const count = parseInt(countResult.rows[0].count);

    if (count < 3) {
      return res.status(400).json({
        error: `You need ${3 - count} more referral(s) to claim this reward`,
      });
    }

    // Check if already claimed
    const userResult = await query(
      'SELECT subscription_tier, stripe_subscription_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    if (user.subscription_tier === 'plus' && !user.stripe_subscription_id) {
      return res.status(400).json({ error: 'Reward already claimed' });
    }

    // Grant free Plus for 1 year
    await query(
      `UPDATE users SET
        subscription_tier = 'plus',
        subscription_started_at = NOW(),
        subscription_expires_at = NOW() + INTERVAL '1 year',
        stripe_subscription_id = NULL
       WHERE id = $1`,
      [req.user.id]
    );

    // Send reward notification
    await sendNotification(req.user.id, 'referral_reward', {}, {});

    res.json({
      success: true,
      message: 'Congratulations! You now have free Plus for 1 year!',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error('Claim referral reward error:', err);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

export default router;
