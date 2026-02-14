import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import jwksClient from 'jwks-rsa';
import { query } from '../utils/db.js';
import { generateTokens, authenticate } from '../middleware/auth.js';
import { createStripeCustomer, createIdentityVerificationSession, getIdentityVerificationSession } from '../services/stripe.js';
import { sendNotification } from '../services/notifications.js';
import { body, validationResult } from 'express-validator';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
});

const router = Router();

// ============================================
// POST /api/auth/register
// ============================================
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('phone').optional({ values: 'falsy' }).isMobilePhone(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Registration validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, phone, referralCode } = req.body;

    try {
      // Check if email exists
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Look up referrer by referral code (if provided)
      let referrerId = null;
      if (referralCode) {
        const referrerResult = await query(
          'SELECT id FROM users WHERE referral_code = $1',
          [referralCode.trim()]
        );
        if (referrerResult.rows.length > 0) {
          referrerId = referrerResult.rows[0].id;
        }
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

      // Insert user with referral info
      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, stripe_customer_id, referred_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, first_name, last_name, status`,
        [email, passwordHash, firstName, lastName, phone, stripeCustomerId, referrerId]
      );

      const user = result.rows[0];

      // Generate referral code for new user
      const newReferralCode = 'BH-' + user.id.replace(/-/g, '').substring(0, 8);
      await query(
        'UPDATE users SET referral_code = $1 WHERE id = $2',
        [newReferralCode, user.id]
      );

      // Notify referrer that someone joined with their code
      if (referrerId) {
        await sendNotification(referrerId, 'referral_joined', {
          friendName: `${firstName} ${lastName}`,
        }, { fromUserId: user.id });
      }

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
        `SELECT id, email, password_hash, first_name, last_name, status, city, state,
                onboarding_completed, onboarding_step
         FROM users WHERE email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'No account found with that email. Check your email or create a new account.' });
      }

      const user = result.rows[0];

      if (!user.password_hash) {
        return res.status(401).json({ error: 'This account uses social sign-in. Please use Google or Apple to sign in.' });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: 'Incorrect password. Please try again or reset your password.' });
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
          city: user.city,
          state: user.state,
          onboardingCompleted: user.onboarding_completed || false,
          onboardingStep: user.onboarding_step,
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
// POST /api/auth/google
// Google Sign-In
// ============================================
router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Try to find existing user by google_id or email
    let result = await query(
      'SELECT id, email, first_name, last_name, status, google_id, onboarding_completed, onboarding_step FROM users WHERE google_id = $1',
      [googleId]
    );

    let user;
    let isNewUser = false;

    if (result.rows.length > 0) {
      // Found by google_id
      user = result.rows[0];
    } else {
      // Check by email
      result = await query(
        'SELECT id, email, first_name, last_name, status, google_id, onboarding_completed, onboarding_step FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length > 0) {
        // Link Google to existing email account
        user = result.rows[0];
        await query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
      } else {
        // Create new user
        isNewUser = true;
        const nameParts = (name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Create Stripe customer
        let stripeCustomerId = null;
        try {
          const stripeCustomer = await createStripeCustomer(email, name);
          stripeCustomerId = stripeCustomer.id;
        } catch (stripeErr) {
          console.warn('Stripe customer creation skipped:', stripeErr.message);
        }

        result = await query(
          `INSERT INTO users (email, first_name, last_name, google_id, profile_photo_url, stripe_customer_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, email, first_name, last_name, status`,
          [email, firstName, lastName, googleId, picture || null, stripeCustomerId]
        );
        user = result.rows[0];

        // Generate referral code
        const referralCode = 'BH-' + user.id.replace(/-/g, '').substring(0, 8);
        await query('UPDATE users SET referral_code = $1 WHERE id = $2', [referralCode, user.id]);
      }
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }

    const tokens = generateTokens(user.id);

    res.status(isNewUser ? 201 : 200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        status: user.status,
        onboardingCompleted: user.onboarding_completed || false,
        onboardingStep: user.onboarding_step,
      },
      ...tokens,
    });
  } catch (err) {
    console.error('Google sign-in error:', err);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// ============================================
// POST /api/auth/apple
// Apple Sign-In
// ============================================
router.post('/apple', async (req, res) => {
  const { identityToken, fullName } = req.body;
  if (!identityToken) {
    return res.status(400).json({ error: 'identityToken is required' });
  }

  try {
    // Decode the JWT header to get the kid
    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid Apple token' });
    }

    // Fetch the matching public key from Apple's JWKS
    const key = await appleJwksClient.getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();

    // Verify the token
    const payload = jwt.verify(identityToken, signingKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      audience: 'com.borrowhood.app',
    });

    const { sub: appleId, email } = payload;

    // Try to find existing user by apple_id or email
    let result = await query(
      'SELECT id, email, first_name, last_name, status, apple_id, onboarding_completed, onboarding_step FROM users WHERE apple_id = $1',
      [appleId]
    );

    let user;
    let isNewUser = false;

    if (result.rows.length > 0) {
      // Found by apple_id
      user = result.rows[0];
    } else if (email) {
      // Check by email
      result = await query(
        'SELECT id, email, first_name, last_name, status, apple_id, onboarding_completed, onboarding_step FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length > 0) {
        // Link Apple to existing email account
        user = result.rows[0];
        await query('UPDATE users SET apple_id = $1 WHERE id = $2', [appleId, user.id]);
      } else {
        // Create new user — Apple only sends name on first sign-in
        isNewUser = true;
        const firstName = fullName?.givenName || '';
        const lastName = fullName?.familyName || '';

        let stripeCustomerId = null;
        try {
          const stripeCustomer = await createStripeCustomer(email, `${firstName} ${lastName}`.trim());
          stripeCustomerId = stripeCustomer.id;
        } catch (stripeErr) {
          console.warn('Stripe customer creation skipped:', stripeErr.message);
        }

        result = await query(
          `INSERT INTO users (email, first_name, last_name, apple_id, stripe_customer_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, first_name, last_name, status`,
          [email, firstName, lastName, appleId, stripeCustomerId]
        );
        user = result.rows[0];

        // Generate referral code
        const referralCode = 'BH-' + user.id.replace(/-/g, '').substring(0, 8);
        await query('UPDATE users SET referral_code = $1 WHERE id = $2', [referralCode, user.id]);
      }
    } else {
      // No email and no existing apple_id match — create with just apple_id
      isNewUser = true;
      const firstName = fullName?.givenName || '';
      const lastName = fullName?.familyName || '';

      let stripeCustomerId = null;
      try {
        const stripeCustomer = await createStripeCustomer('', `${firstName} ${lastName}`.trim());
        stripeCustomerId = stripeCustomer.id;
      } catch (stripeErr) {
        console.warn('Stripe customer creation skipped:', stripeErr.message);
      }

      result = await query(
        `INSERT INTO users (first_name, last_name, apple_id, stripe_customer_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, first_name, last_name, status`,
        [firstName, lastName, appleId, stripeCustomerId]
      );
      user = result.rows[0];

      const referralCode = 'BH-' + user.id.replace(/-/g, '').substring(0, 8);
      await query('UPDATE users SET referral_code = $1 WHERE id = $2', [referralCode, user.id]);
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }

    const tokens = generateTokens(user.id);

    res.status(isNewUser ? 201 : 200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        status: user.status,
        onboardingCompleted: user.onboarding_completed || false,
        onboardingStep: user.onboarding_step,
      },
      ...tokens,
    });
  } catch (err) {
    console.error('Apple sign-in error:', err);
    res.status(401).json({ error: 'Invalid Apple token' });
  }
});

