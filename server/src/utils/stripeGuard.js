/**
 * Stripe environment safety guards.
 * Prevents test keys in production and production keys in development.
 * Call once at startup.
 */

// SWITCH TO LIVE KEYS ONLY FOR APP STORE RELEASE
export function validateStripeEnvironment() {
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const nodeEnv = process.env.NODE_ENV || 'development';

  const isTestSecret = secretKey.startsWith('sk_test_');
  const isLiveSecret = secretKey.startsWith('sk_live_');
  const isTestPublishable = publishableKey.startsWith('pk_test_');
  const isLivePublishable = publishableKey.startsWith('pk_live_');

  // Block production keys in development/test
  if (nodeEnv !== 'production') {
    if (isLiveSecret || isLivePublishable) {
      console.error(
        '\n🚨 FATAL: Live Stripe keys detected in non-production environment!\n' +
        `   NODE_ENV=${nodeEnv}\n` +
        `   STRIPE_SECRET_KEY=${secretKey.substring(0, 12)}...\n` +
        '   Switch to sk_test_/pk_test_ keys for development/testing.\n'
      );
      process.exit(1);
    }
  }

  // Block test keys in production
  if (nodeEnv === 'production') {
    if (isTestSecret || isTestPublishable) {
      console.error(
        '\n🚨 FATAL: Test Stripe keys detected in production!\n' +
        '   Switch to sk_live_/pk_live_ keys for production.\n'
      );
      process.exit(1);
    }
  }

  // Warn if keys are missing
  if (!secretKey) {
    console.warn('⚠️  STRIPE_SECRET_KEY is not set');
  }
  if (!publishableKey) {
    console.warn('⚠️  STRIPE_PUBLISHABLE_KEY is not set');
  }

  // Log test mode indicator
  if (isTestSecret) {
    console.log('⚠️  STRIPE TEST MODE — no real charges will be made');
  }
}
