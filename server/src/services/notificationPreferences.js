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
// Distinct keys avoid collisions with legacy event-level preferences.
export const GRANULAR_NOTIFICATION_TYPES = {
  incoming_requests: ['borrow_request', 'giveaway_claim'],
  request_approvals: ['request_approved'], request_declines: ['request_declined'],
  cancellations: ['borrow_cancelled'],
  pickup_updates: ['pickup_confirmed', 'giveaway_complete', 'giveaway_pickup_expired'],
  return_updates: ['return_confirmed'], expired_requests: ['giveaway_expired'],
  post_comments: ['listing_comment', 'request_comment'], comment_replies: ['discussion_reply'],
  friend_requests: ['friend_request'], friend_acceptances: ['friend_accepted'],
  neighborhood_requests: ['join_request'], neighborhood_responses: ['join_approved'],
  new_item_requests: ['new_request'], new_service_requests: ['new_request'],
};
export const SOURCE_PREFERENCES = ['source_friends', 'source_neighborhood', 'source_town'];
export const CORE_NOTIFICATION_KEYS = ['new_message', 'post_replies', 'borrow_updates', 'community_updates', 'new_item_requests', 'new_service_requests', 'item_match'];
export const coreSourceKey = (core, source) => `${core}_${source}`;
export function notificationCore(type, data = {}) {
  if (type === 'new_request') return data.requestType === 'service' ? 'new_service_requests'
    : data.requestType === 'item' ? 'new_item_requests' : null;
  return groups[type] || (CORE_NOTIFICATION_KEYS.includes(type) ? type : null);
}

export function audiencePreferences(type, prefs = {}, data = {}) {
  const core = notificationCore(type, data);
  const isDiscovery = ['new_request', 'item_match'].includes(type);
  return Object.fromEntries(SOURCE_PREFERENCES.map(source => [source,
    core && typeof prefs[coreSourceKey(core, source)] === 'boolean'
      ? prefs[coreSourceKey(core, source)] : isDiscovery ? prefs[source] !== false : true]));
}
const granularKey = Object.fromEntries(Object.entries(GRANULAR_NOTIFICATION_TYPES)
  .filter(([key]) => !['new_item_requests', 'new_service_requests'].includes(key))
  .flatMap(([key, types]) => types.map(type => [type, key])));
const legacyEnabled = (type, prefs) => {
  if (typeof prefs[groups[type]] === 'boolean') return prefs[groups[type]];
  return prefs[type] !== false && prefs[legacyGroups[type]] !== false;
};
const settingEnabled = (key, prefs) => typeof prefs[key] === 'boolean' ? prefs[key]
  : GRANULAR_NOTIFICATION_TYPES[key].every(type => legacyEnabled(type, prefs));

export function normalizedPreferences(prefs = {}) {
  const normalized = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...prefs,
    push_enabled: prefs.push_enabled ?? prefs.push ?? true,
    ...Object.fromEntries(Object.keys(GRANULAR_NOTIFICATION_TYPES).map(key => [key, settingEnabled(key, prefs)])),
    ...Object.fromEntries(SOURCE_PREFERENCES.map(key => [key, prefs[key] !== false])),
  };
  // Older clients show an aggregate switch; mixed settings appear off.
  for (const group of ['borrow_updates', 'post_replies', 'community_updates']) {
    normalized[group] = Object.entries(granularKey).filter(([type]) => groups[type] === group)
      .every(([, key]) => normalized[key]);
  }
  for (const core of CORE_NOTIFICATION_KEYS) {
    for (const source of SOURCE_PREFERENCES) {
      const key = coreSourceKey(core, source);
      const discovery = ['new_item_requests', 'new_service_requests', 'item_match'].includes(core);
      normalized[key] = normalized[core] !== false && (prefs[key] ?? (discovery ? prefs[source] !== false : true));
    }
  }
  return normalized;
}
export function shouldSendPush(type, prefs = {}, data = {}) {
  if (['new_rating', 'rating_received', 'referral_reward', 'subscription_expired', 'verification_expiring'].includes(type)) return false;
  if (!(prefs.push_enabled ?? prefs.push ?? true)) return false;
  if (type === 'new_request') {
    if (data.requestType === 'item') return settingEnabled('new_item_requests', prefs);
    if (data.requestType === 'service') return settingEnabled('new_service_requests', prefs);
    // Older producers without a subtype must respect both choices.
    return settingEnabled('new_item_requests', prefs) && settingEnabled('new_service_requests', prefs);
  }
  return granularKey[type] ? settingEnabled(granularKey[type], prefs) : legacyEnabled(type, prefs);
}
export function preferencePatch(prefs) {
  const patch = { ...prefs };
  if (prefs.push_enabled !== undefined) patch.push = prefs.push_enabled;
  else if (prefs.push !== undefined) patch.push_enabled = prefs.push;
  // A switch changed in an older app must still override saved child settings.
  for (const [key, types] of Object.entries(GRANULAR_NOTIFICATION_TYPES)) {
    const changed = types.flatMap(type => [groups[type], type, legacyGroups[type]])
      .filter(parent => parent && typeof prefs[parent] === 'boolean');
    if (changed.length && prefs[key] === undefined) patch[key] = changed.every(parent => prefs[parent]);
  }
  return patch;
}
export const validPreferenceKeys = new Set([...Object.keys(DEFAULT_NOTIFICATION_PREFERENCES),
  ...Object.keys(GRANULAR_NOTIFICATION_TYPES), ...SOURCE_PREFERENCES,
  ...CORE_NOTIFICATION_KEYS.flatMap(core => SOURCE_PREFERENCES.map(source => coreSourceKey(core, source))),
  'email', 'push', 'borrow_request', 'request_response', 'pickup_return', 'new_request', 'payment_updates']);
// Messages already have their own unread count and conversation list. Keep the
// historical rows, but remove duplicate alerts and retired promotion/dispute UI.
export const ACTIVITY_SQL = "type != 'new_message' AND type NOT IN ('new_rating', 'rating_received', 'referral_reward', 'subscription_expired', 'verification_expiring') AND type NOT LIKE 'dispute%'";
