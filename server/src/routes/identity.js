import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { getIdentityVerificationSession } from '../services/stripe.js';
import { startIdentitySession, sendIdentityError } from '../services/identitySession.js';
import { getVerificationEligibility, recordAppleVerificationPurchase } from '../services/verificationPurchases.js';

const router = Router();

router.get('/eligibility', authenticate, async (req, res) => {
  try { res.json(await getVerificationEligibility(req.user.id)); }
  catch (error) { sendIdentityError(res, error); }
});

router.post('/apple-purchase', authenticate, async (req, res) => {
  try { res.json(await recordAppleVerificationPurchase(req.user.id, req.body?.signedTransaction)); }
  catch (error) { sendIdentityError(res, error); }
});

// ============================================
// POST /api/identity/verify
// Create a Stripe Identity VerificationSession
// Returns client_secret for native SDK flow
// ============================================
router.post('/verify', authenticate, async (req, res) => {
  try {
    res.json(await startIdentitySession(req.user.id, { native: true }));
  } catch (err) {
    console.error('Create verification session error:', err);
    sendIdentityError(res, err);
  }
});

// ============================================
// GET /api/identity/status
// Get current verification status
// ============================================
router.get('/status', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT is_verified, verification_status, stripe_identity_session_id, verified_at, verification_grace_until
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // If we have a session, fetch live status from Stripe
    if (user.stripe_identity_session_id && !user.is_verified) {
      try {
        const session = await getIdentityVerificationSession(user.stripe_identity_session_id);
        const stripeStatus = session.status; // requires_input, processing, verified, canceled

        // Map Stripe status to our status
        let verificationStatus = user.verification_status;
        if (stripeStatus === 'verified') {
          verificationStatus = 'verified';
          // Update DB if webhook hasn't fired yet — also store verified data
          const verifiedData = session.verified_outputs || {};
          const dob = verifiedData.dob;
          const dobDate = dob ? `${dob.year}-${String(dob.month).padStart(2, '0')}-${String(dob.day).padStart(2, '0')}` : null;
          const addr = verifiedData.address;
          await query(
            `UPDATE users SET
              status = 'verified', is_verified = true, verification_status = 'verified', verified_at = NOW(),
              first_name = COALESCE($2, first_name),
              last_name = COALESCE($3, last_name),
              address_line1 = COALESCE($4, address_line1),
              city = COALESCE($5, city),
              state = COALESCE($6, state),
              zip_code = COALESCE($7, zip_code),
              date_of_birth = COALESCE($8, date_of_birth)
             WHERE id = $1 AND is_verified = false`,
            [req.user.id, verifiedData.first_name, verifiedData.last_name, addr?.line1, addr?.city, addr?.state, addr?.postal_code, dobDate]
          );
        } else if (stripeStatus === 'requires_input') {
          verificationStatus = 'requires_input';
          await query(
            `UPDATE users SET verification_status = 'requires_input' WHERE id = $1`,
            [req.user.id]
          );
        } else if (stripeStatus === 'processing') {
          verificationStatus = 'processing';
          // Set 6-hour grace period so user gets verified privileges while Stripe processes
          if (!user.verification_grace_until || new Date(user.verification_grace_until) < new Date()) {
            await query(
              `UPDATE users SET verification_grace_until = NOW() + interval '6 hours', verification_status = 'processing'
               WHERE id = $1`,
              [req.user.id]
            );
            // Grace was just set — mark active so the response reflects it immediately
            user.verification_grace_until = new Date(Date.now() + 6 * 60 * 60 * 1000);
          }
        } else {
          // Unrecognized status (e.g. 'canceled' or future Stripe additions)
          return res.json({
            verified: false,
            status: 'unknown',
            lastError: session.last_error?.reason || null,
          });
        }

        const graceActive = user.verification_grace_until && new Date(user.verification_grace_until) > new Date();
        return res.json({
          verified: stripeStatus === 'verified',
          status: verificationStatus,
          verifiedAt: user.verified_at,
          lastError: session.last_error?.reason || null,
        });
      } catch (stripeErr) {
        console.error('Failed to fetch verification session:', stripeErr.message);
        return res.json({
          verified: false,
          status: 'unknown',
          error: 'Could not retrieve verification status',
        });
      }
    }

    res.json({
      verified: user.is_verified,
      status: user.is_verified ? 'verified' : (user.verification_status || 'none'),
      verifiedAt: user.verified_at,
    });
  } catch (err) {
    console.error('Get verification status error:', err);
    res.status(500).json({ error: 'Failed to get verification status' });
  }
});

export default router;
