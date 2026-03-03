import { ENABLE_PAID_TIERS } from './config';

/**
 * Checks premium feature requirements and returns the next screen to navigate to.
 * @param {Object} user - User object from AuthContext
 * @param {'town_browse' | 'rental_listing'} source - Which feature triggered the gate
 * @returns {{ passed: boolean, screen?: string, params?: object, completedSteps: number, totalSteps: number }}
 */
export function checkPremiumGate(user, source) {
  if (!ENABLE_PAID_TIERS) {
    const isVerified = user?.isVerified;
    const hasConnect = user?.hasConnectAccount;

    // Verification required for town access even without paid tiers
    if (source === 'town_browse' && !isVerified) {
      return {
        passed: false,
        screen: 'IdentityVerification',
        params: { source, totalSteps: 1 },
        completedSteps: 0,
        totalSteps: 1,
      };
    }

    // Stripe Connect required for rental listings (payout setup)
    if (source === 'rental_listing') {
      if (!isVerified) {
        return {
          passed: false,
          screen: 'IdentityVerification',
          params: { source, totalSteps: hasConnect ? 1 : 2 },
          completedSteps: 0,
          totalSteps: hasConnect ? 1 : 2,
        };
      }
      if (!hasConnect) {
        return {
          passed: false,
          screen: 'SetupPayout',
          params: { source, totalSteps: 1 },
          completedSteps: 0,
          totalSteps: 1,
        };
      }
    }

    return { passed: true, completedSteps: 1, totalSteps: 1 };
  }

  const isPlus = user?.subscriptionTier === 'plus';
  const isVerified = user?.isVerified;
  const hasConnect = user?.hasConnectAccount;
  const totalSteps = source === 'rental_listing' ? 3 : 2;

  // If verified, they've completed the full flow (payment + identity)
  // so skip the subscription check entirely
  if (!isPlus && !isVerified) {
    return {
      passed: false,
      screen: 'Subscription',
      params: { source, totalSteps },
      completedSteps: 0,
      totalSteps,
    };
  }

  if (!isVerified) {
    return {
      passed: false,
      screen: 'IdentityVerification',
      params: { source, totalSteps },
      completedSteps: 1,
      totalSteps,
    };
  }

  if (source === 'rental_listing' && !hasConnect) {
    return {
      passed: false,
      screen: 'SetupPayout',
      params: { source, totalSteps },
      completedSteps: 2,
      totalSteps,
    };
  }

  return { passed: true, completedSteps: totalSteps, totalSteps };
}
