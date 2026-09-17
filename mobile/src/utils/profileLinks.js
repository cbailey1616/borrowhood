// This domain is served by our API so both the app association and the browser
// fallback ship together. Profile links contain only a public profile ID.
export const PROFILE_LINK_ORIGIN = 'https://borrowhood-production.up.railway.app';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const profileId = new RegExp(`^${UUID}$`, 'i');
const profileLink = new RegExp(`^(?:https://borrowhood-production\\.up\\.railway\\.app/people/|(?:borrowhood|com\\.borrowhood\\.app)://people/)(${UUID})/?(?:[?#][^\\s]*)?$`, 'i');

export function createProfileLink(id) {
  return typeof id === 'string' && id.length === 36 && profileId.test(id) ? `${PROFILE_LINK_ORIGIN}/people/${id.toLowerCase()}` : null;
}

export function profileIdFromLink(url) {
  if (typeof url !== 'string' || /\s/.test(url)) return null;
  return url.match(profileLink)?.[1].toLowerCase() || null;
}
