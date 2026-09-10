import { describe, it, expect, vi } from 'vitest';
import { normalizedPreferences, shouldSendPush, preferencePatch, audiencePreferences, validPreferenceKeys } from '../../src/services/notificationPreferences.js';
import { notificationAudienceAllowsPush } from '../../src/services/notificationAudience.js';

describe('granular push preferences', () => {
  it('inherits existing category and legacy mutes without silencing unrelated alerts', () => {
    const prefs = normalizedPreferences({ borrow_updates: false, post_replies: false, community_updates: false, new_request: false });
    for (const key of ['incoming_requests', 'request_approvals', 'request_declines', 'cancellations', 'pickup_updates', 'return_updates', 'expired_requests', 'post_comments', 'comment_replies', 'friend_requests', 'friend_acceptances', 'neighborhood_requests', 'neighborhood_responses', 'new_item_requests', 'new_service_requests']) expect(prefs[key]).toBe(false);
    expect(prefs.new_message).toBe(true);
    expect(normalizedPreferences({ request_response: false }).request_approvals).toBe(false);
    expect(normalizedPreferences({ pickup_return: false }).return_updates).toBe(false);
  });
  it('lets someone enable one child while keeping the rest of a muted group off', () => {
    const prefs = { borrow_updates: false, request_approvals: true };
    expect(shouldSendPush('request_approved', prefs)).toBe(true);
    expect(shouldSendPush('request_declined', prefs)).toBe(false);
    expect(shouldSendPush('borrow_request', prefs)).toBe(false);
    expect(normalizedPreferences(prefs).borrow_updates).toBe(false);
  });
  it('separates item and service alerts without changing the navigation event type', () => {
    const prefs = { new_item_requests: false, new_service_requests: true };
    expect(shouldSendPush('new_request', prefs, { requestType: 'item' })).toBe(false);
    expect(shouldSendPush('new_request', prefs, { requestType: 'service' })).toBe(true);
    expect(shouldSendPush('new_request', prefs)).toBe(false);
    expect(shouldSendPush('new_request', { new_request: false }, { requestType: 'service' })).toBe(false);
  });
  it('keeps the master switch and retired-alert suppression authoritative', () => {
    expect(shouldSendPush('new_message', { push_enabled: false, new_message: true })).toBe(false);
    expect(shouldSendPush('request_approved', { push: false, request_approvals: true })).toBe(false);
    expect(shouldSendPush('new_rating', { new_rating: true })).toBe(false);
    expect(shouldSendPush('item_match', { item_match: true })).toBe(false);
    expect(normalizedPreferences({ item_match: true, item_match_source_friends: true })).toMatchObject({ item_match: false, item_match_source_friends: false });
    expect(shouldSendPush('request_offer', { post_replies: false })).toBe(false);
    expect(shouldSendPush('request_offer', { post_replies: true })).toBe(true);
  });
  it('honors a later group toggle from an older app after granular choices were saved', () => {
    const original = { request_approvals: true, request_declines: false, new_service_requests: false };
    const muted = { ...original, ...preferencePatch({ borrow_updates: false }) };
    expect(shouldSendPush('request_approved', muted)).toBe(false);
    const enabled = { ...muted, ...preferencePatch({ borrow_updates: true }) };
    expect(shouldSendPush('request_declined', enabled)).toBe(true);
    expect(enabled.new_service_requests).toBe(false);
    expect(preferencePatch({ new_request: false })).toMatchObject({ new_item_requests: false, new_service_requests: false });
    expect(preferencePatch({ push_enabled: false })).toMatchObject({ push: false });
  });
  it('separates comments from replies and friend requests from neighborhood approvals', () => {
    const prefs = { post_comments: false, comment_replies: true, friend_requests: false, neighborhood_responses: true };
    expect(shouldSendPush('listing_comment', prefs)).toBe(false);
    expect(shouldSendPush('request_comment', prefs)).toBe(false);
    expect(shouldSendPush('discussion_reply', prefs)).toBe(true);
    expect(shouldSendPush('friend_request', prefs)).toBe(false);
    expect(shouldSendPush('join_approved', prefs)).toBe(true);
  });
});

