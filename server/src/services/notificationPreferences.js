// One contract for the settings screen and actual push delivery.
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  push_enabled: true, push_sound: true, new_message: true, borrow_updates: true,
  return_reminder: true, post_replies: true, community_updates: true, item_match: true,
};
const groups = {
  borrow_request: 'borrow_updates', giveaway_claim: 'borrow_updates', request_approved: 'borrow_updates',
  request_declined: 'borrow_updates', borrow_cancelled: 'borrow_updates', pickup_confirmed: 'borrow_updates',
  return_confirmed: 'borrow_updates', giveaway_complete: 'borrow_updates', giveaway_expired: 'borrow_updates',
  giveaway_pickup_expired: 'borrow_updates', listing_comment: 'post_replies', request_comment: 'post_replies',
  discussion_reply: 'post_replies', friend_request: 'community_updates', friend_accepted: 'community_updates',
  join_request: 'community_updates', join_approved: 'community_updates',
};
const legacyGroups = { request_approved: 'request_response', request_declined: 'request_response',
  pickup_confirmed: 'pickup_return', return_confirmed: 'pickup_return' };
export function normalizedPreferences(prefs = {}) {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...prefs,
    push_enabled: prefs.push_enabled ?? prefs.push ?? true,
    borrow_updates: prefs.borrow_updates ?? !['borrow_request','request_response','pickup_return'].some(key => prefs[key] === false),
  };
}
export function shouldSendPush(type, prefs = {}) {
  if (['new_rating', 'rating_received', 'referral_reward', 'subscription_expired', 'verification_expiring'].includes(type)) return false;
  if (!(prefs.push_enabled ?? prefs.push ?? true)) return false;
  const group = groups[type];
  if (group && typeof prefs[group] === 'boolean') return prefs[group];
  return prefs[type] !== false && prefs[legacyGroups[type]] !== false;
}
export const validPreferenceKeys = new Set([...Object.keys(DEFAULT_NOTIFICATION_PREFERENCES),
  'email', 'push', 'borrow_request', 'request_response', 'pickup_return', 'new_request', 'payment_updates']);
// Messages already have their own unread count and conversation list. Keep the
// historical rows, but remove duplicate alerts and retired promotion/dispute UI.
export const ACTIVITY_SQL = "type != 'new_message' AND type NOT IN ('new_rating', 'rating_received', 'referral_reward', 'subscription_expired', 'verification_expiring') AND type NOT LIKE 'dispute%'";
