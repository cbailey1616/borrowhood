import { withTransaction } from '../utils/db.js';
import { stripe, getIdentityVerificationSession } from './stripe.js';
import { requireVerificationEligibility } from './verificationPurchases.js';
import { purchaseError } from './appleVerification.js';

// Hosted and legacy native clients share the same lock, eligibility check and
// Stripe idempotency keys. An interrupted request cannot create two paid checks.
export async function startIdentitySession(userId, { native = false } = {}) {
  return withTransaction(async client => {
    const user = (await client.query(`SELECT stripe_customer_id,email,first_name,last_name,is_verified,
      stripe_identity_session_id,identity_session_revision FROM users WHERE id=$1 FOR UPDATE`, [userId])).rows[0];
    if (!user) throw purchaseError(404, 'User not found.', 'USER_NOT_FOUND');
    if (user.is_verified) throw purchaseError(400, 'Already verified.', 'ALREADY_VERIFIED');
    await requireVerificationEligibility(userId, client);

    const previousId = user.stripe_identity_session_id;
    // Provider failures are retryable; do not interpret them as a missing
    // session and silently initiate another billable identity check.
    let session = previousId ? await getIdentityVerificationSession(previousId) : null;
    if (session?.status === 'verified') {
      throw purchaseError(409, 'Verification is complete. Refresh your verification status.', 'VERIFICATION_COMPLETE');
    }
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email, name: `${user.first_name || ''} ${user.last_name || ''}`.trim(), metadata: { userId },
      }, { idempotencyKey: `identity-customer-${userId}` });
      customerId = customer.id;
      await client.query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [customerId, userId]);
    }
    if (!session || session.status === 'canceled') {
      session = await stripe.identity.verificationSessions.create({
        type: 'document', metadata: { customer_id: customerId, userId },
        return_url: 'borrowhood://verification-complete',
        options: { document: { require_id_number: false, require_live_capture: true,
          require_matching_selfie: true, allowed_types: ['driving_license', 'id_card', 'passport'] } },
      }, { idempotencyKey: `identity-${userId}-${user.identity_session_revision || 0}-${previousId || 'initial'}` });
    }
    await client.query(`UPDATE users SET stripe_identity_session_id=$1,verification_status=$2 WHERE id=$3`,
      [session.id, session.status === 'processing' ? 'processing' : 'pending', userId]);
    if (native) {
      const ephemeralKey = await stripe.ephemeralKeys.create({ verification_session: session.id }, { apiVersion: '2024-06-20' });
      return { clientSecret: session.client_secret, sessionId: session.id, ephemeralKeySecret: ephemeralKey.secret };
    }
    return { verificationUrl: session.url, sessionId: session.id };
  });
}

export function sendIdentityError(res, error) {
  const known = error.isVerificationPurchaseError === true
    && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599;
  return res.status(known ? error.status : 503).json({
    error: known ? error.message : 'Could not start identity verification. Please try again.',
    code: known ? error.code : 'VERIFICATION_UNAVAILABLE',
  });
}
