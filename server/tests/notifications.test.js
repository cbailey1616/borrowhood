/**
 * Notifications Route Tests
 * Tests: list, badge-count, mark read, read-all, push-token, preferences
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, cleanupTestUser } from './helpers/stripe.js';
import { createTestNotification } from './helpers/fixtures.js';

let app;
let userA, userB;
let notifIds = [];
const createdUserIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/notifications', module: '../../src/routes/notifications.js' },
    { path: '/api/messages', module: '../../src/routes/messages.js' }
  );

  userA = await createTestUser({ email: `notif-a-${Date.now()}@borrowhood.test`, firstName: 'Notif', lastName: 'UserA' });
  userB = await createTestUser({ email: `notif-b-${Date.now()}@borrowhood.test`, firstName: 'Notif', lastName: 'UserB' });
  createdUserIds.push(userA.userId, userB.userId);

  // Create some test notifications
  notifIds.push(await createTestNotification(userA.userId, 'new_message', {
    title: 'New Message',
    body: 'You have a new message from Bob',
    fromUserId: userB.userId,
  }));
  notifIds.push(await createTestNotification(userA.userId, 'borrow_request', {
    title: 'Borrow Request',
    body: 'Bob wants to borrow your drill',
    fromUserId: userB.userId,
  }));
  notifIds.push(await createTestNotification(userA.userId, 'return_confirmed', {
    title: 'Return Complete',
    body: 'Your item has been returned. Tap to view your exchange.',
    fromUserId: userB.userId,
  }));
});

afterAll(async () => {
  try {
    await query('DELETE FROM notifications WHERE user_id = ANY($1)', [createdUserIds]);
  } catch (e) { /* */ }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('GET /api/notifications', () => {
  it('should return user\'s notifications', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toBeDefined();
    expect(res.body.notifications.length).toBeGreaterThanOrEqual(2);
    expect(res.body.unreadCount).toBeGreaterThanOrEqual(2);

    const notif = res.body.notifications[0];
    expect(notif.id).toBeDefined();
    expect(notif.type).toBeDefined();
    expect(notif.title).toBeDefined();
    expect(notif.body).toBeDefined();
    expect(notif.isRead).toBe(false);
  });

  it('should filter to unread only', async () => {
    // Mark one as read first
    await query(
      'UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1',
      [notifIds[0]]
    );

    const res = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    res.body.notifications.forEach(n => {
      expect(n.isRead).toBe(false);
    });

    // Restore
    await query('UPDATE notifications SET is_read = false, read_at = NULL WHERE id = $1', [notifIds[0]]);
  });

  it('should include fromUser details', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userA.token}`);

    const withFrom = res.body.notifications.find(n => n.fromUser !== null);
    expect(withFrom).toBeDefined();
    expect(withFrom.fromUser.firstName).toBeDefined();
  });

  it('should return empty for user with no notifications', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications.length).toBe(0);
    expect(res.body.unreadCount).toBe(0);
  });
});

describe('GET /api/notifications/badge-count', () => {
  it('should return badge counts', async () => {
    const res = await request(app)
      .get('/api/notifications/badge-count')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.messages).toBe('number');
    expect(typeof res.body.notifications).toBe('number');
    expect(typeof res.body.actions).toBe('number');
    expect(typeof res.body.total).toBe('number');
    expect(res.body.notifications).toBeGreaterThanOrEqual(2);
    expect(res.body.total).toBe(res.body.messages + res.body.notifications + res.body.actions);
  });
});

describe('POST /api/notifications/:id/read', () => {
  it('should mark a notification as read', async () => {
    const targetId = notifIds[1];
    const res = await request(app)
      .post(`/api/notifications/${targetId}/read`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify in DB
    const notif = await query('SELECT is_read, read_at FROM notifications WHERE id = $1', [targetId]);
    expect(notif.rows[0].is_read).toBe(true);
    expect(notif.rows[0].read_at).toBeTruthy();
  });

  it('should decrement unread count after marking read', async () => {
    // Get current count
    const before = await request(app)
      .get('/api/notifications/badge-count')
      .set('Authorization', `Bearer ${userA.token}`);

    // Mark another as read
    await request(app)
      .post(`/api/notifications/${notifIds[2]}/read`)
      .set('Authorization', `Bearer ${userA.token}`);

    const after = await request(app)
      .get('/api/notifications/badge-count')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(after.body.notifications).toBeLessThan(before.body.notifications);
  });
});

describe('POST /api/notifications/read-all', () => {
  it('should mark all notifications as read', async () => {
    // Reset all to unread first
    await query('UPDATE notifications SET is_read = false, read_at = NULL WHERE user_id = $1', [userA.userId]);

    const res = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify all are read
    const unread = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [userA.userId]
    );
    expect(parseInt(unread.rows[0].count)).toBe(0);
  });
});

describe('PUT /api/notifications/push-token', () => {
  it('should save push token', async () => {
    const res = await request(app)
      .put('/api/notifications/push-token')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ token: 'ExponentPushToken[test123]' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify in DB
    const user = await query('SELECT push_token FROM users WHERE id = $1', [userA.userId]);
    expect(user.rows[0].push_token).toBe('ExponentPushToken[test123]');
  });

  it('should reject missing token', async () => {
    const res = await request(app)
      .put('/api/notifications/push-token')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Token required');
  });
});

describe('PATCH /api/notifications/preferences', () => {
  it('should update notification preferences', async () => {
    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ email: false, push: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.preferences.email).toBe(false);
    expect(res.body.preferences.push).toBe(true);
  });

  it('should merge with existing preferences', async () => {
    // Update only one field
    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ email: true });

    expect(res.status).toBe(200);
    expect(res.body.preferences.email).toBe(true);
    // push should still be true from previous update
    expect(res.body.preferences.push).toBe(true);
  });
});

describe('Current notification controls', () => {
  it('hides old match alerts and excludes them from the unread badge', async () => {
    const before = await request(app).get('/api/notifications').set('Authorization', `Bearer ${userA.token}`).expect(200);
    const id = await createTestNotification(userA.userId, 'item_match', { title: 'We found a match!' });
    const after = await request(app).get('/api/notifications').set('Authorization', `Bearer ${userA.token}`).expect(200);
    expect(after.body.notifications.some(item => item.id === id)).toBe(false);
    expect(after.body.unreadCount).toBe(before.body.unreadCount);
    const badges = await request(app).get('/api/notifications/badge-count').set('Authorization', `Bearer ${userA.token}`).expect(200);
    expect(badges.body.notifications).toBe(after.body.unreadCount);
  });
  it('corrects a stored return prompt while preserving its read state and identity', async () => {
    const id = await createTestNotification(userA.userId, 'return_confirmed', {
      title: 'Return Complete', body: 'Drill has been returned. Tap to leave a rating for your neighbor.',
    });
    await query('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
    const res = await request(app).get('/api/notifications').set('Authorization', `Bearer ${userA.token}`).expect(200);
    expect(res.body.notifications.find(n => n.id === id)).toMatchObject({
      id, type: 'return_confirmed', isRead: true,
      body: 'Drill has been returned. Tap to view your exchange.',
    });
  });
  it('hides duplicate message alerts and keeps the activity badge consistent', async () => {
    const res = await request(app).get('/api/notifications').set('Authorization', `Bearer ${userA.token}`);
    expect(res.body.notifications.every(n => n.type !== 'new_message')).toBe(true);
    const badges = await request(app).get('/api/notifications/badge-count').set('Authorization', `Bearer ${userA.token}`);
    expect(badges.body.notifications).toBe(res.body.unreadCount);
  });
  it('persists grouped preferences, master push and sound', async () => {
    await request(app).patch('/api/notifications/preferences').set('Authorization', `Bearer ${userA.token}`)
      .send({ new_message: false, borrow_updates: false, push_enabled: false, push_sound: false }).expect(200);
    const res = await request(app).get('/api/notifications/preferences').set('Authorization', `Bearer ${userA.token}`).expect(200);
    expect(res.body).toMatchObject({ new_message: false, borrow_updates: false, push_enabled: false, push_sound: false });
  });
  it('rejects unknown keys and non-boolean toggles', async () => {
    for (const body of [{ new_message: 'false' }, { invalid: true }]) {
      await request(app).patch('/api/notifications/preferences').set('Authorization', `Bearer ${userA.token}`).send(body).expect(400);
    }
  });
  it('uses saved category controls for actual push delivery', async () => {
    const { shouldSendPush } = await import('../src/services/notificationPreferences.js');
    expect(shouldSendPush('request_approved', { borrow_updates: false })).toBe(false);
    expect(shouldSendPush('listing_comment', { post_replies: false })).toBe(false);
    expect(shouldSendPush('friend_request', { community_updates: false })).toBe(false);
    expect(shouldSendPush('new_message', { push_enabled: false })).toBe(false);
    expect(shouldSendPush('new_message', { new_message: true })).toBe(true);
    expect(shouldSendPush('request_approved', { request_response: false })).toBe(false);
    expect(shouldSendPush('rating_received', {})).toBe(false);
    expect(shouldSendPush('new_rating', {})).toBe(false);
  });
});

describe('Granular notification delivery', () => {
  it('persists independent sources and alert types, including changes from older apps', async () => {
    const user = await createTestUser();
    createdUserIds.push(user.userId);
    const patch = body => request(app).patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${user.token}`).send(body).expect(200);
    await patch({ source_town: false, new_service_requests: false, borrow_updates: false });
    await patch({ request_approvals: true });
    let res = await request(app).get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(res.body).toMatchObject({ source_town: false, source_friends: true,
      source_neighborhood: true, new_service_requests: false, new_item_requests: true,
      request_approvals: true, request_declines: false, push_enabled: true });
    res = await patch({ borrow_updates: true });
    expect(res.body.preferences).toMatchObject({ request_approvals: true,
      request_declines: true, source_town: false, new_service_requests: false });
    res = await patch({ borrow_updates: false });
    expect(res.body.preferences.request_approvals).toBe(false);
    await patch({ new_message_source_friends: true, new_message_source_neighborhood: false, new_message_source_town: false });
    res = await request(app).get('/api/notifications/preferences').set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(res.body).toMatchObject({ new_message_source_friends: true, new_message_source_neighborhood: false,
      new_message_source_town: false, new_item_requests_source_neighborhood: true });
  });

  it('uses real relationships to suppress pushes while retaining activity and direct messages', async () => {
    const { sendNotification } = await import('../src/services/notifications.js');
    const recipient = await createTestUser({ city: ' Testville ', state: 'TS' });
    const sender = await createTestUser({ city: 'testville', state: 'ts' });
    createdUserIds.push(recipient.userId, sender.userId);
    const community = await query(`INSERT INTO communities (name, slug, city, state)
      VALUES ('Notification test', $1, 'Testville', 'TS') RETURNING id`, [`notif-${recipient.userId}`]);
    const communityId = community.rows[0].id;
    const push = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ data: { status: 'ok' } }) });
    const setPrefs = prefs => query(`UPDATE users SET push_token = 'ExponentPushToken[test-notifications]',
      notification_preferences = $2::jsonb WHERE id = $1`, [recipient.userId, JSON.stringify(prefs)]);
    const send = async (type = 'new_request', requestType = 'service') => {
      push.mockClear();
      const id = await sendNotification(recipient.userId, type, { requestType, title: 'Help moving' }, { fromUserId: sender.userId });
      expect(id).toBeTruthy();
      const stored = await query('SELECT type, from_user_id FROM notifications WHERE id = $1', [id]);
      expect(stored.rows[0]).toMatchObject({ type, from_user_id: sender.userId });
    };
    try {
      // Same town, with normalized capitalization and whitespace.
      await setPrefs({ source_friends: false, source_neighborhood: false, source_town: true });
      await send();
      expect(push).toHaveBeenCalledTimes(1);
      expect(JSON.parse(push.mock.calls[0][1].body).data).toMatchObject({ type: 'new_request', requestType: 'service' });
      await setPrefs({ source_town: false });
      await send();
      expect(push).not.toHaveBeenCalled();
      // A pending invitation is not a friendship. Accepted friendships count in either direction.
      await query("INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'pending')", [sender.userId, recipient.userId]);
      await send();
      expect(push).not.toHaveBeenCalled();
      await query("UPDATE friendships SET status = 'accepted' WHERE user_id = $1 AND friend_id = $2", [sender.userId, recipient.userId]);
      await send();
      expect(push).toHaveBeenCalledTimes(1);
      await setPrefs({ source_friends: false, source_town: true });
      await send('request_offer');
      expect(push).toHaveBeenCalledTimes(1);
      // After removing the friendship, shared neighborhood takes precedence over town.
      await query('DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2', [sender.userId, recipient.userId]);
      await query('INSERT INTO community_memberships (user_id, community_id) VALUES ($1, $3), ($2, $3)', [sender.userId, recipient.userId, communityId]);
      await setPrefs({ source_neighborhood: true, source_town: false });
      await send('request_offer');
      expect(push).toHaveBeenCalledTimes(1);
      await setPrefs({ source_neighborhood: false, source_town: true });
      await send();
      expect(push).not.toHaveBeenCalled();
      // Subtype switches work independently for the same sender.
      await setPrefs({ new_service_requests: false, new_item_requests: true });
      await send();
      expect(push).not.toHaveBeenCalled();
      await send('new_request', 'item');
      expect(push).toHaveBeenCalledTimes(1);
      await setPrefs({ source_friends: false, source_neighborhood: false, source_town: false });
      await send('new_message');
      expect(push).toHaveBeenCalledTimes(1);
      await setPrefs({ new_message_source_neighborhood: false, new_service_requests_source_neighborhood: true });
      await send('new_message');
      expect(push).toHaveBeenCalledTimes(1);
      await send('new_request', 'service');
      expect(push).toHaveBeenCalledTimes(1);
      await setPrefs({ post_replies_source_neighborhood: false });
      await send('listing_comment');
      expect(push).toHaveBeenCalledTimes(1);
      await setPrefs({ post_replies: false });
      await send('listing_comment');
      expect(push).not.toHaveBeenCalled();
      await setPrefs({ push_enabled: false });
      await send('new_message');
      expect(push).not.toHaveBeenCalled();
    } finally {
      push.mockRestore();
      await query('DELETE FROM communities WHERE id = $1', [communityId]);
    }
  });
});
