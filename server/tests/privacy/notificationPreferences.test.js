import { describe, it, expect, vi } from 'vitest';
import { normalizedPreferences, shouldSendPush, preferencePatch } from '../../src/services/notificationPreferences.js';
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