// ============================================
// POST /api/auth/verify-identity
// Start Stripe Identity verification session
// ============================================
router.post('/verify-identity', authenticate, async (req, res) => {
  try {
    // Get user's Stripe customer ID, create one if needed
    const userResult = await query(
      'SELECT stripe_customer_id, email, first_name, last_name FROM users WHERE id = $1',
      [req.user.id]
    );

    let customerId = userResult.rows[0]?.stripe_customer_id;

    if (!customerId) {
      const user = userResult.rows[0];
      const customer = await createStripeCustomer(
        user.email,
        `${user.first_name} ${user.last_name}`,
        { userId: req.user.id }
      );
      customerId = customer.id;
      await query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, req.user.id]
      );
    }

    const returnUrl = 'https://borrowhood-production.up.railway.app/verification-complete';
    const session = await createIdentityVerificationSession(
      customerId,
      returnUrl
    );

    // Store session ID (non-blocking — column may not exist yet)
    query(
      'UPDATE users SET stripe_identity_session_id = $1 WHERE id = $2',
      [session.id, req.user.id]
    ).catch(err => console.log('Could not store identity session ID:', err.message));

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
// POST /api/auth/reset-verification
// Reset verification status so user can re-verify
// ============================================
router.post('/reset-verification', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE users SET
        is_verified = false,
        status = 'active',
        stripe_identity_session_id = NULL,
        verified_at = NULL,
        verification_grace_until = NULL,
        verification_status = NULL
       WHERE id = $1`,
      [req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Reset verification error:', err);
    res.status(500).json({ error: 'Failed to reset verification' });
  }
});

// ============================================
// POST /api/auth/check-verification
// Check Stripe Identity verification status
// ============================================
router.post('/check-verification', authenticate, async (req, res) => {
  try {
    // List recent verification sessions for this customer
    const userResult = await query(
      'SELECT stripe_customer_id, status FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!userResult.rows[0]?.stripe_customer_id) {
      return res.json({ verified: false, status: 'no_customer' });
    }

    const { stripe_customer_id, status } = userResult.rows[0];

    // If already verified in our DB, return early
    if (status === 'verified') {
      return res.json({ verified: true, status: 'verified' });
    }

    // Check Stripe for completed verification sessions
    const { default: Stripe } = await import('stripe');
    // SWITCH TO LIVE KEYS ONLY FOR APP STORE RELEASE
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sessions = await stripe.identity.verificationSessions.list({
      limit: 10,
    });

    // Find a verified session for this customer (check metadata or any verified session)
    const verified = sessions.data.find(
      s => s.status === 'verified' &&
        (s.metadata?.customer_id === stripe_customer_id || s.metadata?.userId === req.user.id)
    );

    if (verified) {
      // Update user status and is_verified flag
      await query(
        "UPDATE users SET status = 'verified', is_verified = true WHERE id = $1",
        [req.user.id]
      );
      return res.json({ verified: true, status: 'verified' });
    }

    // Check if any session is still processing
    const processing = sessions.data.find(
      s => s.status === 'processing' &&
        (s.metadata?.customer_id === stripe_customer_id || s.metadata?.userId === req.user.id)
    );

    res.json({
      verified: false,
      status: processing ? 'processing' : 'not_verified',
    });
  } catch (err) {
    console.error('Check verification error:', err);
    res.status(500).json({ error: 'Failed to check verification status' });
  }
});

// ============================================
// POST /api/auth/admin/reset-onboarding
// Temp admin endpoint to reset a user's onboarding
// ============================================
router.post('/admin/reset-onboarding', async (req, res) => {
  const { email, secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await query(
      "UPDATE users SET city = NULL, state = NULL, onboarding_step = NULL, onboarding_completed = false, is_founder = false WHERE email = $1 RETURNING id, email",
      [email]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /api/auth/admin/reset-verifications
// Reset all user verifications (admin only)
// ============================================
router.post('/admin/reset-verifications', async (req, res) => {
  const { secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await query(
      "UPDATE users SET status = 'active', is_verified = false, stripe_identity_verified_at = NULL WHERE is_verified = true RETURNING id, email"
    );
    res.json({ success: true, count: result.rowCount, users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/admin/reset-user
// Full reset: clear Stripe, subscription, onboarding, verification for a user
// ============================================
router.post('/admin/reset-user', async (req, res) => {
  const { email, secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await query(
      `UPDATE users SET
        stripe_customer_id = NULL,
        stripe_subscription_id = NULL,
        subscription_tier = 'free',
        city = NULL,
        state = NULL,
        latitude = NULL,
        longitude = NULL,
        onboarding_step = NULL,
        onboarding_completed = false,
        is_founder = false,
        is_verified = false,
        status = 'pending',
        stripe_identity_verified_at = NULL,
        stripe_connect_account_id = NULL,
        verification_grace_until = NULL,
        verification_status = NULL,
        stripe_identity_session_id = NULL
      WHERE email = $1 RETURNING id, email`,
      [email]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    // Also clear community memberships
    const userId = result.rows[0].id;
    await query('DELETE FROM community_memberships WHERE user_id = $1', [userId]);

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
// Get current user
// ============================================
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, phone, profile_photo_url, bio,
              city, state,
              status, rating, rating_count,
              total_transactions, stripe_identity_verified_at,
              subscription_tier, stripe_connect_account_id,
              onboarding_step, onboarding_completed, is_founder,
              is_verified, verification_grace_until
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
      phone: user.phone,
      profilePhotoUrl: user.profile_photo_url,
      bio: user.bio,
      city: user.city,
      state: user.state,
      status: user.status,
      isVerified: user.is_verified || (user.verification_grace_until && new Date(user.verification_grace_until) > new Date()) || false,
      rating: parseFloat(user.rating) || 0,
      ratingCount: user.rating_count,
      totalTransactions: user.total_transactions,
      subscriptionTier: user.subscription_tier || 'free',
      hasConnectAccount: !!user.stripe_connect_account_id,
      onboardingStep: user.onboarding_step,
      onboardingCompleted: user.onboarding_completed || false,
      isFounder: user.is_founder || false,
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

// ============================================
// POST /api/auth/admin/debug-transactions
// Debug: list recent transactions
// ============================================
router.post('/admin/debug-transactions', async (req, res) => {
  const { secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await query(
      `SELECT bt.id, bt.status, bt.payment_status, bt.borrower_id, bt.lender_id,
              bt.created_at, l.title,
              b.first_name as borrower_name, lnd.first_name as lender_name
       FROM borrow_transactions bt
       JOIN listings l ON bt.listing_id = l.id
       JOIN users b ON bt.borrower_id = b.id
       JOIN users lnd ON bt.lender_id = lnd.id
       ORDER BY bt.created_at DESC
       LIMIT 15`
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
