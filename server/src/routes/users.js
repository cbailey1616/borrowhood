import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate, requireVerified } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import {
  stripe,
  createConnectAccount,
  createConnectAccountLink,
  getConnectAccount,
} from '../services/stripe.js';

const router = Router();

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
  body('profilePhotoUrl').optional(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Profile update validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    console.log('Profile update request for user:', req.user.id, 'data:', Object.keys(req.body));

    // Check if user is verified — block changes to verified fields
    const userResult = await query('SELECT is_verified FROM users WHERE id = $1', [req.user.id]);
    const isVerified = userResult.rows[0]?.is_verified;

    const { firstName, lastName, phone, bio, city, state, latitude, longitude, profilePhotoUrl } = req.body;

    if (isVerified && (firstName !== undefined || lastName !== undefined)) {
      return res.status(403).json({ error: 'Name is locked to your verified identity. Re-verify to change it.' });
    }
    if (isVerified && (city !== undefined || state !== undefined)) {
      return res.status(403).json({ error: 'Address is locked to your verified identity. Re-verify to change it.' });
    }

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
    if (latitude !== undefined) {
      updates.push(`latitude = $${paramIndex++}`);
      values.push(latitude);
    }
    if (longitude !== undefined) {
      updates.push(`longitude = $${paramIndex++}`);
      values.push(longitude);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(req.user.id);

    try {
      const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
      console.log('Profile update query:', updateQuery, 'values count:', values.length);

      await query(updateQuery, values);
      console.log('Profile updated successfully for user:', req.user.id);
      res.json({ success: true });
    } catch (err) {
      console.error('Update user error:', err);
      console.error('Query was:', `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

// ============================================
// GET /api/users/me/friends
// Get accepted friends list
// ============================================
router.get('/me/friends', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.profile_photo_url
       FROM friendships f
       JOIN users u ON f.friend_id = u.id
       WHERE f.user_id = $1 AND f.status = 'accepted'
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
// GET /api/users/me/friend-requests
// Get pending friend requests (people who want to be your friend)
// ============================================
router.get('/me/friend-requests', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT f.id as request_id, u.id, u.first_name, u.last_name, u.profile_photo_url, f.created_at
       FROM friendships f
       JOIN users u ON f.user_id = u.id
       WHERE f.friend_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(r => ({
      requestId: r.request_id,
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      profilePhotoUrl: r.profile_photo_url,
      requestedAt: r.created_at,
    })));
  } catch (err) {
    console.error('Get friend requests error:', err);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

// ============================================
// POST /api/users/me/friend-requests/:requestId/accept
// Accept a friend request
// ============================================
router.post('/me/friend-requests/:requestId/accept', authenticate, async (req, res) => {
  try {
    // Find the pending request
    const request = await query(
      `SELECT user_id, friend_id FROM friendships
       WHERE id = $1 AND friend_id = $2 AND status = 'pending'`,
      [req.params.requestId, req.user.id]
    );

    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    const { user_id: requesterId } = request.rows[0];

    // Accept the request and create the reverse friendship
    await query(
      `UPDATE friendships SET status = 'accepted' WHERE id = $1`,
      [req.params.requestId]
    );

    // Create reverse friendship (so both can see each other)
    await query(
      `INSERT INTO friendships (user_id, friend_id, status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'`,
      [req.user.id, requesterId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Accept friend request error:', err);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// ============================================
// POST /api/users/me/friend-requests/:requestId/decline
// Decline a friend request
// ============================================
router.post('/me/friend-requests/:requestId/decline', authenticate, async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM friendships
       WHERE id = $1 AND friend_id = $2 AND status = 'pending'
       RETURNING id`,
      [req.params.requestId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Decline friend request error:', err);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// ============================================
// GET /api/users/suggested
// Get suggested users from the same neighborhood
// ============================================
router.get('/suggested', authenticate, async (req, res) => {
  const { neighborhood } = req.query;

  try {
    let result;

    if (neighborhood) {
      // Get users in the specified community
      result = await query(
        `SELECT u.id, u.first_name, u.last_name, u.profile_photo_url, u.city, u.state
         FROM community_memberships m
         JOIN users u ON m.user_id = u.id
         WHERE m.community_id = $1 AND u.id != $2
         ORDER BY m.joined_at DESC
         LIMIT 20`,
        [neighborhood, req.user.id]
      );
    } else {
      // Get users in any community the current user is in
      result = await query(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.profile_photo_url, u.city, u.state
         FROM community_memberships m
         JOIN community_memberships m2 ON m.community_id = m2.community_id
         JOIN users u ON m2.user_id = u.id
         WHERE m.user_id = $1 AND u.id != $1
         ORDER BY u.first_name, u.last_name
         LIMIT 20`,
        [req.user.id]
      );
    }

    // Check which are already friends
    const friendResult = await query(
      'SELECT friend_id FROM friendships WHERE user_id = $1',
      [req.user.id]
    );
    const friendIds = new Set(friendResult.rows.map(r => r.friend_id));

    res.json(result.rows.map(u => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      profilePhotoUrl: u.profile_photo_url,
      city: u.city,
      state: u.state,
      isFriend: friendIds.has(u.id),
    })));
  } catch (err) {
    console.error('Get suggested users error:', err);
    res.status(500).json({ error: 'Failed to get suggested users' });
  }
});

