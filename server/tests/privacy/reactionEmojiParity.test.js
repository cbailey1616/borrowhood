import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { REACTION_OPTIONS } from '../../../mobile/src/utils/reactions.js';

const state = vi.hoisted(() => ({ db: null, allowed: true }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/middleware/auth.js', () => ({ authenticate: (req, res, next) => {
  if (!req.headers['x-user']) return res.sendStatus(401);
  req.user = { id: req.headers['x-user'] }; next();
} }));
vi.mock('../../src/services/listingAccess.js', () => ({ canViewListing: async () => state.allowed, canViewRequest: async () => state.allowed }));
vi.mock('../../src/services/discussionNotifications.js', () => ({ getDiscussionThread: async () => state.allowed ? {} : null }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn() }));
import messageRoutes from '../../src/routes/messages.js';
import communityRoutes from '../../src/routes/communityChat.js';
import { ensureCommunityChatSchema } from '../../src/services/communityChat.js';
import { REACTION_EMOJIS, ensureReactionEmojiSchema } from '../../src/services/reactionEmojiSchema.js';
import { DISCUSSION_EMOJIS, ensureDiscussionReactionSchema, discussionReaction } from '../../src/services/publicReactions.js';

const a = randomUUID(), b = randomUUID(), outsider = randomUUID();
const group = randomUUID(), conversation = randomUUID(), privateMessage = randomUUID(), publicComment = randomUUID(), item = randomUUID();
let app, neighborhoodMessage;
const post = (path, emoji, user = a) => request(app).post(path).set('x-user', user).send({ emoji });
const paths = () => [`/messages/${privateMessage}/react`, `/communities/${group}/chat/${neighborhoodMessage}/react`, `/comments/${item}/${publicComment}/react`];
const tableRows = async table => (await state.db.query(`SELECT user_id, emoji FROM ${table}`)).rows;

beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, first_name TEXT, display_name TEXT, profile_photo_url TEXT);
    CREATE TABLE conversations(id UUID PRIMARY KEY, user1_id UUID, user2_id UUID);
    CREATE TABLE messages(id UUID PRIMARY KEY, conversation_id UUID REFERENCES conversations(id), sender_id UUID, content TEXT);
    CREATE TABLE message_reactions(message_id UUID REFERENCES messages(id), user_id UUID REFERENCES users(id),
      emoji TEXT CHECK(emoji IN ('👍','❤️','😂','😮','😢','👎')), PRIMARY KEY(message_id,user_id));
    CREATE TABLE listing_discussions(id UUID PRIMARY KEY, parent_id UUID);
    CREATE TABLE communities(id UUID PRIMARY KEY,name TEXT,banner_url TEXT,is_active BOOLEAN DEFAULT true);
    CREATE TABLE community_memberships(community_id UUID REFERENCES communities(id),user_id UUID REFERENCES users(id),
      role TEXT DEFAULT 'member',joined_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(community_id,user_id));
    CREATE TABLE user_blocks(user_id UUID,blocked_id UUID);`);
  await ensureCommunityChatSchema(); await ensureDiscussionReactionSchema();
  for (const id of [a,b,outsider]) await state.db.query('INSERT INTO users(id) VALUES($1)', [id]);
  await state.db.query('INSERT INTO conversations VALUES($1,$2,$3)', [conversation,a,b]);
  await state.db.query("INSERT INTO messages VALUES($1,$2,$3,'Pickup at 10?')", [privateMessage,conversation,b]);
  await state.db.query('INSERT INTO listing_discussions(id) VALUES($1)', [publicComment]);
  await state.db.query("INSERT INTO communities(id,name) VALUES($1,'Maple')", [group]);
  await state.db.query('INSERT INTO community_memberships(community_id,user_id) VALUES($1,$2),($1,$3)', [group,a,b]);
  neighborhoodMessage = (await state.db.query("INSERT INTO community_chat_messages(community_id,sender_id,content,client_request_id) VALUES($1,$2,'All set!', $3) RETURNING id", [group,b,randomUUID()])).rows[0].id;
  app = express(); app.use(express.json()); app.use('/messages', messageRoutes);
  app.use('/communities/:id/chat', communityRoutes);
  app.post('/comments/:listingId/:postId/react', (req,_res,next) => { req.user={id:req.headers['x-user']}; next(); }, discussionReaction('listing'));
}, 20000);
beforeEach(async () => { state.allowed=true; await state.db.exec('TRUNCATE message_reactions,community_chat_reactions,discussion_reactions,user_blocks'); });
afterAll(async () => state.db.close());

it('keeps mobile, public comments, private messages, and neighborhood chat on one emoji set', async () => {
  expect(REACTION_OPTIONS.map(option => option.emoji)).toEqual(REACTION_EMOJIS);
  expect(DISCUSSION_EMOJIS).toBe(REACTION_EMOJIS);
  expect(REACTION_EMOJIS).toHaveLength(19);
  for (const emoji of REACTION_EMOJIS) for (const path of paths()) {
    await post(path, emoji).expect(200);
  }
  // Expanded availability does not change existing private/chat selection limits.
  for (const table of ['message_reactions', 'community_chat_reactions']) expect(await tableRows(table)).toEqual([{ user_id:a, emoji:'👎' }]);
  expect(await tableRows('discussion_reactions')).toHaveLength(19);
});

it('rejects unsupported emojis before writing and retains access controls', async () => {
  for (const path of paths()) await post(path, 'not-an-emoji').expect(400);
  await post(paths()[0], '🔥', outsider).expect(404);
  await post(paths()[1], '🔥', outsider).expect(403);
  state.allowed=false; await post(paths()[2], '🔥').expect(404);
  for (const table of ['message_reactions','community_chat_reactions','discussion_reactions']) expect(await tableRows(table)).toHaveLength(0);
});

it('expands legacy checks idempotently without removing reactions or changing uniqueness', async () => {
  const legacy = new PGlite();
  try {
    await legacy.exec(`CREATE TABLE message_reactions(message_id UUID,user_id UUID,emoji TEXT,PRIMARY KEY(message_id,user_id));
      CREATE TABLE community_chat_reactions(message_id UUID,user_id UUID,emoji TEXT CHECK(emoji IN ('👍','❤️','😂','😮','😢','👎')),PRIMARY KEY(message_id,user_id));`);
    // Historical custom data also survives an upgrade on a table without a check.
    await legacy.query("INSERT INTO message_reactions VALUES($1,$2,'legacy-custom')", [privateMessage,a]);
    await legacy.query("INSERT INTO community_chat_reactions VALUES($1,$2,'❤️')", [neighborhoodMessage,a]);
    await ensureReactionEmojiSchema(legacy); await ensureReactionEmojiSchema(legacy);
    expect((await legacy.query('SELECT emoji FROM message_reactions')).rows).toEqual([{emoji:'legacy-custom'}]);
    expect((await legacy.query('SELECT emoji FROM community_chat_reactions')).rows).toEqual([{emoji:'❤️'}]);
    for (const table of ['message_reactions','community_chat_reactions']) {
      for (const emoji of REACTION_EMOJIS) await legacy.query(`INSERT INTO ${table} VALUES($1,$2,$3)`,[randomUUID(),b,emoji]);
      await expect(legacy.query(`INSERT INTO ${table} VALUES($1,$2,$3)`,[randomUUID(),b,'unknown'])).rejects.toThrow(/check constraint/);
      await expect(legacy.query(`INSERT INTO ${table} VALUES($1,$2,'👍')`, [table==='message_reactions' ? privateMessage : neighborhoodMessage,a])).rejects.toThrow(/duplicate key/);
    }
  } finally { await legacy.close(); }
}, 20000);
