import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { ensureMultipleReactions } from '../../src/services/multipleReactions.js';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({
  query: (sql, params) => state.db.query(sql, params),
  withTransaction: callback => state.db.transaction(callback),
}));
vi.mock('../../src/middleware/auth.js', () => ({ authenticate: (req, _res, next) => { req.user = { id: req.headers['test-user'] }; next(); } }));
vi.mock('../../src/services/contentPolicy.js', () => ({ screenContent: () => (_req, _res, next) => next() }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn(async () => {}) }));
vi.mock('../../src/services/communityChat.js', () => ({ communityConversations: async () => [] }));
vi.mock('../../src/services/listingAccess.js', () => ({ canViewListing: async () => true }));

const a = randomUUID(), b = randomUUID(), outsider = randomUUID();
let app, conversation, root, foreignRoot;
const send = (sender, recipient, data) => request(app).post('/api/messages').set('test-user', sender).send({ recipientId: recipient, ...data });
const read = (sender, params = {}) => request(app).get(`/api/messages/conversations/${conversation}`).set('test-user', sender).query(params);

beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id uuid PRIMARY KEY, first_name text, last_name text, display_name text, profile_photo_url text);
    CREATE TABLE user_blocks(user_id uuid,blocked_id uuid);
    CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user1_id uuid,user2_id uuid,listing_id uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid REFERENCES conversations(id),sender_id uuid,content text,image_url text,
      client_request_id uuid,client_request_hash text,created_at timestamptz DEFAULT now(),deleted_at timestamptz,is_read boolean DEFAULT false);
    CREATE TABLE message_reactions(message_id uuid,user_id uuid,emoji text);
    CREATE UNIQUE INDEX idx_messages_client_request ON messages(sender_id,client_request_id) WHERE client_request_id IS NOT NULL;`);
  await ensureMultipleReactions(state.db,'message_reactions','message_id');
  const migration = await readFile(new URL('../../migrations/023_private_message_threads.sql', import.meta.url), 'utf8');
  await state.db.exec(migration);
  await state.db.exec(migration); // Repeat upgrades must keep existing links.
  for (const [id, name] of [[a, 'Alex'], [b, 'Jamie'], [outsider, 'Other']]) await state.db.query('INSERT INTO users(id,first_name) VALUES($1,$2)', [id,name]);
  const router = (await import('../../src/routes/messages.js')).default;
  app = express(); app.use(express.json()); app.use('/api/messages', router);
  const first = await send(a,b,{ content: 'Can we arrange pickup here?' });
  expect(first.status).toBe(201); conversation = first.body.conversationId; root = first.body.id;
  foreignRoot = (await send(a,outsider,{ content: 'Private other conversation' })).body.id;
});
afterAll(async () => { await state.db?.close(); });

describe('private message threads against isolated PostgreSQL', () => {
  it('advertises threads only once the nullable schema exists', async () => {
    const response = await request(app).get('/api/messages/capabilities').set('test-user',a);
    expect(response.body).toMatchObject({ threadedMessages: true, idempotentMessages: true });
  });
  it('keeps replies out of the main conversation but preserves older flat clients', async () => {
    const reply = await send(b,a,{ content: '10 works for me', parentId: root });
    expect(reply.status).toBe(201); expect(reply.body.parentId).toBe(root);
    const main = await read(a,{ threaded: true });
    expect(main.body.messages.find(m=>m.id===root)).toMatchObject({ replyCount: 1, unreadReplyCount: 1 });
    expect(main.body.messages.some(m=>m.id===reply.body.id)).toBe(false);
    const unread = await state.db.query('SELECT is_read FROM messages WHERE id=$1',[reply.body.id]);
    expect(unread.rows[0].is_read).toBe(false);
    const thread = await read(a,{ threadId: root });
    expect(thread.body.thread.content).toBe('Can we arrange pickup here?');
    expect(thread.body.messages[0].content).toBe('10 works for me');
    expect((await state.db.query('SELECT is_read FROM messages WHERE id=$1',[reply.body.id])).rows[0].is_read).toBe(true);
    expect((await read(a)).body.messages.some(m=>m.id===reply.body.id)).toBe(true);
  });
  it('preserves reactions on the original message in the reply view', async () => {
    await state.db.query('INSERT INTO message_reactions(message_id,user_id,emoji) VALUES($1,$2,$3)',[root,b,'👍']);
    const response = await read(a,{ threadId:root });
    expect(response.body.thread.reactions).toEqual([{ userId:b,emoji:'👍' }]);
  });
  it('keeps multiple emoji on roots and replies and removes only the selected emoji', async () => {
    const child = (await send(a,b,{content:'Reaction test',parentId:root})).body.id;
    for (const message of [root,child]) {
      for (const emoji of ['❤️','😂','❤️']) await request(app).post(`/api/messages/${message}/react`).set('test-user',b).send({emoji}).expect(200);
      const rows = (await state.db.query('SELECT emoji FROM message_reactions WHERE message_id=$1 AND user_id=$2',[message,b])).rows;
      expect(rows.filter(r=>r.emoji==='❤️')).toHaveLength(1);
      expect(rows).toEqual(expect.arrayContaining([{emoji:'❤️'},{emoji:'😂'}]));
      await request(app).delete(`/api/messages/${message}/react`).set('test-user',b).query({emoji:'❤️'}).expect(200);
      expect((await state.db.query('SELECT emoji FROM message_reactions WHERE message_id=$1 AND user_id=$2',[message,b])).rows).toEqual(expect.arrayContaining([{emoji:'😂'}]));
    }
  });
  it('keeps a reply to a reply in the original thread', async () => {
    const parent = await send(a,b,{ content: 'Bring the bits too?', parentId: root });
    const child = await send(b,a,{ content: 'Of course', parentId: parent.body.id });
    expect(child.status).toBe(201);
    expect(child.body).toMatchObject({ parentId: root, replyToId: parent.body.id });
  });
  it('rejects cross-conversation reply targets without revealing their content', async () => {
    const response = await send(b,a,{ content: 'Wrong target', parentId: foreignRoot });
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('Private other conversation');
    expect((await read(b,{ threadId: foreignRoot })).status).toBe(404);
    expect((await read(outsider,{ threadId: root })).status).toBe(404);
  });
  it('retries the same threaded send once and rejects changing its parent', async () => {
    const clientRequestId = randomUUID();
    const data = { content: 'I’ll see you there', parentId: root, clientRequestId };
    const first = await send(a,b,data); const retry = await send(a,b,data);
    expect(first.status).toBe(201); expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ id: first.body.id, parentId: root });
    expect((await send(a,b,{...data,parentId: first.body.id})).status).toBe(409);
  });
  it('opens reply notifications directly in their original thread', async () => {
    const { sendNotification } = await import('../../src/services/notifications.js');
    await send(b,a,{ content: 'Reply notification', parentId: root });
    expect(sendNotification).toHaveBeenLastCalledWith(a, 'new_message', expect.objectContaining({ conversationId: conversation, threadId: root }), expect.any(Object));
  });
  it('keeps replies readable after a deleted original without returning deleted content', async () => {
    await state.db.query('UPDATE messages SET deleted_at=now() WHERE id=$1',[root]);
    const thread = await read(a,{ threadId: root });
    expect(thread.body.thread).toMatchObject({ isDeleted: true, content: null, imageUrl: null });
    expect(thread.body.messages.length).toBeGreaterThan(0);
  });
  it('marks only the fetched reply page read and returns earlier pages', async () => {
    const top = await send(a,b,{content:'Long thread'});
    for (let i=0;i<5;i++) await send(b,a,{content:`Page reply ${i}`,parentId:top.body.id});
    const first = await read(a,{ threadId:top.body.id,limit:2 });
    expect(first.body.messages).toHaveLength(2); expect(first.body.hasMore).toBe(true);
    const unread = await state.db.query('SELECT COUNT(*)::int AS count FROM messages WHERE parent_id=$1 AND is_read=false',[top.body.id]);
    expect(unread.rows[0].count).toBe(3);
    const second = await read(a,{ threadId:top.body.id,limit:2,page:2 });
    expect(second.body.messages).toHaveLength(2);
    expect(second.body.messages.some(m=>first.body.messages.some(old=>old.id===m.id))).toBe(false);
  });
});
