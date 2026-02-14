import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import {
  stripe,
  createStripeCustomer,
  createIdentityVerificationSession,
  getIdentityVerificationSession,
} from '../services/stripe.js';

const router = Router();

// ============================================
// POST /api/identity/verify
// Create a Stripe Identity VerificationSession
// Returns client_secret for native SDK flow
// ============================================
router.post('/verify', authenticate, async (req, res) => {
  try {
    const userResult = await query(
      'SELECT stripe_customer_id, email, first_name, last_name, is_verified FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userResult.rows[0].is_verified) {
      return res.status(400).json({ error: 'Already verified' });
    }

    let customerId = userResult.rows[0].stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const user = userResult.rows[0];
      const customer = await createStripeCustomer(
        user.email,
        `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        { userId: req.user.id }
      );
      customerId = customer.id;
      await query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, req.user.id]
      );
    }

    // Create verification session with document + selfie
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        customer_id: customerId,
        userId: req.user.id,
      },
      options: {
        document: {
          require_id_number: false,
          require_live_capture: true,
          require_matching_selfie: true,
          allowed_types: ['driving_license', 'id_card', 'passport'],
        },
      },
    });

    // Store session ID and update verification status
    await query(
      `UPDATE users SET
        stripe_identity_session_id = $1,
        verification_status = 'pending'
       WHERE id = $2`,
      [session.id, req.user.id]
    );

    // Create ephemeral key for the verification session (required by RN SDK)
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { verification_session: session.id },
      { apiVersion: '2024-06-20' }
    );

    res.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      ephemeralKeySecret: ephemeralKey.secret,
    });
  } catch (err) {
    console.error('Create verification session error:', err);
    res.status(500).json({ error: 'Failed to start identity verification' });
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
        }

        const graceActive = user.verification_grace_until && new Date(user.verification_grace_until) > new Date();
        return res.json({
          verified: stripeStatus === 'verified' || (stripeStatus === 'processing' && graceActive),
          status: verificationStatus,
          verifiedAt: user.verified_at,
          lastError: session.last_error?.reason || null,
        });
      } catch (stripeErr) {
        console.error('Failed to fetch verification session:', stripeErr.message);
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