// ============================================
// GET /api/users/search
// Search for users to add as friends
// ============================================
router.get('/search', authenticate, async (req, res) => {
  const { q } = req.query;

  if (!q || q.length < 2) {
    return res.json([]);
  }

  try {
    const result = await query(
      `SELECT id, first_name, last_name, profile_photo_url, city, state
       FROM users
       WHERE id != $1
         AND (
           LOWER(first_name || ' ' || last_name) LIKE LOWER($2)
           OR LOWER(email) LIKE LOWER($2)
         )
       LIMIT 20`,
      [req.user.id, `%${q}%`]
    );

    // Check which users are already friends
    const friendResult = await query(
      'SELECT friend_id FROM friendships WHERE user_id = $1',
      [req.user.id]
    );
    const friendIds = new Set(friendResult.rows.map(r => r.friend_id));

    res.json(result.rows.map(u => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      profilePhotoUrl: u.profile_photo_url,
      city: u.city,
      state: u.state,
      isFriend: friendIds.has(u.id),
    })));
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// ============================================
// POST /api/users/contacts/match
// Find users matching phone contacts
// ============================================
router.post('/contacts/match', authenticate, async (req, res) => {
  const { phoneNumbers } = req.body;

  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return res.json([]);
  }

  try {
    // Normalize phone numbers (remove all non-digits)
    const normalizedNumbers = phoneNumbers
      .map(p => p.replace(/\D/g, ''))
      .filter(p => p.length >= 10)
      .map(p => p.slice(-10)); // Get last 10 digits

    if (normalizedNumbers.length === 0) {
      return res.json([]);
    }

    // Find users with matching phone numbers
    const placeholders = normalizedNumbers.map((_, i) => `$${i + 2}`).join(', ');
    const result = await query(
      `SELECT id, first_name, last_name, profile_photo_url, city, state, phone,
              RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) as normalized_phone
       FROM users
       WHERE id != $1
         AND phone IS NOT NULL
         AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) IN (${placeholders})`,
      [req.user.id, ...normalizedNumbers]
    );

    // Check which users are already friends
    const friendResult = await query(
      'SELECT friend_id FROM friendships WHERE user_id = $1',
      [req.user.id]
    );
    const friendIds = new Set(friendResult.rows.map(r => r.friend_id));

    res.json(result.rows.map(u => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      profilePhotoUrl: u.profile_photo_url,
      city: u.city,
      state: u.state,
      isFriend: friendIds.has(u.id),
      matchedPhone: u.normalized_phone,
    })));
  } catch (err) {
    console.error('Match contacts error:', err);
    res.status(500).json({ error: 'Failed to match contacts' });
  }
});

// ============================================
// POST /api/users/me/friends
// Send a friend request (pending until accepted)
// ============================================
router.post('/me/friends', authenticate,
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
      // Check if they already sent us a request - if so, auto-accept
      const existingRequest = await query(
        `SELECT id FROM friendships
         WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
        [friendId, req.user.id]
      );

      if (existingRequest.rows.length > 0) {
        // They already requested us, so accept their request and create mutual friendship
        await query(
          `UPDATE friendships SET status = 'accepted' WHERE id = $1`,
          [existingRequest.rows[0].id]
        );
        await query(
          `INSERT INTO friendships (user_id, friend_id, status)
           VALUES ($1, $2, 'accepted')
           ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'`,
          [req.user.id, friendId]
        );
        return res.status(201).json({ success: true, status: 'accepted' });
      }

      // Check if already friends
      const alreadyFriends = await query(
        `SELECT id FROM friendships
         WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'`,
        [req.user.id, friendId]
      );

      if (alreadyFriends.rows.length > 0) {
        return res.status(200).json({ success: true, status: 'already_friends' });
      }

      // Send new friend request
      await query(
        `INSERT INTO friendships (user_id, friend_id, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (user_id, friend_id) DO NOTHING`,
        [req.user.id, friendId]
      );

      res.status(201).json({ success: true, status: 'pending' });
    } catch (err) {
      console.error('Add friend error:', err);
      res.status(500).json({ error: 'Failed to send friend request' });
    }
  }
);

