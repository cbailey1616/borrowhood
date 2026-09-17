import * as WebBrowser from 'expo-web-browser';
import api from './api';
import { isUserVerified } from '../utils/auth';

const RETURN_URL = 'borrowhood://verification-complete';

// Use Stripe's hosted check so the app does not need Stripe's native payment
// dependencies. A browser callback never grants verification by itself.
export async function verifyIdentityInBrowser(isCurrent = () => true) {
  const { verificationUrl } = await api.startIdentityVerification();
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
