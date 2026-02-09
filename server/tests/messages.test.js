/**
 * Messages Route Tests
 * Tests: send message, conversations list, conversation detail, mark read
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, createTestListing, cleanupTestUser } from './helpers/stripe.js';

let app;
let userA, userB, userC;
let listingId;
const createdUserIds = [];
const createdConversationIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/messages', module: '../../src/routes/messages.js' }
  );

  userA = await createTestUser({ email: `msg-a-${Date.now()}@borrowhood.test`, firstName: 'Msg', lastName: 'UserA' });
  userB = await createTestUser({ email: `msg-b-${Date.now()}@borrowhood.test`, firstName: 'Msg', lastName: 'UserB' });
  userC = await createTestUser({ email: `msg-c-${Date.now()}@borrowhood.test`, firstName: 'Msg', lastName: 'UserC' });
  createdUserIds.push(userA.userId, userB.userId, userC.userId);

  listingId = await createTestListing(userA.userId, {
    title: 'Msg Test Item',
    isFree: true,
    visibility: 'close_friends',
  });
});

afterAll(async () => {
  for (const cid of createdConversationIds) {
    try {
      await query('DELETE FROM messages WHERE conversation_id = $1', [cid]);
      await query('DELETE FROM conversations WHERE id = $1', [cid]);
    } catch (e) { /* */ }
  }
  try {
    await query('DELETE FROM notifications WHERE user_id = ANY($1)', [createdUserIds]);
    await query('DELETE FROM listing_photos WHERE listing_id = $1', [listingId]);
    await query('DELETE FROM listings WHERE id = $1', [listingId]);
  } catch (e) { /* */ }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('POST /api/messages', () => {
  it('should send a message and create conversation', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        recipientId: userB.userId,
        content: 'Hey, can I borrow your item?',
        listingId,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.conversationId).toBeDefined();
    expect(res.body.content).toBe('Hey, can I borrow your item?');
    createdConversationIds.push(res.body.conversationId);

    // Verify notification was created in DB
    const notif = await query(
      "SELECT type FROM notifications WHERE user_id = $1 AND type = 'new_message'",
      [userB.userId]
    );
    expect(notif.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('should reuse existing conversation', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        recipientId: userB.userId,
        content: 'Follow-up message',
        listingId,
      });

    expect(res.status).toBe(201);
    expect(res.body.conversationId).toBe(createdConversationIds[0]);
  });

  it('should reject messaging yourself', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        recipientId: userA.userId,
        content: 'Talking to myself',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('yourself');
  });

  it('should reject empty message content', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        recipientId: userB.userId,
        content: '',
      });

    expect(res.status).toBe(400);
  });

  it('should create conversation without listing context', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        recipientId: userC.userId,
        content: 'General chat',
      });

    expect(res.status).toBe(201);
    createdConversationIds.push(res.body.conversationId);
  });
});

describe('GET /api/messages/conversations', () => {
  it('should list user\'s conversations with last message', async () => {
    const res = await request(app)
      .get('/api/messages/conversations')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const conv = res.body[0];
    expect(conv.id).toBeDefined();
    expect(conv.otherUser).toBeDefined();
    expect(conv.lastMessage).toBeDefined();
    expect(conv.unreadCount).toBeDefined();
  });

  it('should show unread count for recipient', async () => {
    const res = await request(app)
      .get('/api/messages/conversations')
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    const conv = res.body.find(c => c.otherUser.id === userA.userId);
    expect(conv).toBeDefined();
    expect(conv.unreadCount).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/messages/conversations/:id', () => {
  it('should return messages for participant', async () => {
    const convId = createdConversationIds[0];
    const res = await request(app)
      .get(`/api/messages/conversations/${convId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.conversation).toBeDefined();
    expect(res.body.messages).toBeDefined();
    expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
    expect(res.body.messages[0].content).toBeDefined();
  });

  it('should return 404 for non-participant', async () => {
    const convId = createdConversationIds[0]; // A↔B conversation
    const res = await request(app)
      .get(`/api/messages/conversations/${convId}`)
      .set('Authorization', `Bearer ${userC.token}`);

    expect(res.status).toBe(404);
  });

  it('should mark messages as read when viewing', async () => {
    const convId = createdConversationIds[0];
    // userB views the conversation (should mark userA's messages as read)
    await request(app)
      .get(`/api/messages/conversations/${convId}`)
      .set('Authorization', `Bearer ${userB.token}`);

    // Check unread count is now 0
    const unread = await query(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND sender_id = $2 AND is_read = false',
      [convId, userA.userId]
    );
    expect(parseInt(unread.rows[0].count)).toBe(0);
  });
});

describe('POST /api/messages/conversations/:id/read', () => {
  it('should mark all messages as read', async () => {
    // Send a new message from userA to create unread messages
    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        recipientId: userB.userId,
        content: 'Another unread message',
        listingId,
      });

    const convId = createdConversationIds[0];
    const res = await request(app)
      .post(`/api/messages/conversations/${convId}/read`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify all messages are read
    const unread = await query(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false',
      [convId, userB.userId]
    );
    expect(parseInt(unread.rows[0].count)).toBe(0);
  });

  it('should return 404 for non-participant', async () => {
    const convId = createdConversationIds[0];
    const res = await request(app)
      .post(`/api/messages/conversations/${convId}/read`)
      .set('Authorization', `Bearer ${userC.token}`);

    expect(res.status).toBe(404);
  });
});