// ============================================
// DELETE /api/users/me/friends/:friendId
// Remove close friend (bidirectional)
// ============================================
router.delete('/me/friends/:friendId', authenticate, async (req, res) => {
  try {
    // Remove both directions of the friendship
    await query(
      `DELETE FROM friendships
       WHERE (user_id = $1 AND friend_id = $2)
          OR (user_id = $2 AND friend_id = $1)`,
      [req.user.id, req.params.friendId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
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

    // Get user details for pre-filling Connect onboarding
    const userResult = await query(
      'SELECT email, first_name, last_name, phone, date_of_birth, address_line1, city, state, zip_code FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = userResult.rows[0];

    // Build individual object with verified data
    const individual = {};
    if (user.first_name) individual.first_name = user.first_name;
    if (user.last_name) individual.last_name = user.last_name;
    if (user.email) individual.email = user.email;
    if (user.phone) individual.phone = user.phone;
    if (user.date_of_birth) {
      const d = new Date(user.date_of_birth);
      individual.dob = { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
    }
    if (user.address_line1) {
      individual.address = {
        line1: user.address_line1,
        city: user.city || undefined,
        state: user.state || undefined,
        postal_code: user.zip_code || undefined,
        country: 'US',
      };
    }

    // Create Stripe Connect account with pre-filled data
    const account = await createConnectAccount(user.email, {
      userId: req.user.id,
      userName: `${user.first_name} ${user.last_name}`,
    }, individual);

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
          'SELECT email, first_name, last_name, phone, date_of_birth, address_line1, city, state, zip_code FROM users WHERE id = $1',
          [req.user.id]
        );

        const user = userResult.rows[0];

        // Build individual object with verified data
        const individual = {};
        if (user.first_name) individual.first_name = user.first_name;
        if (user.last_name) individual.last_name = user.last_name;
        if (user.email) individual.email = user.email;
        if (user.phone) individual.phone = user.phone;
        if (user.date_of_birth) {
          const d = new Date(user.date_of_birth);
          individual.dob = { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
        }
        if (user.address_line1) {
          individual.address = {
            line1: user.address_line1,
            city: user.city || undefined,
            state: user.state || undefined,
            postal_code: user.zip_code || undefined,
            country: 'US',
          };
        }

        const account = await createConnectAccount(user.email, {
          userId: req.user.id,
          userName: `${user.first_name} ${user.last_name}`,
        }, individual);

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

// ============================================
// GET /api/users/me/connect-balance
// Get Connect account balance (pending + available)
// ============================================
router.get('/me/connect-balance', authenticate, async (req, res) => {
  try {
    const user = await query(
      'SELECT stripe_connect_account_id FROM users WHERE id = $1',
      [req.user.id]
    );

    const connectId = user.rows[0]?.stripe_connect_account_id;
    if (!connectId) {
      return res.json({ pending: 0, available: 0, currency: 'usd' });
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: connectId,
    });

    const available = balance.available
      .filter(b => b.currency === 'usd')
      .reduce((sum, b) => sum + b.amount, 0);

    const pending = balance.pending
      .filter(b => b.currency === 'usd')
      .reduce((sum, b) => sum + b.amount, 0);

    res.json({
      available: available / 100,
      pending: pending / 100,
      currency: 'usd',
    });
  } catch (err) {
    console.error('Get Connect balance error:', err);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// ============================================
// GET /api/users/:id/ratings
// Get user ratings
// ============================================
router.get('/:id/ratings', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.rating, r.comment, r.created_at,
              u.id as rater_id, u.first_name, u.last_name, u.profile_photo_url
       FROM ratings r
       JOIN users u ON r.rater_id = u.id
       WHERE r.ratee_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );

    res.json(result.rows.map(r => ({
      rating: r.rating,
      comment: r.comment,
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
// GET /api/users/:id
// Get user profile
// NOTE: Must be after all specific routes (/search, /suggested, /me/*, etc.)
// ============================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, first_name, last_name, profile_photo_url, bio,
              city, state, status, rating, rating_count, total_transactions,
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
      rating: parseFloat(user.rating) || 0,
      ratingCount: user.rating_count,
      totalTransactions: user.total_transactions,
      memberSince: user.created_at,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ============================================
// GET /api/users/:id/listings
// Get user's active listings
// ============================================
router.get('/:id/listings', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT l.id, l.title, l.condition, l.is_free, l.price_per_day,
              (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url
       FROM listings l
       WHERE l.owner_id = $1 AND l.status = 'active'
       ORDER BY l.created_at DESC
       LIMIT 20`,
      [req.params.id]
    );

    res.json(result.rows.map(l => ({
      id: l.id,
      title: l.title,
      condition: l.condition,
      isFree: l.is_free,
      pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
      photoUrl: l.photo_url,
    })));
  } catch (err) {
    console.error('Get user listings error:', err);
    res.status(500).json({ error: 'Failed to get listings' });
  }
});

export default router;