describe('notification source choices', () => {
  it.each([
    [{ is_friend: true, is_neighbor: true, is_town: true }, { source_friends: true, source_neighborhood: false, source_town: false }, true],
    [{ is_friend: true, is_neighbor: true, is_town: true }, { source_friends: false }, false],
    [{ is_neighbor: true, is_town: true }, { source_neighborhood: true, source_town: false }, true],
    [{ is_neighbor: true, is_town: true }, { source_neighborhood: false }, false],
    [{ is_town: true }, { source_town: false }, false],
    [{ is_town: true }, { source_friends: false, source_town: true }, true],
    [{}, { source_town: false }, false],
  ])('uses trusted closest-connection information: %j %j', async (relationship, prefs, allowed) => {
    const query = vi.fn().mockResolvedValue({ rows: [relationship] });
    expect(await notificationAudienceAllowsPush(query, 'recipient', 'sender', prefs)).toBe(allowed);
    expect(query).toHaveBeenCalledWith(expect.any(String), ['recipient', 'sender']);
  });
  it('preserves default delivery and avoids unnecessary relationship lookups', async () => {
    const query = vi.fn();
    expect(await notificationAudienceAllowsPush(query, 'recipient', 'sender', {})).toBe(true);
    expect(await notificationAudienceAllowsPush(query, 'recipient', 'sender', { source_friends: false, source_neighborhood: false, source_town: false })).toBe(false);
    expect(await notificationAudienceAllowsPush(query, 'recipient', null, { source_town: false })).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});


describe('core notification audiences', () => {
  it('inherits legacy mutes and limits old global sources to discovery', () => {
    const prefs = normalizedPreferences({ borrow_updates: false, source_town: false });
    expect(prefs.borrow_updates_source_friends).toBe(false);
    expect(prefs.new_service_requests_source_town).toBe(false);
    expect(prefs.new_message_source_town).toBe(true);
    expect(audiencePreferences('new_message', { source_town: false }).source_town).toBe(true);
  });
  it('limits audience choices to new item and service requests', async () => {
    const prefs = { new_message_source_friends: false, new_service_requests_source_friends: true };
    const query = vi.fn().mockResolvedValue({ rows: [{ is_friend: true, is_neighbor: true, is_town: true }] });
    expect(await notificationAudienceAllowsPush(query, 'recipient', 'sender', audiencePreferences('new_message', prefs))).toBe(true);
    expect(await notificationAudienceAllowsPush(query, 'recipient', 'sender', audiencePreferences('new_request', prefs, { requestType: 'service' }))).toBe(true);
    expect(audiencePreferences('return_reminder', prefs)).toEqual({ source_friends: true, source_neighborhood: true, source_town: true });
  });
  it('enables only one source of previously muted service requests', () => {
    const prefs = { new_service_requests: false, ...preferencePatch({ new_service_requests: true,
      new_service_requests_source_friends: true, new_service_requests_source_neighborhood: false, new_service_requests_source_town: false }) };
    expect(shouldSendPush('new_request', prefs, { requestType: 'service' })).toBe(true);
    expect(audiencePreferences('new_request', prefs, { requestType: 'service' })).toEqual({ source_friends: true, source_neighborhood: false, source_town: false });
    expect(normalizedPreferences(prefs).new_service_requests_source_town).toBe(false);
    expect(validPreferenceKeys.has('new_service_requests_source_town')).toBe(true);
    expect(validPreferenceKeys.has('arbitrary_source_town')).toBe(false);
  });
  it('preserves fully muted activity and lets a simple switch enable it again', () => {
    const muted = { new_message_source_friends: false, new_message_source_neighborhood: false, new_message_source_town: false };
    expect(normalizedPreferences(muted).new_message).toBe(false);
    expect(shouldSendPush('new_message', muted)).toBe(false);
    const enabled = { ...muted, ...preferencePatch({ new_message: true }) };
    expect(normalizedPreferences(enabled).new_message).toBe(true);
    expect(shouldSendPush('new_message', enabled)).toBe(true);
    expect(audiencePreferences('new_message', enabled)).toEqual({ source_friends: true, source_neighborhood: true, source_town: true });
  });
});
