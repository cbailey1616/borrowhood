import * as WebBrowser from 'expo-web-browser';
import api from './api';
import { isUserVerified } from '../utils/auth';
import { ensureVerificationAccess } from './verificationPurchases';

const RETURN_URL = 'borrowhood://verification-complete';

// Use Stripe's hosted check so the app does not need Stripe's native payment
// dependencies. A browser callback never grants verification by itself.
export async function verifyIdentityInBrowser(isCurrent = () => true, options = {}) {
  const eligibility = await ensureVerificationAccess(isCurrent, options);
  if (!eligibility || !isCurrent()) return null;
  if (!eligibility.canStartVerification) {
    throw new Error('Verification isn’t available yet. Please try again.');
  }
  if (eligibility.isVerified) {
    const result = await api.getVerificationStatus();
    if (!isCurrent()) return null;
    if (isUserVerified(result)) return result;
    throw new Error('Your verification status changed. Please refresh and try again.');
  }
  let response;
  try {
    response = await api.startIdentityVerification();
  } catch (error) {
    if (!isCurrent()) return null;
    // A webhook can complete verification between the eligibility query and
    // starting the hosted session. Use the status endpoint, never another check.
    if (!['ALREADY_VERIFIED', 'VERIFICATION_COMPLETE'].includes(error.code)) throw error;
    const result = await api.getVerificationStatus();
    if (!isCurrent()) return null;
    if (isUserVerified(result) || ['processing', 'submitted'].includes(result?.status)) return result;
    throw error;
  }
  const { verificationUrl } = response;
  if (!isCurrent()) return null;
  let url;
  try { url = new URL(verificationUrl); } catch {}
  if (url?.protocol !== 'https:' || url.hostname !== 'verify.stripe.com'
      || url.username || url.password) {
    throw new Error('Couldn’t open a secure verification session. Please try again.');
  }

  const browser = await WebBrowser.openAuthSessionAsync(verificationUrl, RETURN_URL);
  if (!isCurrent()) return null;
  const result = await api.getVerificationStatus();
  if (!isCurrent()) return null;
  if (isUserVerified(result) || ['processing', 'submitted'].includes(result?.status)) return result;
  if (browser.type === 'success') {
    throw new Error('Your verification isn’t complete yet. Please try again.');
  }
  return null;
}
