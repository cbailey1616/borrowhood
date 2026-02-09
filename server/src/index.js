import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger.js';
import { runMigrations } from './utils/migrations.js';
import { validateStripeEnvironment } from './utils/stripeGuard.js';

// Validate Stripe keys match the environment
validateStripeEnvironment();

// Routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import communityRoutes from './routes/communities.js';
import listingRoutes from './routes/listings.js';
import transactionRoutes from './routes/transactions.js';
import disputeRoutes from './routes/disputes.js';
import notificationRoutes from './routes/notifications.js';
import webhookRoutes from './routes/webhooks.js';
import requestRoutes from './routes/requests.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes from './routes/uploads.js';
import discussionRoutes from './routes/discussions.js';
import feedRoutes from './routes/feed.js';
import sustainabilityRoutes from './routes/sustainability.js';
import badgeRoutes from './routes/badges.js';
import bundleRoutes from './routes/bundles.js';
import circleRoutes from './routes/circles.js';
import seasonalRoutes from './routes/seasonal.js';
import availabilityRoutes from './routes/availability.js';
import libraryRoutes from './routes/library.js';
import subscriptionRoutes from './routes/subscriptions.js';
import paymentMethodRoutes from './routes/paymentMethods.js';
import savedRoutes from './routes/saved.js';
import categoryRoutes from './routes/categories.js';
import referralRoutes from './routes/referrals.js';
import identityRoutes from './routes/identity.js';
import paymentRoutes from './routes/payments.js';
import rentalRoutes from './routes/rentals.js';
import onboardingRoutes from './routes/onboarding.js';

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration - allow all for development
app.use(cors({
  origin: true,
  credentials: true,
}));

// Rate limiting - relaxed for alpha testing
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Relaxed for alpha
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health', // Skip health checks
});

// Rate limit for auth routes - relaxed for alpha testing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Relaxed for alpha
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for Stripe/payment endpoints
const stripeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Strict — payment creation is expensive
  message: { error: 'Too many payment requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all requests
app.use(limiter);

// Apply stricter rate limiting to auth routes
app.use('/api/auth', authLimiter);

// Apply strict rate limiting to Stripe-related endpoints
app.use('/api/payments', stripeLimiter);
app.use('/api/subscriptions', stripeLimiter);
app.use('/api/identity', stripeLimiter);
app.use('/api/rentals', stripeLimiter);

// Stripe webhooks need raw body (before JSON parsing)
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

// Parse JSON for all other routes
app.use(express.json({ limit: '10mb' }));

// Serve uploaded files (for local development without S3)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve legal pages (terms, privacy)
app.use(express.static(path.join(__dirname, '../public')));
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/terms.html'));
});
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy.html'));
});

// Stripe verification return — user taps Done in Safari to return to app
app.get('/verification-complete', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verification Submitted — Borrowhood</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#0D1F12;color:#E8E4DC;
  display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
  .card{max-width:360px}
  h1{font-size:24px;margin:0 0 8px}
  p{color:#9CA38F;line-height:1.5;margin:0 0 24px}
  .icon{font-size:64px;margin-bottom:16px}
  .sub{color:#6B7A5E;font-size:13px}
</style>
</head><body>
<div class="card">
  <div class="icon">&#x2705;</div>
  <h1>Verification Submitted</h1>
  <p>Your identity verification has been submitted. Tap <strong>Done</strong> in the top corner to return to Borrowhood.</p>
  <p class="sub">Your verification status will update automatically.</p>
</div>
</body></html>`);
});

// Stripe Connect return — user taps Done in Safari to return to app
app.get('/connect/return', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payout Setup — Borrowhood</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#0D1F12;color:#E8E4DC;
  display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
  .card{max-width:360px}
  h1{font-size:24px;margin:0 0 8px}
  p{color:#9CA38F;line-height:1.5;margin:0 0 24px}
  .icon{font-size:64px;margin-bottom:16px}
  .sub{color:#6B7A5E;font-size:13px}
</style>
</head><body>
<div class="card">
  <div class="icon">&#x2705;</div>
  <h1>Payout Setup Complete</h1>
  <p>Your payout account has been set up. Tap <strong>Done</strong> in the top corner to return to Borrowhood.</p>
  <p class="sub">Your payout status will update automatically.</p>
</div>
</body></html>`);
});

// Stripe Connect refresh — onboarding link expired
app.get('/connect/refresh', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payout Setup — Borrowhood</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#0D1F12;color:#E8E4DC;
  display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
  .card{max-width:360px}
  h1{font-size:24px;margin:0 0 8px}
  p{color:#9CA38F;line-height:1.5;margin:0 0 24px}
  .icon{font-size:64px;margin-bottom:16px}
  .sub{color:#6B7A5E;font-size:13px}
</style>
</head><body>
<div class="card">
  <div class="icon">&#x1F504;</div>
  <h1>Session Expired</h1>
  <p>Your onboarding session expired. Tap <strong>Done</strong> in the top corner to return to Borrowhood and try again.</p>
  <p class="sub">Your payout status will update automatically.</p>
</div>
</body></html>`);
});

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/sustainability', sustainabilityRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/bundles', bundleRoutes);
app.use('/api/circles', circleRoutes);
app.use('/api/seasonal', seasonalRoutes);
app.use('/api/listings', availabilityRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/saved', savedRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/listings', discussionRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/identity', identityRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/webhooks', webhookRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Temporary admin: nuke account by email (remove after use)
app.delete('/api/admin/nuke-account/:email', async (req, res) => {
  const { query: dbQuery } = await import('./utils/db.js');
  const email = decodeURIComponent(req.params.email);
  const secret = req.headers['x-admin-secret'];
  if (secret !== 'borrowhood-nuke-2026') return res.status(403).json({ error: 'Forbidden' });
  try {
    const userResult = await dbQuery('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const uid = userResult.rows[0].id;
    const tables = [
      ['messages', 'conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = $1)'],
      ['conversation_participants', 'user_id = $1'],
      ['notifications', 'user_id = $1'],
      ['disputes', 'lender_id = $1 OR borrower_id = $1'],
      ['borrow_transactions', 'borrower_id = $1 OR lender_id = $1'],
      ['saved_listings', 'user_id = $1'],
      ['listing_discussions', 'user_id = $1'],
      ['listing_photos', 'listing_id IN (SELECT id FROM listings WHERE owner_id = $1)'],
      ['listing_availability', 'listing_id IN (SELECT id FROM listings WHERE owner_id = $1)'],
      ['listings', 'owner_id = $1'],
      ['item_requests', 'user_id = $1'],
      ['user_badges', 'user_id = $1'],
      ['friendships', 'user_id = $1 OR friend_id = $1'],
      ['community_memberships', 'user_id = $1'],
      ['subscription_history', 'user_id = $1'],
      ['users', 'id = $1'],
    ];
    const results = [];
    for (const [table, where] of tables) {
      try {
        const r = await dbQuery(`DELETE FROM ${table} WHERE ${where}`, [uid]);
        if (r.rowCount > 0) results.push(`${table}: ${r.rowCount}`);
      } catch (e) { results.push(`${table}: skip (${e.message.substring(0, 40)})`); }
    }
    res.json({ deleted: true, email, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;

// Run migrations before starting server
runMigrations().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Borrowhood server running on port ${PORT}`);
  });
});
