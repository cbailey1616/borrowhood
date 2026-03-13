import jwt from 'jsonwebtoken';
import { query } from '../utils/db.js';

// Verify JWT token
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from database (token_invalidated_at may not exist on first deploy)
    let result;
    try {
      result = await query(
        'SELECT id, email, first_name, last_name, display_name, status, is_admin, token_invalidated_at FROM users WHERE id = $1',
        [decoded.userId]
      );
    } catch (colErr) {
      // Fallback if token_invalidated_at column doesn't exist yet
      result = await query(
        'SELECT id, email, first_name, last_name, status, is_admin FROM users WHERE id = $1',
        [decoded.userId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }

    // Check if token was issued before a password reset invalidated all sessions
    if (user.token_invalidated_at && decoded.iat) {
      const invalidatedAt = Math.floor(new Date(user.token_invalidated_at).getTime() / 1000);
      if (decoded.iat < invalidatedAt) {
        return res.status(401).json({ error: 'Token invalidated — please sign in again' });
      }
    }

    req.user = user;
    req.user.is_admin = user.is_admin || false;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Require verified identity (checks both is_verified flag and grace period)
export async function requireVerified(req, res, next) {
  const result = await query(
    'SELECT is_verified, verification_grace_until FROM users WHERE id = $1',
    [req.user.id]
  );
  const u = result.rows[0];
  const graceActive = u?.verification_grace_until && new Date(u.verification_grace_until) > new Date();
  const isVerified = u?.is_verified || graceActive;

  if (!isVerified) {
    return res.status(403).json({
      error: 'Identity verification required',
      code: 'VERIFICATION_REQUIRED',
    });
  }
  next();
}

// TODO: Set to true to re-enable paid subscription tiers
const ENABLE_PAID_TIERS = process.env.ENABLE_PAID_TIERS === 'true';
export { ENABLE_PAID_TIERS };

// Require active Plus subscription
// TODO: Restore gate logic when re-enabling paid tiers (ENABLE_PAID_TIERS)
export async function requireSubscription(req, res, next) {
  if (!ENABLE_PAID_TIERS) return next();

  const result = await query(
    'SELECT subscription_tier, is_verified, verification_grace_until FROM users WHERE id = $1',
    [req.user.id]
  );
  const u = result.rows[0];
  const graceActive = u?.verification_grace_until && new Date(u.verification_grace_until) > new Date();
  const isVerified = u?.is_verified || graceActive;
  if (u?.subscription_tier !== 'plus' && !isVerified) {
    return res.status(403).json({
      error: 'Plus subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
    });
  }
  next();
}

// Require organizer role for a community
export async function requireOrganizer(req, res, next) {
  const communityId = req.params.communityId || req.body.communityId;

  if (!communityId) {
    return res.status(400).json({ error: 'Community ID required' });
  }

  const result = await query(
    `SELECT role FROM community_memberships
     WHERE user_id = $1 AND community_id = $2`,
    [req.user.id, communityId]
  );

  if (result.rows.length === 0 || result.rows[0].role !== 'organizer') {
    return res.status(403).json({ error: 'Organizer access required' });
  }

  next();
}

// Require admin role
export function requireAdmin(req, res, next) {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Generate tokens
export function generateTokens(userId) {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );

  return { accessToken, refreshToken };
}
