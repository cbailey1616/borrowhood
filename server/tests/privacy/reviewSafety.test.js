import { ensureDiscussionReactionSchema } from '../../src/services/publicReactions.js';
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/middleware/auth.js', () => ({ authenticate: (req,res,next) => {
  if (!req.headers['x-user']) return res.sendStatus(401); req.user={ id:req.headers['x-user'] }; next();
} }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn() }));
import { resolveReportContent } from '../../src/services/contentReports.js';
import safety from '../../src/routes/safety.js';
import discussions from '../../src/routes/discussions.js';
import requestDiscussions from '../../src/routes/requestDiscussions.js';
import { ensureSafetyReviewSchema, reviewSafetyReport } from '../../src/services/safetyReview.js';
import { containsProhibitedText, screenContent } from '../../src/services/contentPolicy.js';
const owner=randomUUID(), viewer=randomUUID(), blocked=randomUUID(), item=randomUUID(), wanted=randomUUID(), root=randomUUID(), hiddenRoot=randomUUID(), reply=randomUUID(), channel=randomUUID();
const app=express(); app.use(express.json()); app.use('/safety',safety); app.use('/listings',discussions); app.use('/requests',requestDiscussions);
const call=(method,path,user=viewer) => request(app)[method](path).set('x-user',user);
beforeAll(async () => {
  state.db=new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, city TEXT DEFAULT 'Upton', state TEXT DEFAULT 'MA', is_verified BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending', first_name TEXT DEFAULT 'Neighbor', last_name TEXT, display_name TEXT, profile_photo_url TEXT);
    CREATE TABLE user_blocks(user_id UUID,blocked_id UUID,PRIMARY KEY(user_id,blocked_id));
    CREATE TABLE listings(id UUID PRIMARY KEY, owner_id UUID, title TEXT DEFAULT 'Ladder',description TEXT DEFAULT 'Borrow me',visibility TEXT DEFAULT 'town',
      community_id UUID,circle_id UUID,status TEXT DEFAULT 'active',listing_type TEXT DEFAULT 'lend',privacy_version INT DEFAULT 1,town_preview_enabled BOOLEAN DEFAULT true,is_available BOOLEAN DEFAULT true);
    CREATE TABLE listing_photos(listing_id UUID,url TEXT,sort_order INT);
    CREATE TABLE item_requests(id UUID PRIMARY KEY,user_id UUID,title TEXT DEFAULT 'Wanted drill',description TEXT,photo_url TEXT,visibility TEXT DEFAULT 'town',community_id UUID,
      status TEXT DEFAULT 'open',expires_at TIMESTAMPTZ,needed_until DATE,time_zone TEXT DEFAULT 'UTC',town_preview_enabled BOOLEAN DEFAULT true);
    CREATE TABLE friendships(user_id UUID,friend_id UUID,status TEXT);
    CREATE TABLE community_memberships(community_id UUID,user_id UUID,joined_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE communities(id UUID PRIMARY KEY,is_active BOOLEAN DEFAULT true);
    CREATE TABLE community_chat_messages(id UUID PRIMARY KEY,community_id UUID,sender_id UUID,content TEXT,parent_id UUID,created_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ);
    CREATE TABLE lending_circle_members(circle_id UUID,user_id UUID,status TEXT);
    CREATE TABLE listing_shares(listing_id UUID,user_id UUID,request_id UUID,revoked_at TIMESTAMPTZ,expires_at TIMESTAMPTZ);
    CREATE TABLE borrow_transactions(listing_id UUID,borrower_id UUID,status TEXT);
    CREATE TABLE listing_discussions(id UUID PRIMARY KEY,listing_id UUID,request_id UUID,user_id UUID,parent_id UUID,content TEXT DEFAULT 'Comment',
      reply_count INT DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),is_hidden BOOLEAN DEFAULT false,hidden_by UUID,hidden_at TIMESTAMPTZ);
    CREATE TABLE safety_reports(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),reporter_id UUID REFERENCES users(id),reported_id UUID REFERENCES users(id),reason TEXT,created_at TIMESTAMPTZ DEFAULT NOW());`);
  await ensureSafetyReviewSchema();
  await ensureDiscussionReactionSchema();
},20000);
afterAll(async()=>state.db.close());
beforeEach(async()=>{
  await state.db.exec('TRUNCATE users,listings,item_requests,listing_discussions,user_blocks,safety_reports,listing_photos,community_memberships,community_chat_messages,communities CASCADE');
  await state.db.query('INSERT INTO users(id) VALUES($1),($2),($3)',[owner,viewer,blocked]);
  await state.db.query('INSERT INTO listings(id,owner_id) VALUES($1,$2)',[item,owner]);
  await state.db.query('INSERT INTO item_requests(id,user_id) VALUES($1,$2)',[wanted,owner]);
});
it('lets an unverified town neighbor report a preview without exposing author identity',async()=>{
  const res=await call('post',`/safety/content/listing/${item}/report`).send({reason:'Inappropriate content'});
  expect(res.status).toBe(200); expect(res.body).toEqual({ok:true}); expect(JSON.stringify(res.body)).not.toContain(owner);
  const [r]=(await state.db.query('SELECT * FROM safety_reports')).rows;
  expect(r).toMatchObject({reported_id:owner,reporter_id:viewer,content_id:item,content_type:'listing'});
  expect(r.content_snapshot.title).toBe('Ladder');
});
it('allows masked-author blocking without returning identity',async()=>{
  const res=await call('post',`/safety/content/listing/${item}/block`).send({});
  expect(res.status).toBe(200);expect(res.body).toEqual({ok:true});
  expect((await state.db.query('SELECT * FROM user_blocks')).rows).toEqual([{user_id:viewer,blocked_id:owner}]);
});
it.each(['other-town','private','self','missing'])('does not allow guessed reports: %s',async mode=>{
  if(mode==='other-town')await state.db.query("UPDATE users SET city='Boston' WHERE id=$1",[viewer]);
  if(mode==='private')await state.db.query("UPDATE listings SET visibility='private'");
  const res=await call('post',`/safety/content/listing/${mode==='missing'?randomUUID():item}/report`,mode==='self'?owner:viewer).send({reason:'Harassment'});
  expect(res.status).toBe(404);expect((await state.db.query('SELECT * FROM safety_reports')).rows).toHaveLength(0);
});
it('removes the reported post and its photos without deleting exchange records',async()=>{
  await state.db.query("INSERT INTO listing_photos VALUES($1,'private-photo',0)",[item]);
  await call('post',`/safety/content/listing/${item}/report`).send({reason:'Inappropriate content'}).expect(200);
  const [report]=(await state.db.query('SELECT * FROM safety_reports')).rows;
  await reviewSafetyReport(viewer,report.id,{action:'remove_content',note:'Photo violates community rules.',version:0});
  const [row]=(await state.db.query('SELECT * FROM listings')).rows;
  expect(row.status).toBe('deleted');expect(row.moderation_removed_at).toBeTruthy();
  expect((await state.db.query('SELECT * FROM listing_photos')).rows).toHaveLength(0);
  expect((await state.db.query('SELECT content_snapshot FROM safety_reports')).rows[0].content_snapshot.photos).toEqual(['private-photo']);
});
it('refuses reports of neighborhood messages predating membership or after removal',async()=>{
  await state.db.query('INSERT INTO communities(id) VALUES($1)',[channel]);
  await state.db.query('INSERT INTO community_memberships(community_id,user_id) VALUES($1,$2)',[channel,viewer]);
  await state.db.query("INSERT INTO community_chat_messages(id,community_id,sender_id,content,created_at) VALUES($1,$2,$3,'Old message',NOW()-INTERVAL '1 day')",[reply,channel,owner]);
  await call('post',`/safety/content/community_message/${reply}/report`).send({reason:'Harassment'}).expect(404);
  await state.db.query('UPDATE community_chat_messages SET created_at=NOW()');
  await call('post',`/safety/content/community_message/${reply}/report`).send({reason:'Harassment'}).expect(200);
  await state.db.exec('DELETE FROM community_memberships');
  await call('post',`/safety/content/community_message/${reply}/report`).send({reason:'Harassment'}).expect(404);
});
it.each(['listing','request'])('filters blocked %s comments, reply counts, direct links, and root access in both directions',async kind=>{
  await state.db.query('UPDATE users SET is_verified=true WHERE id=$1',[viewer]);
  const col=kind==='listing'?'listing_id':'request_id', id=kind==='listing'?item:wanted, base=`/${kind==='listing'?'listings':'requests'}/${id}/discussions`;
  await state.db.query(`INSERT INTO listing_discussions(id,${col},user_id) VALUES($1,$2,$3),($4,$2,$5)`,[root,id,owner,hiddenRoot,blocked]);
  await state.db.query(`INSERT INTO listing_discussions(id,${col},user_id,parent_id) VALUES($1,$2,$3,$4)`,[reply,id,blocked,root]);
  for(const reverse of [false,true]) {
    await state.db.exec('DELETE FROM user_blocks');
    await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',reverse?[blocked,viewer]:[viewer,blocked]);
    const res=await call('get',base).expect(200);
    expect(res.body.total).toBe(1);expect(res.body.posts).toHaveLength(1);expect(res.body.posts[0].replyCount).toBe(0);
    expect((await call('get',`${base}/${root}/replies`).expect(200)).body.replies).toEqual([]);
    await call('get',`${base}/${reply}`).expect(404);await call('get',`${base}/${hiddenRoot}`).expect(404);
    await call('post',base).send({content:'Hello',parentId:hiddenRoot}).expect(404);
  }
});
it.each(['listing','request'])('blocks abusive %s replies before publication',async kind=>{
  const base=`/${kind==='listing'?'listings':'requests'}/${kind==='listing'?item:wanted}/discussions`;
  const res=await call('post',base).send({content:'go kill yourself'}).expect(422);
  expect(res.body.code).toBe('CONTENT_NOT_ALLOWED');expect((await state.db.query('SELECT * FROM listing_discussions')).rows).toHaveLength(0);
});
it('normalizes hidden characters and punctuation while allowing normal neighborhood language',()=>{
  for(const text of ['go kill yourself','child p.o.r.n','p\u200bornography'])expect(containsProhibitedText(text)).toBe(true);
  for(const text of ['Can I borrow a screwdriver?','Pest control supplies','Scunthorpe garden tools','The weed trimmer is available'])expect(containsProhibitedText(text)).toBe(false);
});
it('screens edits and profile text as well as new posts, without treating passwords as content',async()=>{
  const local=express();local.use(express.json(),screenContent());local.patch('/',(req,res)=>res.json({ok:true}));
  await request(local).patch('/').send({description:'go kill yourself'}).expect(422);
  await request(local).patch('/').send({bio:'child pornography'}).expect(422);
  await request(local).patch('/').send({password:'go kill yourself'}).expect(200);
});

it.each(['listing','request'])('persists, changes and removes reactions on %s roots and replies without crossing visibility',async kind=>{
 await state.db.query('UPDATE users SET is_verified=true WHERE id=$1',[viewer]);
 const col=kind==='listing'?'listing_id':'request_id',id=kind==='listing'?item:wanted,base=`/${kind==='listing'?'listings':'requests'}/${id}/discussions`;
 await state.db.query(`INSERT INTO listing_discussions(id,${col},user_id,parent_id) VALUES($1,$2,$3,NULL),($4,$2,$3,$1)`,[root,id,owner,reply]);
 for(const post of [root,reply]) {
  await call('post',`${base}/${post}/react`).send({emoji:'👍'}).expect(200);
  await call('post',`${base}/${post}/react`).send({emoji:'❤️'}).expect(200);
 }
 expect((await call('get',base)).body.posts[0].reactions).toEqual(expect.arrayContaining([{userId:viewer,emoji:'❤️'},{userId:viewer,emoji:'👍'}]));
 expect((await call('get',`${base}/${root}/replies`)).body.replies[0].reactions).toEqual(expect.arrayContaining([{userId:viewer,emoji:'❤️'},{userId:viewer,emoji:'👍'}]));
 expect((await call('get',`${base}/${reply}`)).body.post.reactions).toEqual(expect.arrayContaining([{userId:viewer,emoji:'❤️'},{userId:viewer,emoji:'👍'}]));
 await call('post',`${base}/${reply}/react`).send({emoji:'invalid'}).expect(400);
 await call('post',`${base}/${reply}/react`).send({emoji:'🔥'}).expect(200);
 await call('post',`${base}/${reply}/react`).send({emoji:'🔥'}).expect(200);
 await call('delete',`${base}/${reply}/react?emoji=${encodeURIComponent('👍')}`).expect(200);
 expect((await call('get',`${base}/${root}/replies`)).body.replies[0].reactions).toEqual(expect.arrayContaining([{userId:viewer,emoji:'❤️'},{userId:viewer,emoji:'🔥'}]));
 expect((await state.db.query('SELECT emoji FROM discussion_reactions WHERE discussion_id=$1',[reply])).rows).toHaveLength(2);
 await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[owner,blocked]);
 await call('post',`${base}/${reply}/react`,blocked).send({emoji:'❤️'}).expect(404);
 await state.db.exec('DELETE FROM user_blocks');
 await call('delete',`${base}/${reply}/react`).expect(200);
 expect((await call('get',`${base}/${root}/replies`)).body.replies[0].reactions).toEqual([]);
 await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[viewer,owner]);
 await call('post',`${base}/${root}/react`).send({emoji:'👍'}).expect(404);
 await state.db.exec('DELETE FROM user_blocks');
 await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[owner,viewer]);
 expect((await call('get',base,owner)).body.posts[0].reactions).toEqual([]);
 await state.db.query('UPDATE listing_discussions SET is_hidden=true WHERE id=$1',[root]);
 await call('post',`${base}/${reply}/react`,owner).send({emoji:'👍'}).expect(404);
});

// Exercise both public comment surfaces against a real PostgreSQL engine.
it.each(['listing','request'])('sets votes idempotently and hides nested ancestry on %s',async kind=>{
 await state.db.query('UPDATE users SET is_verified=true WHERE id=$1',[viewer]);
 const col=kind==='listing'?'listing_id':'request_id',id=kind==='listing'?item:wanted;
 const base=`/${kind==='listing'?'listings':'requests'}/${id}/discussions`;
 const child=randomUUID(),grandchild=randomUUID(),other=randomUUID();
 await state.db.query(`INSERT INTO listing_discussions(id,${col},user_id,parent_id,reply_to_id)
   VALUES($1,$2,$3,NULL,NULL),($4,$2,$3,$1,$1),($5,$2,$3,$1,$4),($6,$2,$3,NULL,NULL)`,[root,id,owner,child,grandchild,other]);
 for(const value of [1,1,-1,0]) {
  const res=await call('post',`${base}/${grandchild}/vote`).send({value}).expect(200);
  expect(res.body).toEqual({score:value,viewerVote:value});
 }
 for(const value of [2,'1',null]) await call('post',`${base}/${root}/vote`).send({value}).expect(400);
 await call('post',`${base}/${root}/vote`).send({value:1}).expect(200);
 expect((await call('get',`${base}?sort=top`)).body.posts[0].id).toBe(root);
 await call('post',base).send({content:'Wrong thread',parentId:other,replyToId:grandchild}).expect(404);
 await state.db.query('UPDATE listing_discussions SET is_hidden=true WHERE id=$1',[child]);
 expect((await call('get',`${base}/${root}/replies`)).body.replies).toHaveLength(0);
 expect((await call('get',base)).body.posts.find(p=>p.id===root).replyCount).toBe(0);
 for(const suffix of ['', '/vote', '/react']) {
  if(!suffix) await call('get',`${base}/${grandchild}`).expect(404);
  else await call('post',`${base}/${grandchild}${suffix}`).send(suffix==='/vote'?{value:1}:{emoji:'🔥'}).expect(404);
 }
 await call('post',base).send({content:'Hidden reply',parentId:root,replyToId:grandchild}).expect(404);
 await expect(resolveReportContent('discussion',grandchild,viewer)).rejects.toMatchObject({status:404});
 await state.db.query('UPDATE listing_discussions SET is_hidden=false WHERE id=$1',[child]);
 await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[owner,viewer]);
 await call('post',`${base}/${grandchild}/vote`).send({value:1}).expect(404);
});

it('upgrades existing reactions without losing data and can rerun safely',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE users(id UUID PRIMARY KEY);CREATE TABLE listing_discussions(id UUID PRIMARY KEY,parent_id UUID);
    CREATE TABLE discussion_reactions(discussion_id UUID REFERENCES listing_discussions(id),user_id UUID REFERENCES users(id),
      emoji TEXT CHECK(emoji IN ('👍','❤️','😂','😮','😢','👎')),PRIMARY KEY(discussion_id,user_id));`);
  await db.query('INSERT INTO users VALUES($1)',[viewer]);await db.query('INSERT INTO listing_discussions(id) VALUES($1)',[root]);
  await db.query("INSERT INTO discussion_reactions VALUES($1,$2,'👍')",[root,viewer]);
  await ensureDiscussionReactionSchema(db);await ensureDiscussionReactionSchema(db);
  await db.query("INSERT INTO discussion_reactions VALUES($1,$2,'🔥')",[root,viewer]);
  expect((await db.query('SELECT emoji FROM discussion_reactions ORDER BY emoji')).rows).toHaveLength(2);
  expect((await db.query('SELECT * FROM discussion_votes')).rows).toHaveLength(0);
 } finally {await db.close();}
});
