import { API_URL } from './config';

// A signed download URL is an access credential, not the identity of its photo.
// Only our API can supply these opaque, account-scoped cache identifiers.
export function imageIdentity(uri) {
  if (typeof uri !== 'string' || !uri.startsWith(`${API_URL}/private-photos/`)) return uri;
  const match = /[?&]photo=([a-f0-9]{64})(?:&|$)/.exec(uri);
  return match ? `${API_URL}/private-photos/cache/${match[1]}` : uri;
}
