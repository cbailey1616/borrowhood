import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, requireVerified } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import {
  createConnectAccount,
  createConnectAccountLink,
  getConnectAccount,
} from '../services/stripe.js';

const router = Router();

// ============================================
// GET /api/users/:id
// Get user profile
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, first_name, last_name, profile_photo_url, bio,
              city, state, status, borrower_rating, borrower_rating_count,
              lender_rating, lender_rating_count, total_transactions,
              created_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      profilePhotoUrl: user.profile_photo_url,
      bio: user.bio,
      city: user.city,
      state: user.state,
      isVerified: user.status === 'verified',
      borrowerRating: parseFloat(user.borrower_rating) || 0,
      borrowerRatingCount: user.borrower_rating_count,
      lenderRating: parseFloat(user.lender_rating) || 0,
      lenderRatingCount: user.lender_rating_count,
      totalTransactions: user.total_transactions,
      memberSince: user.created_at,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ============================================
// PATCH /api/users/me
// Update current user profile
// ============================================
router.patch('/me', authenticate,
  body('firstName').optional().trim().isLength({ min: 1, max: 100 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 100 }),
  body('phone').optional().trim(),
  body('bio').optional().isLength({ max: 500 }),
  body('city').optional().trim().isLength({ max: 100 }),
  body('state').optional().trim().isLength({ max: 50 }),
  body('profilePhotoUrl').optional().isURL(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, phone, bio, city, state, latitude, longitude, profilePhotoUrl } = req.body;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (firstName !== undefined) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(lastName);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(bio);
    }
    if (city !== undefined) {
      updates.push(`city = $${paramIndex++}`);
      values.push(city);
    }
    if (state !== undefined) {
      updates.push(`state = $${paramIndex++}`);
      values.push(state);
    }
    if (profilePhotoUrl !== undefined) {
      updates.push(`profile_photo_url = $${paramIndex++}`);
      values.push(profilePhotoUrl);
    }
    // Update location if lat/lng provided
    if (latitude !== undefined && longitude !== undefined) {
      updates.push(`location = ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography`);
      values.push(longitude, latitude); // PostGIS uses lon, lat order
      paramIndex += 2;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(req.user.id);

    try {
      await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Update user error:', err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

// ============================================
// GET /api/users/me/friends
// Get close friends list
// ============================================
router.get('/me/friends', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.profile_photo_url
       FROM friendships f
       JOIN users u ON f.friend_id = u.id
       WHERE f.user_id = $1
       ORDER BY u.first_name, u.last_name`,
      [req.user.id]
    );

    res.json(result.rows.map(u => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      profilePhotoUrl: u.profile_photo_url,
    })));
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// ============================================
// POST /api/users/me/friends
// Add close friend
// ============================================
router.post('/me/friends', authenticate, requireVerified,
  body('friendId').isUUID(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { friendId } = req.body;

    if (friendId === req.user.id) {
      return res.status(400).json({ error: 'Cannot add yourself as friend' });
    }

    try {
      await query(
        `INSERT INTO friendships (user_id, friend_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [req.user.id, friendId]
      );
      res.status(201).json({ success: true });
    } catch (err) {
      console.error('Add friend error:', err);
      res.status(500).json({ error: 'Failed to add friend' });
    }
  }
);

