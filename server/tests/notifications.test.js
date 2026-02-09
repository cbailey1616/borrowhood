/**
 * Notifications Route Tests
 * Tests: list, badge-count, mark read, read-all, push-token, preferences
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  notifIds.push(await createTestNotification(userA.userId, 'rating_received', {
    title: 'New Rating',
    body: 'You received a 5-star rating',
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
    expect(res.body.notifications.length).toBeGreaterThanOrEqual(3);
    expect(res.body.unreadCount).toBeGreaterThanOrEqual(3);

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
    expect(res.body.notifications).toBeGreaterThanOrEqual(3);
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
