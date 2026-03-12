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
import { sendResetCodeEmail, sendAccountHintEmail } from '../services/email.js';
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
  body('email').isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('phone').optional({ values: 'falsy' }).isMobilePhone().withMessage('Please enter a valid phone number'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Registration validation errors:', errors.array());
      const messages = errors.array().map(e => e.msg);
      return res.status(400).json({ error: messages[0], errors: errors.array() });
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
        try {
          await sendNotification(referrerId, 'referral_joined', {
            friendName: `${firstName} ${lastName}`,
          }, { fromUserId: user.id });
        } catch (notifErr) {
          console.warn('Failed to send referral notification:', notifErr.message);
        }
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
      if (err.code === '23505') {
        // Unique constraint violation (e.g., duplicate email)
        return res.status(400).json({ error: 'An account with this email already exists.' });
      }
      res.status(500).json({ error: 'Something went wrong creating your account. Please try again.' });
    }
  }
);

// ============================================
// POST /api/auth/login
// ============================================
router.post('/login',
  body('email').isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const messages = errors.array().map(e => e.msg);
      return res.status(400).json({ error: messages[0], errors: errors.array() });
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
  if (!process.env.ADMIN_SECRET || !secret || secret !== process.env.ADMIN_SECRET) {
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
  if (!process.env.ADMIN_SECRET || !secret || secret !== process.env.ADMIN_SECRET) {
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
  if (!process.env.ADMIN_SECRET || !secret || secret !== process.env.ADMIN_SECRET) {
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

// DELETE /api/auth/account
// Delete user account (Apple App Store requirement)
// ============================================
router.delete('/account', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete in dependency order to avoid FK violations
    // 1. Tables referencing borrow_transactions
    await query('DELETE FROM disputes WHERE claimant_user_id = $1 OR respondent_user_id = $1', [userId]);
    await query('DELETE FROM ratings WHERE rater_id = $1 OR ratee_id = $1', [userId]);
    await query('DELETE FROM notifications WHERE user_id = $1 OR from_user_id = $1', [userId]);
    // 2. Transactions themselves
    await query('DELETE FROM borrow_transactions WHERE borrower_id = $1 OR lender_id = $1', [userId]);
    // 3. Tables referencing listings
    await query('DELETE FROM listing_discussions WHERE user_id = $1', [userId]);
    await query('DELETE FROM listing_discussions WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM listing_photos WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM listing_availability WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM saved_listings WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM saved_listings WHERE user_id = $1', [userId]);
    await query('DELETE FROM bundle_items WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM community_library_items WHERE donated_by = $1', [userId]);
    await query('DELETE FROM rto_contracts WHERE borrower_id = $1 OR lender_id = $1', [userId]);
    await query('DELETE FROM conversations WHERE listing_id IN (SELECT id FROM listings WHERE owner_id = $1)', [userId]);
    // 4. Listings
    await query('DELETE FROM listings WHERE owner_id = $1', [userId]);
    // 5. Messages & conversations (messages/participants reference conversations)
    await query('DELETE FROM message_reactions WHERE user_id = $1', [userId]);
    await query('DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE sender_id = $1)', [userId]);
    await query('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user1_id = $1 OR user2_id = $1)', [userId]);
    await query('DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE user1_id = $1 OR user2_id = $1)', [userId]);
    await query('DELETE FROM conversations WHERE user1_id = $1 OR user2_id = $1', [userId]);
    // 6. Remaining user-referenced tables
    await query('DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1', [userId]);
    await query('DELETE FROM community_memberships WHERE user_id = $1', [userId]);
    await query('DELETE FROM user_badges WHERE user_id = $1', [userId]);
    await query('DELETE FROM bundle_items WHERE bundle_id IN (SELECT id FROM bundles WHERE owner_id = $1)', [userId]);
    await query('DELETE FROM bundles WHERE owner_id = $1', [userId]);
    await query('DELETE FROM lending_circle_members WHERE user_id = $1', [userId]);
    await query('DELETE FROM subscription_history WHERE user_id = $1', [userId]);
    await query('DELETE FROM audit_log WHERE actor_id = $1', [userId]);
    await query('DELETE FROM item_requests WHERE user_id = $1', [userId]);
    // 7. Clear self-referencing FK and delete user
    await query('UPDATE users SET referred_by = NULL WHERE referred_by = $1', [userId]);
    await query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account. Please contact support.' });
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
              status, lender_rating, lender_rating_count, borrower_rating, borrower_rating_count,
              total_transactions, stripe_identity_verified_at,
              subscription_tier, stripe_connect_account_id,
              onboarding_step, onboarding_completed, is_founder,
              is_verified, verification_grace_until, is_admin,
              display_name
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
      displayName: user.display_name || '',
      phone: user.phone,
      profilePhotoUrl: user.profile_photo_url,
      bio: user.bio,
      city: user.city,
      state: user.state,
      status: user.status,
      isVerified: user.is_verified || (user.verification_grace_until && new Date(user.verification_grace_until) > new Date()) || false,
      lenderRating: parseFloat(user.lender_rating) || 0,
      lenderRatingCount: user.lender_rating_count || 0,
      borrowerRating: parseFloat(user.borrower_rating) || 0,
      borrowerRatingCount: user.borrower_rating_count || 0,
      totalTransactions: user.total_transactions,
      subscriptionTier: user.subscription_tier || 'free',
      hasConnectAccount: !!user.stripe_connect_account_id,
      onboardingStep: user.onboarding_step,
      onboardingCompleted: user.onboarding_completed || false,
      isFounder: user.is_founder || false,
      isAdmin: user.is_admin || false,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ============================================
// POST /api/auth/forgot-password
// Request password reset — stores SHA-256 hash of code, not raw
// ============================================
router.post('/forgot-password',
  body('email').isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const messages = errors.array().map(e => e.msg);
      return res.status(400).json({ error: messages[0], errors: errors.array() });
    }

    const { email } = req.body;

    try {
      const result = await query(
        'SELECT id, email, reset_code_expires FROM users WHERE email = $1',
        [email]
      );

      // Always return success to prevent email enumeration
      if (result.rows.length === 0) {
        return res.json({ message: 'If an account exists, a reset code has been sent' });
      }

      const user = result.rows[0];

      // Per-email rate limit: block if a code was sent in the last 20 minutes
      if (user.reset_code_expires) {
        const cooldownEnd = new Date(user.reset_code_expires);
        cooldownEnd.setMinutes(cooldownEnd.getMinutes() - 40); // 1hr expiry minus 40min = 20min after send
        if (new Date() < cooldownEnd) {
          return res.json({ message: 'If an account exists, a reset code has been sent' });
        }
      }

      // Generate 6-digit code and store SHA-256 hash
      const code = crypto.randomInt(100000, 999999).toString();
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await query(
        `UPDATE users SET reset_code_hash = $1, reset_code_expires = $2, reset_code_attempts = 0,
         reset_token_hash = NULL, reset_token_expires = NULL
         WHERE id = $3`,
        [codeHash, expires, user.id]
      );

      // Send email (best-effort — don't fail the request if email fails)
      sendResetCodeEmail(email, code).catch(err => {
        console.error('Failed to send reset email:', err);
      });

      res.json({ message: 'If an account exists, a reset code has been sent' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Failed to process request' });
    }
  }
);

// ============================================
// POST /api/auth/verify-reset-code
// Verify the 6-digit code, return a one-time reset token
// ============================================
router.post('/verify-reset-code',
  body('email').isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Please enter the 6-digit reset code'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const messages = errors.array().map(e => e.msg);
      return res.status(400).json({ error: messages[0], errors: errors.array() });
    }

    const { email, code } = req.body;

    try {
      const result = await query(
        'SELECT id, reset_code_hash, reset_code_expires, reset_code_attempts FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired reset code' });
      }

      const user = result.rows[0];

      // Check lockout (5 attempts max)
      if (user.reset_code_attempts >= 5) {
        return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
      }

      // Check expiry
      if (!user.reset_code_hash || !user.reset_code_expires || new Date(user.reset_code_expires) < new Date()) {
        return res.status(400).json({ error: 'Reset code has expired. Please request a new one.' });
      }

      // Atomically increment attempts first (prevents race condition)
      await query(
        'UPDATE users SET reset_code_attempts = reset_code_attempts + 1 WHERE id = $1',
        [user.id]
      );

      // Verify hash using timing-safe comparison
      const submittedHash = crypto.createHash('sha256').update(code).digest('hex');
      const storedHash = user.reset_code_hash;
      const hashesMatch = submittedHash.length === storedHash.length &&
        crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(storedHash));

      if (!hashesMatch) {
        return res.status(400).json({ error: 'Invalid reset code' });
      }

      // Success — generate one-time reset token (10min expiry)
      const resetToken = crypto.randomUUID();
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const tokenExpires = new Date(Date.now() + 10 * 60 * 1000);

      await query(
        `UPDATE users SET
         reset_token_hash = $1, reset_token_expires = $2,
         reset_code_hash = NULL, reset_code_expires = NULL, reset_code_attempts = 0
         WHERE id = $3`,
        [tokenHash, tokenExpires, user.id]
      );

      res.json({ resetToken });
    } catch (err) {
      console.error('Verify reset code error:', err);
      res.status(500).json({ error: 'Failed to verify code' });
    }
  }
);

