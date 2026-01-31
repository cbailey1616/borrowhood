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

    // Fetch user from database
    const result = await query(
      'SELECT id, email, first_name, last_name, status FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Require verified identity
export function requireVerified(req, res, next) {
  if (req.user.status !== 'verified') {
    return res.status(403).json({
      error: 'Identity verification required',
      code: 'VERIFICATION_REQUIRED',
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
