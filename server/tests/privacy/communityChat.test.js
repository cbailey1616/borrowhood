import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (s,p) => state.db.query(s,p), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/middleware/auth.js', () => ({ authenticate: (req,res,next) => { req.user={id:req.headers['x-user']}; next(); } }));
import router from '../../src/routes/communityChat.js';
import { ensureCommunityChatSchema, communityConversations } from '../../src/services/communityChat.js';
const app=express();app.use(express.json());app.use('/communities/:id/chat',router);
const a=randomUUID(),b=randomUUID(),outsider=randomUUID(),group=randomUUID(),other=randomUUID();
const url=`/communities/${group}/chat`;
const send=(user,content,extra={},community=group)=>request(app).post(`/communities/${community}/chat`).set('x-user',user).send({content,clientRequestId:randomUUID(),...extra});
beforeAll(async()=>{
 state.db=new PGlite();
 await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,first_name TEXT,display_name TEXT,profile_photo_url TEXT);
 CREATE TABLE communities(id UUID PRIMARY KEY,name TEXT,banner_url TEXT,is_active BOOLEAN DEFAULT true,community_type TEXT DEFAULT 'neighborhood');
 CREATE TABLE community_memberships(community_id UUID REFERENCES communities,user_id UUID REFERENCES users,role TEXT DEFAULT 'member',PRIMARY KEY(community_id,user_id));
 CREATE TABLE user_blocks(user_id UUID,blocked_id UUID);`);
 await ensureCommunityChatSchema();await ensureCommunityChatSchema();
 await state.db.query("INSERT INTO users(id,first_name) VALUES($1,'Alex'),($2,'Blair'),($3,'Outside')",[a,b,outsider]);
 await state.db.query("INSERT INTO communities(id,name) VALUES($1,'Maple'),($2,'Other')",[group,other]);
},20000);
beforeEach(async()=>{
 await state.db.exec('TRUNCATE community_chat_messages,community_memberships,user_blocks RESTART IDENTITY CASCADE');
 await state.db.query("INSERT INTO community_memberships(community_id,user_id,role) VALUES($1,$2,'organizer'),($1,$3,'member'),($4,$2,'organizer')",[group,a,b,other]);
});
afterAll(async()=>state.db.close());
it('restricts all operations to current members',async()=>{
 expect((await send(outsider,'hello')).status).toBe(403);
 expect((await request(app).get(url).set('x-user',outsider)).status).toBe(403);
 expect((await request(app).post(`${url}/read`).set('x-user',outsider).send({sequence:'1'})).status).toBe(403);
 expect((await request(app).patch(`${url}/preferences`).set('x-user',outsider).send({muted:true})).status).toBe(403);
 await state.db.query('DELETE FROM community_memberships WHERE user_id=$1',[b]);
 expect((await send(b,'removed')).status).toBe(403);expect(await communityConversations(b)).toEqual([]);
});
it('deduplicates retries; keeps read state private and later arrivals unread',async()=>{
 const key=randomUUID();const first=await send(a,'hello',{clientRequestId:key});expect(first.status).toBe(200);
 expect((await send(a,'hello',{clientRequestId:key})).body.id).toBe(first.body.id);
 expect((await send(a,'changed',{clientRequestId:key})).status).toBe(409);
 const page=await request(app).get(url).set('x-user',b);expect(page.body.messages).toHaveLength(1);
 expect(JSON.stringify(page.body)).not.toMatch(/isRead|readBy|lastRead/);
 await send(a,'second');await request(app).post(`${url}/read`).set('x-user',b).send({sequence:page.body.readSequence});
 expect((await communityConversations(b))[0]).toMatchObject({kind:'community',name:'Maple',unreadCount:1});
});
it('isolates threads and enforces deletion permissions',async()=>{
 const root=(await send(a,'root')).body.id;
 expect((await send(b,'reply',{parentId:root})).status).toBe(200);
 expect((await send(a,'wrong channel',{parentId:root},other)).status).toBe(404);
 expect((await request(app).get(`/communities/${other}/chat?parentId=${root}`).set('x-user',a)).status).toBe(404);
 const page=await request(app).get(url).set('x-user',b);expect(page.body.messages[0].replyCount).toBe(1);
 expect((await request(app).get(`${url}?parentId=${root}`).set('x-user',b)).body.messages).toHaveLength(2);
 expect((await request(app).delete(`${url}/${root}`).set('x-user',b)).status).toBe(403);
 const reply=(await send(b,'remove me')).body.id;
 expect((await request(app).delete(`${url}/${reply}`).set('x-user',a)).status).toBe(200);
 expect((await request(app).get(url).set('x-user',b)).body.messages[0]).toMatchObject({content:'Message removed',deleted:true});
});
it('honors blocks in history, threads, previews and badges; persists mute',async()=>{
 const root=(await send(a,'hidden')).body.id;await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[b,a]);
 expect((await request(app).get(url).set('x-user',b)).body.messages).toEqual([]);
 expect((await request(app).get(`${url}?parentId=${root}`).set('x-user',b)).status).toBe(404);
 expect((await send(b,'reply',{parentId:root})).status).toBe(404);
 expect((await communityConversations(b))[0]).toMatchObject({lastMessage:null,unreadCount:0});
 await state.db.exec('DELETE FROM user_blocks');await request(app).patch(`${url}/preferences`).set('x-user',b).send({muted:true});
 expect((await communityConversations(b))[0]).toMatchObject({muted:true,unreadCount:0});
 expect((await request(app).get(url).set('x-user',b)).body.muted).toBe(true);
});
it('paginates without duplicates and validates input',async()=>{
 await state.db.query(`INSERT INTO community_chat_messages(community_id,sender_id,content,client_request_id)
 SELECT $1,$2,'Hello',gen_random_uuid() FROM generate_series(1,55)`,[group,a]);
 const first=(await request(app).get(url).set('x-user',b)).body;expect(first.messages).toHaveLength(50);
 const older=(await request(app).get(`${url}?before=${first.nextBefore}`).set('x-user',b)).body;expect(older.messages).toHaveLength(5);
 expect(new Set([...first.messages,...older.messages].map(m=>m.id)).size).toBe(55);
 expect((await send(a,' ')).status).toBe(400);expect((await send(a,'x'.repeat(2001))).status).toBe(400);
 expect((await request(app).get(`${url}?before=bad`).set('x-user',b)).status).toBe(400);
});
it('deleting an author cannot prevent account deletion when other members replied',async()=>{
 const root=(await send(b,'root')).body.id;await send(a,'reply',{parentId:root});
 await state.db.query('DELETE FROM community_memberships WHERE user_id=$1',[b]);
 await state.db.query('DELETE FROM users WHERE id=$1',[b]);
 expect((await request(app).get(url).set('x-user',a)).status).toBe(200);
});
