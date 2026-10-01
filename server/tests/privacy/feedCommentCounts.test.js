import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args) }));
import { attachFeedCommentCounts } from '../../src/services/feedCommentCounts.js';

const viewer = randomUUID(), author = randomUUID(), blocked = randomUUID();
const listing = randomUUID(), wanted = randomUUID();
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE listing_discussions(id UUID PRIMARY KEY, listing_id UUID, request_id UUID,
    reply_to_id UUID, parent_id UUID, user_id UUID, is_hidden BOOLEAN DEFAULT false);
    CREATE TABLE user_blocks(user_id UUID, blocked_id UUID);`);
  await state.db.query('INSERT INTO user_blocks VALUES($1,$2)', [viewer, blocked]);
  const root = randomUUID(), hiddenRoot = randomUUID(), blockedRoot = randomUUID();
  for (const [id, parent, user, hidden, request] of [
    [root, null, author, false, null],
    [randomUUID(), root, author, false, null],
    [randomUUID(), root, author, true, null],
    [randomUUID(), root, blocked, false, null],
    [hiddenRoot, null, author, true, null],
    [randomUUID(), hiddenRoot, author, false, null],
    [blockedRoot, null, blocked, false, null],
    [randomUUID(), blockedRoot, author, false, null],
    [randomUUID(), null, author, false, wanted],
  ]) await state.db.query('INSERT INTO listing_discussions(id,listing_id,request_id,parent_id,user_id,is_hidden) VALUES($1,$2,$3,$4,$5,$6)',
    [id, request ? null : listing, request, parent, user, hidden]);
}, 15000);
afterAll(async () => { await state.db.close(); });

it('counts visible root comments and replies, excluding hidden and blocked threads', async () => {
  const items = [{ id: listing, type: 'listing' }, { id: wanted, type: 'request' }, { id: randomUUID(), type: 'listing' }];
  await attachFeedCommentCounts(items, viewer);
  expect(items.map(item => item.commentCount)).toEqual([2, 1, 0]);
});

it('does not attach discussion counts to masked or preview-only posts', async () => {
  const items = [{ id: listing, type: 'listing', ownerMasked: true }, { id: wanted, type: 'request', previewOnly: true }];
  await attachFeedCommentCounts(items, viewer);
  expect(items.every(item => !Object.hasOwn(item, 'commentCount'))).toBe(true);
});

it('does not count descendants under a hidden intermediate reply',async()=>{
 const [root]=(await state.db.query('SELECT id FROM listing_discussions WHERE listing_id=$1 AND parent_id IS NULL AND is_hidden=false AND user_id=$2',[listing,author])).rows;
 const child=randomUUID(),grandchild=randomUUID();
 await state.db.query('INSERT INTO listing_discussions(id,listing_id,parent_id,reply_to_id,user_id,is_hidden) VALUES($1,$2,$3,$3,$5,true),($4,$2,$3,$1,$5,false)',[child,listing,root.id,grandchild,author]);
 const items=[{id:listing,type:'listing'}];await attachFeedCommentCounts(items,viewer);
 expect(items[0].commentCount).toBe(2);
});