// ============================================
// DELETE /api/users/me/friends/:friendId
// Remove close friend
// ============================================
router.delete('/me/friends/:friendId', authenticate, async (req, res) => {
  try {
    await query(
      'DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2',
      [req.user.id, req.params.friendId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// ============================================
// GET /api/users/:id/ratings
// Get user ratings
// ============================================
router.get('/:id/ratings', authenticate, async (req, res) => {
  const { type } = req.query; // 'lender' or 'borrower'

  try {
    let whereClause = 'r.ratee_id = $1';
    if (type === 'lender') {
      whereClause += ' AND r.is_lender_rating = true';
    } else if (type === 'borrower') {
      whereClause += ' AND r.is_lender_rating = false';
    }

    const result = await query(
      `SELECT r.rating, r.comment, r.is_lender_rating, r.created_at,
              u.id as rater_id, u.first_name, u.last_name, u.profile_photo_url
       FROM ratings r
       JOIN users u ON r.rater_id = u.id
       WHERE ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );

    res.json(result.rows.map(r => ({
      rating: r.rating,
      comment: r.comment,
      type: r.is_lender_rating ? 'lender' : 'borrower',
      createdAt: r.created_at,
      rater: {
        id: r.rater_id,
        firstName: r.first_name,
        lastName: r.last_name,
        profilePhotoUrl: r.profile_photo_url,
      },
    })));
  } catch (err) {
    console.error('Get ratings error:', err);
    res.status(500).json({ error: 'Failed to get ratings' });
  }
});

// ============================================
// GET /api/users/me/connect-status
// Get Stripe Connect account status
// ============================================
router.get('/me/connect-status', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT stripe_connect_account_id FROM users WHERE id = $1',
      [req.user.id]
    );

    const accountId = result.rows[0]?.stripe_connect_account_id;

    if (!accountId) {
      return res.json({
        hasAccount: false,
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      });
    }

    // Get account details from Stripe
    const account = await getConnectAccount(accountId);

    res.json({
      hasAccount: true,
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements,
    });
  } catch (err) {
    console.error('Get connect status error:', err);
    res.status(500).json({ error: 'Failed to get Connect status' });
  }
});

// ============================================
// POST /api/users/me/connect-account
// Create a Stripe Connect account
// ============================================
router.post('/me/connect-account', authenticate, requireVerified, async (req, res) => {
  try {
    // Check if user already has a Connect account
    const existing = await query(
      'SELECT stripe_connect_account_id FROM users WHERE id = $1',
      [req.user.id]
    );

    if (existing.rows[0]?.stripe_connect_account_id) {
      return res.status(400).json({ error: 'Connect account already exists' });
    }

    // Get user email
    const userResult = await query(
      'SELECT email, first_name, last_name FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = userResult.rows[0];

    // Create Stripe Connect account
    const account = await createConnectAccount(user.email, {
      userId: req.user.id,
      userName: `${user.first_name} ${user.last_name}`,
    });

    // Save account ID to user
    await query(
      'UPDATE users SET stripe_connect_account_id = $1 WHERE id = $2',
      [account.id, req.user.id]
    );

    res.status(201).json({
      accountId: account.id,
    });
  } catch (err) {
    console.error('Create connect account error:', err);
    res.status(500).json({ error: 'Failed to create Connect account' });
  }
});

// ============================================
// POST /api/users/me/connect-onboarding
// Get Stripe Connect onboarding link
// ============================================
router.post('/me/connect-onboarding', authenticate, requireVerified,
  body('returnUrl').optional().isURL(),
  async (req, res) => {
    const { returnUrl } = req.body;

    try {
      const result = await query(
        'SELECT stripe_connect_account_id FROM users WHERE id = $1',
        [req.user.id]
      );

      let accountId = result.rows[0]?.stripe_connect_account_id;

      // Create account if it doesn't exist
      if (!accountId) {
        const userResult = await query(
          'SELECT email, first_name, last_name FROM users WHERE id = $1',
          [req.user.id]
        );

        const user = userResult.rows[0];

        const account = await createConnectAccount(user.email, {
          userId: req.user.id,
          userName: `${user.first_name} ${user.last_name}`,
        });

        await query(
          'UPDATE users SET stripe_connect_account_id = $1 WHERE id = $2',
          [account.id, req.user.id]
        );

        accountId = account.id;
      }

      // Create onboarding link
      const baseUrl = process.env.APP_URL || 'https://borrowhood.com';
      const accountLink = await createConnectAccountLink(
        accountId,
        `${baseUrl}/connect/refresh?userId=${req.user.id}`,
        returnUrl || `${baseUrl}/connect/return?userId=${req.user.id}`
      );

      res.json({
        url: accountLink.url,
        expiresAt: accountLink.expires_at,
      });
    } catch (err) {
      console.error('Create onboarding link error:', err);
      res.status(500).json({ error: 'Failed to create onboarding link' });
    }
  }
);

export default router;
