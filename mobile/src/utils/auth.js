/**
 * Determine whether a verification status response indicates the user
 * should be treated as verified (fully verified, or in grace period).
 *
 * @param {object} result - Response from api.getVerificationStatus()
 * @returns {boolean}
 */
export function isUserVerified(result) {
  if (!result) return false;
  if (result.verified) return true;
  if (result.status === 'submitted' || result.status === 'processing') return true;
  return false;
}
