import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from '../utils/db.js';
import { generateTokens, authenticate } from '../middleware/auth.js';
import { createStripeCustomer, createIdentityVerificationSession } from '../services/stripe.js';
import { body, validationResult } from 'express-validator';

const router = Router();

// ============================================
// POST /api/auth/register
// ============================================
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('phone').optional().isMobilePhone(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, phone } = req.body;

    try {
      // Check if email exists
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create Stripe customer (optional in development)
      let stripeCustomerId = null;
      try {
        const stripeCustomer = await createStripeCustomer(email, `${firstName} ${lastName}`);
        stripeCustomerId = stripeCustomer.id;
      } catch (stripeErr) {
        console.warn('Stripe customer creation skipped:', stripeErr.message);
      }

      // Insert user
      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, stripe_customer_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, first_name, last_name, status`,
        [email, passwordHash, firstName, lastName, phone, stripeCustomerId]
      );

      const user = result.rows[0];
      const tokens = generateTokens(user.id);

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          status: user.status,
        },
        ...tokens,
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// ============================================
// POST /api/auth/login
// ============================================
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const result = await query(
        `SELECT id, email, password_hash, first_name, last_name, status
         FROM users WHERE email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.status === 'suspended') {
        return res.status(403).json({ error: 'Account suspended' });
      }

      const tokens = generateTokens(user.id);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          status: user.status,
        },
        ...tokens,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// ============================================
// POST /api/auth/verify-identity
// Start Stripe Identity verification session
// ============================================
router.post('/verify-identity', authenticate, async (req, res) => {
  try {
    // Get user's Stripe customer ID
    const userResult = await query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!userResult.rows[0]?.stripe_customer_id) {
      return res.status(400).json({ error: 'User does not have a payment account' });
    }

    const returnUrl = `${process.env.FRONTEND_URL}/verification-complete`;
    const session = await createIdentityVerificationSession(
      userResult.rows[0].stripe_customer_id,
      returnUrl
    );

    // Store session ID
    await query(
      'UPDATE users SET stripe_identity_session_id = $1 WHERE id = $2',
      [session.id, req.user.id]
    );

    res.json({
      verificationUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('Identity verification error:', err);
    res.status(500).json({ error: 'Failed to start identity verification' });
  }
});

// ============================================
// GET /api/auth/me
// Get current user
// ============================================
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, profile_photo_url, bio,
              city, state, status, borrower_rating, borrower_rating_count,
              lender_rating, lender_rating_count, total_transactions,
              stripe_identity_verified_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      profilePhotoUrl: user.profile_photo_url,
      bio: user.bio,
      city: user.city,
      state: user.state,
      status: user.status,
      isVerified: user.status === 'verified',
      borrowerRating: parseFloat(user.borrower_rating) || 0,
      borrowerRatingCount: user.borrower_rating_count,
      lenderRating: parseFloat(user.lender_rating) || 0,
      lenderRatingCount: user.lender_rating_count,
      totalTransactions: user.total_transactions,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ============================================
// POST /api/auth/forgot-password
// Request password reset
// ============================================
router.post('/forgot-password',
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      // Check if user exists
      const result = await query('SELECT id, email FROM users WHERE email = $1', [email]);

      // Always return success to prevent email enumeration
      if (result.rows.length === 0) {
        return res.json({ message: 'If an account exists, a reset code has been sent' });
      }

      const user = result.rows[0];

      // Generate a 6-digit reset code
      const resetToken = crypto.randomInt(100000, 999999).toString();
      const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store reset token
      await query(
        'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
        [resetToken, resetExpires, user.id]
      );

      // TODO: Send email with reset code
      // For now, log it (in production, integrate with email service)
      console.log(`Password reset code for ${email}: ${resetToken}`);

      res.json({ message: 'If an account exists, a reset code has been sent' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Failed to process request' });
    }
  }
);

// ============================================
// POST /api/auth/reset-password
// Reset password with code
// ============================================
router.post('/reset-password',
  body('email').isEmail().normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }),
  body('newPassword').isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, code, newPassword } = req.body;

    try {
      // Find user with valid reset token
      const result = await query(
        `SELECT id FROM users
         WHERE email = $1
           AND password_reset_token = $2
           AND password_reset_expires > NOW()`,
        [email, code]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired reset code' });
      }

      const user = result.rows[0];

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update password and clear reset token
      await query(
        `UPDATE users
         SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL
         WHERE id = $2`,
        [passwordHash, user.id]
      );

      res.json({ message: 'Password reset successfully' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
);

export default router;
