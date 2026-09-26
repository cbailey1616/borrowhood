import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
const state = vi.hoisted(() => ({ db: null, maxCandidates: 0 }));
vi.mock('../../src/utils/db.js', () => ({ query: async (...args) => {
  const result = await state.db.query(...args);
  if (/FROM (listings l|item_requests r)/.test(args[0])) state.maxCandidates = Math.max(state.maxCandidates,result.rows.length);
  return result;
} }));
import feed from '../../src/routes/feed.js';
import { ensureFeedWindowSchema, cleanupFeedHistory } from '../../src/services/feedWindows.js';
const owner=randomUUID(),viewer=randomUUID();
const app=express();app.use(express.json());app.use('/feed',feed);
let token;
const get=(params, userToken=token) => request(app).get('/feed').query(params).set('Authorization',`Bearer ${userToken}`);
beforeAll(async()=>{
  vi.stubEnv('JWT_SECRET','isolated-feed-windows');
  token=jwt.sign({userId:viewer},process.env.JWT_SECRET);
  state.db=new PGlite();
  await state.db.exec(await readFile(new URL('../helpers/launch-schema.sql',import.meta.url),'utf8'));
  await state.db.exec(await readFile(new URL('../../migrations/020_exchange_endorsements.sql',import.meta.url),'utf8'));
  await ensureFeedWindowSchema();
  await state.db.query('INSERT INTO users(id) VALUES($1),($2)',[owner,viewer]);
  // Equal microsecond timestamps expose skipped/duplicated keyset boundaries.
  await state.db.query(`INSERT INTO listings(owner_id,title,created_at)
    SELECT $1,'Tool '||n,'2026-01-01 12:00:00.123456+00'::timestamptz+n*INTERVAL '1 microsecond' FROM generate_series(1,225) n`,[owner]);
},15000);
afterAll(async()=>{await state.db.close();vi.unstubAllEnvs();});
it('scrolls beyond a bounded ranking window without duplicates, truncation, or reshuffling',async()=>{
  const session=randomUUID();const ids=[];
  for(let page=1;page<=12;page++){
    const res=await get({session,page,layout:'sections'});
    expect(res.status).toBe(200);
    ids.push(...res.body.items.map(item=>item.id));
    expect(res.body.hasMore).toBe(page<12);
  }
  expect(ids).toHaveLength(225);expect(new Set(ids).size).toBe(225);
  const again=await get({session,layout:'sections'});
  expect(again.body.items.map(item=>item.id)).toEqual(ids.slice(0,20));
  expect(state.maxCandidates).toBeLessThanOrEqual(201);
});
it('rechecks revoked access for a cached window and excludes new posts until refresh',async()=>{
  const session=randomUUID();const first=await get({session,layout:'sections'});
  const hidden=first.body.items[0].id;
  await state.db.query("UPDATE listings SET visibility='private' WHERE id=$1",[hidden]);
  const newId=(await state.db.query("INSERT INTO listings(owner_id,title) VALUES($1,'New tool') RETURNING id",[owner])).rows[0].id;
  const repeat=await get({session,layout:'sections'});
  expect(repeat.status).toBe(200);
  expect(repeat.body.items.map(item=>item.id)).toEqual(first.body.items.slice(1).map(item=>item.id));
  expect(repeat.body.items.some(item=>item.id===newId)).toBe(false);
  const fresh=await get({session:randomUUID(),layout:'sections'});
  expect(fresh.body.items.some(item=>item.id===newId)).toBe(true);
});
it('keeps unverified town previews anonymous through the new paging path',async()=>{
  await state.db.query('UPDATE users SET is_verified=false WHERE id=$1',[viewer]);
  await state.db.query('UPDATE listings SET town_preview_enabled=true WHERE owner_id=$1',[owner]);
  const res=await get({session:randomUUID(),layout:'sections'});
  expect(res.status).toBe(200);expect(res.body.items).toHaveLength(20);
  expect(res.body.items.every(item=>item.previewOnly && item.user.id===null)).toBe(true);
  expect(JSON.stringify(res.body)).not.toContain(owner);
});
it('paginates mixed listings and Wanted posts without losing either type',async()=>{
  await state.db.query('UPDATE users SET is_verified=true WHERE id=$1',[viewer]);
  await state.db.query(`INSERT INTO item_requests(user_id,title,created_at)
    SELECT $1,'Need '||n,'2026-01-01 12:00:00.123456+00'::timestamptz FROM generate_series(1,25)n`,[owner]);
  const session=randomUUID(),seen=[];
  for(let page=1;page<=13;page++){
    const res=await get({session,page});
    expect(res.status).toBe(200);seen.push(...res.body.items.map(item=>`${item.type}:${item.id}`));
    expect(res.body.hasMore).toBe(page<13);
  }
  expect(seen).toHaveLength(250);expect(new Set(seen).size).toBe(250);
  expect(seen.filter(key=>key.startsWith('request:'))).toHaveLength(25);
});
it('keeps the Wanted ribbon stable across windows and cannot leak it through a changed filter',async()=>{
  const session=randomUUID();
  const first=await get({session,layout:'sections'});
  const next=await get({session,layout:'sections',page:11});
  expect(next.status).toBe(200);
  expect(next.body.requests.map(item=>item.id)).toEqual(first.body.requests.map(item=>item.id));
  expect(next.body.requestCount).toBe(25);
  const privateSearch=await get({session,search:'No matching posts'});
  expect(privateSearch.status).toBe(200);expect(privateSearch.body.items).toEqual([]);
});
it('refreshes an expired snapshot and rejects out-of-sequence deep requests',async()=>{
  const session=randomUUID();await get({session});
  await state.db.query("UPDATE feed_windows SET created_at=NOW()-INTERVAL '2 days' WHERE token=$1",[session]);
  expect((await get({session})).status).toBe(200);
  expect((await get({session:randomUUID(),page:11})).status).toBe(409);
});
it('cleans expired ranking data while retaining current snapshots and recent clicks',async()=>{
  const old=randomUUID(),recent=randomUUID(),session=randomUUID();
  await get({session});
  await state.db.query(`INSERT INTO feed_events(user_id,item_type,item_id,seen_at,clicked_at) VALUES
    ($1,'listing',$2,NOW()-INTERVAL '40 days',NULL),
    ($1,'listing',$3,NOW()-INTERVAL '40 days',NOW())`,[viewer,old,recent]);
  await state.db.query(`INSERT INTO feed_sessions(user_id,token,filter_key,item_keys,created_at)
    VALUES($1,$2,'old','[]',NOW()-INTERVAL '2 days')`,[viewer,randomUUID()]);
  await cleanupFeedHistory();
  expect((await state.db.query('SELECT item_id FROM feed_events WHERE user_id=$1',[viewer])).rows).toEqual([{item_id:recent}]);
  expect((await state.db.query('SELECT token FROM feed_sessions')).rows).toHaveLength(0);
  expect((await state.db.query('SELECT token FROM feed_windows WHERE token=$1',[session])).rows).toHaveLength(1);
});
