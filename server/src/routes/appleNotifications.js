import { Router } from 'express';
import { handleAppleVerificationNotification } from '../services/verificationPurchases.js';

const router = Router();
// Configure this URL for App Store Server Notifications V2. The body contains
// Apple's signedPayload, not a Stripe raw-body signature or a user auth token.
router.post('/apple', async (req, res) => {
  try {
    res.json(await handleAppleVerificationNotification(req.body?.signedPayload));
  } catch (error) {
    // Server failures must remain retryable. Dedup is committed only with the
    // matching entitlement update, unlike a preemptive event receipt insert.
    const known = error.isVerificationPurchaseError === true
      && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599;
    res.status(known ? error.status : 503).json({
      error: known ? error.message : 'Apple notification processing is temporarily unavailable.',
      code: known ? error.code : 'APPLE_NOTIFICATION_UNAVAILABLE',
    });
  }
});

export default router;
