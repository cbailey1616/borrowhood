/**
 * Determine whether a verification status response indicates the user
 * has completed verification. Pending checks do not earn a badge.
 *
 * @param {object} result - Response from api.getVerificationStatus()
 * @returns {boolean}
 */
export function isUserVerified(result) {
  if (!result) return false;
  if (result.verified) return true;
  if (result.status === 'verified') return true;
  return false;
}
