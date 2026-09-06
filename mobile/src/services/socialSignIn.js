import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

// OAuth client IDs are public identifiers, not credentials. The web ID must
// match GOOGLE_CLIENT_ID on the API; the iOS ID matches the URL scheme.
export const GOOGLE_WEB_CLIENT_ID = '676290787470-if537f9tva31uouasphdak0mtnnm6peo.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = '676290787470-472asl7h2othaifi7p9pj8bfs7ojo234.apps.googleusercontent.com';

export async function googleCredential() {
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
  if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type === 'cancelled') return null;
  const token = result.data?.idToken;
  if (!token) throw new Error('Google couldn’t finish signing you in. Please try again.');
  return token;
}

export async function appleCredential() {
  const state = Crypto.randomUUID();
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    state,
  });
  if (credential.state !== state || !credential.identityToken) {
    throw new Error('Apple couldn’t finish signing you in. Please try again.');
  }
  return credential;
}

export function isSignInCancellation(error) {
  return ['ERR_REQUEST_CANCELED', 'SIGN_IN_CANCELLED', '12501'].includes(String(error?.code));
}