// ============================================
// POST /api/auth/reset-password
// Reset password with one-time reset token
// ============================================
router.post('/reset-password',
  body('resetToken').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const messages = errors.array().map(e => e.msg);
      return res.status(400).json({ error: messages[0], errors: errors.array() });
    }

    const { resetToken, newPassword } = req.body;

    try {
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

      const result = await query(
        `SELECT id FROM users
         WHERE reset_token_hash = $1
           AND reset_token_expires > NOW()`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired reset token. Please start over.' });
      }

      const user = result.rows[0];
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update password, clear all reset columns, invalidate existing sessions
      await query(
        `UPDATE users SET
         password_hash = $1,
         reset_code_hash = NULL, reset_code_expires = NULL, reset_code_attempts = 0,
         reset_token_hash = NULL, reset_token_expires = NULL,
         token_invalidated_at = NOW()
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
// POST /api/auth/find-account
// Send account hint email — never reveals info to requester
// ============================================
const findAccountLimiter = new Map(); // IP -> { count, resetAt }
router.post('/find-account',
  async (req, res) => {
    const { phone, firstName, lastName } = req.body;

    const hasPhone = phone && phone.trim().length > 0;
    const hasName = firstName && firstName.trim().length > 0 && lastName && lastName.trim().length > 0;
    if (!hasPhone && !hasName) {
      return res.status(400).json({ error: 'Please provide a phone number or first and last name' });
    }

    // Rate limit: 3 per hour per IP
    const ip = req.ip;
    const now = Date.now();
    const entry = findAccountLimiter.get(ip);
    if (entry) {
      if (now < entry.resetAt) {
        if (entry.count >= 3) {
          return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }
        entry.count++;
      } else {
        findAccountLimiter.set(ip, { count: 1, resetAt: now + 3600000 });
      }
    } else {
      findAccountLimiter.set(ip, { count: 1, resetAt: now + 3600000 });
    }

    // Clean up old entries periodically
    if (findAccountLimiter.size > 1000) {
      for (const [key, val] of findAccountLimiter) {
        if (now > val.resetAt) findAccountLimiter.delete(key);
      }
    }

    try {
      let users;
      if (hasPhone) {
        const result = await query(
          'SELECT id, email, apple_id, google_id FROM users WHERE phone = $1 LIMIT 5',
          [phone.trim()]
        );
        users = result.rows;
      } else {
        const result = await query(
          'SELECT id, email, apple_id, google_id FROM users WHERE first_name ILIKE $1 AND last_name ILIKE $2 LIMIT 5',
          [firstName.trim(), lastName.trim()]
        );
        users = result.rows;
      }

      // Send hint emails (best-effort, skip users without email)
      for (const u of users) {
        if (!u.email) continue;
        const providers = [];
        if (u.apple_id) providers.push('apple');
        if (u.google_id) providers.push('google');
        sendAccountHintEmail(u.email, providers).catch(err => {
          console.error('Failed to send account hint email:', err);
        });
      }

      // Always return generic response
      res.json({ message: 'If matching accounts were found, we\'ve sent them a hint' });
    } catch (err) {
      console.error('Find account error:', err);
      res.status(500).json({ error: 'Failed to process request' });
    }
  }
);

// ============================================
// POST /api/auth/link-account
// Link Apple/Google provider to existing account
// ============================================
router.post('/link-account', authenticate, async (req, res) => {
  const { provider, idToken, identityToken } = req.body;

  if (!provider || !['apple', 'google'].includes(provider)) {
    return res.status(400).json({ error: 'Provider must be "apple" or "google"' });
  }

  try {
    if (provider === 'google') {
      if (!idToken) return res.status(400).json({ error: 'idToken is required' });

      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const { sub: googleId } = ticket.getPayload();

      // Check if another user already has this google_id
      const existing = await query('SELECT id FROM users WHERE google_id = $1 AND id != $2', [googleId, req.user.id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'This Google account is already linked to another user' });
      }

      await query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, req.user.id]);
    } else {
      if (!identityToken) return res.status(400).json({ error: 'identityToken is required' });

      // Decode Apple JWT header to get kid
      const header = JSON.parse(Buffer.from(identityToken.split('.')[0], 'base64').toString());
      const key = await appleJwksClient.getSigningKey(header.kid);
      const publicKey = key.getPublicKey();
      const decoded = jwt.verify(identityToken, publicKey, { algorithms: ['RS256'] });
      const appleId = decoded.sub;

      // Check if another user already has this apple_id
      const existing = await query('SELECT id FROM users WHERE apple_id = $1 AND id != $2', [appleId, req.user.id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'This Apple account is already linked to another user' });
      }

      await query('UPDATE users SET apple_id = $1 WHERE id = $2', [appleId, req.user.id]);
    }

    res.json({ message: 'Account linked successfully' });
  } catch (err) {
    console.error('Link account error:', err);
    res.status(400).json({ error: 'Failed to verify provider token' });
  }
});

// ============================================
// POST /api/auth/admin/debug-transactions
// Debug: list recent transactions
// ============================================
router.post('/admin/debug-transactions', async (req, res) => {
  const { secret } = req.body;
  if (!process.env.ADMIN_SECRET || !secret || secret !== process.env.ADMIN_SECRET) {
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
