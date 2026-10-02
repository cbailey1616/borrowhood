import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args) }));
vi.mock('../../src/middleware/auth.js', () => ({ authenticate: (req, res, next) => { req.user = { id: req.headers['x-user'] }; next(); }, requireVerified: (req,res,next)=>next(), requireAdmin:(req,res,next)=>next(), ENABLE_PAID_TIERS:false }));
vi.mock('../../src/services/stripe.js', () => ({ stripe: {}, createConnectAccount:vi.fn(), createConnectAccountLink:vi.fn(), getConnectAccount:vi.fn(), cancelPaymentIntent:vi.fn() }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification:vi.fn() }));
vi.mock('../../src/services/endorsements.js', () => ({ endorsementSummary:vi.fn(async()=>({})) }));
import users from '../../src/routes/users.js';
const owner='10000000-0000-4000-8000-000000000001', viewer='10000000-0000-4000-8000-000000000002', other='10000000-0000-4000-8000-000000000003';
const app=express();app.use(express.json());app.use('/users',users);
const get=(path,user=viewer)=>request(app).get('/users'+path).set('x-user',user);
beforeAll(async()=>{
 state.db=new PGlite();
 await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, first_name TEXT DEFAULT 'Neighbor', last_name TEXT DEFAULT 'Bailey', display_name TEXT, profile_photo_url TEXT, bio TEXT DEFAULT 'My bio', city TEXT DEFAULT 'Upton', state TEXT DEFAULT 'MA', status TEXT DEFAULT 'active', lender_rating NUMERIC DEFAULT 5, lender_rating_count INT DEFAULT 1, total_transactions INT DEFAULT 1, is_verified BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), email TEXT, phone TEXT);
 CREATE TABLE user_blocks(user_id UUID, blocked_id UUID);
 CREATE TABLE friendships(id UUID DEFAULT gen_random_uuid(), user_id UUID, friend_id UUID, status TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id,friend_id));
 CREATE TABLE community_memberships(community_id UUID, user_id UUID, joined_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE ratings(ratee_id UUID,rater_id UUID,rating INT,comment TEXT,created_at TIMESTAMPTZ DEFAULT NOW());`);
},20000);
afterAll(async()=>state.db.close());
beforeEach(async()=>{
 await state.db.exec('TRUNCATE users,user_blocks,friendships,community_memberships,ratings');
 await state.db.query('INSERT INTO users(id,phone) VALUES($1,$4),($2,NULL),($3,NULL)',[owner,viewer,other,'5551234567']);
 await state.db.query("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted'),($2,$1,'accepted')",[owner,viewer]);
 await state.db.query('INSERT INTO community_memberships VALUES($1,$1),($1,$2)',[owner,viewer]);
 await state.db.query("INSERT INTO ratings(ratee_id,rater_id,rating,comment) VALUES($1,$2,5,'Helpful')",[owner,other]);
});
it('hides the blocker profile and ratings from the blocked viewer, including direct links, and restores access on unblock',async()=>{
 expect((await get('/'+owner)).status).toBe(200);
 await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[owner,viewer]);
 expect((await get('/'+owner)).status).toBe(404);
 expect((await get('/'+owner+'/ratings')).body).toEqual([]);
 // The initiator retains access to the other profile to reach Unblock user.
 expect((await get('/'+viewer,owner)).status).toBe(200);
 expect((await get('/'+owner,owner)).status).toBe(200);
 await state.db.exec('DELETE FROM user_blocks');
 expect((await get('/'+owner)).status).toBe(200);
 expect((await get('/'+owner+'/ratings')).body).toHaveLength(1);
});
it.each([[owner,viewer],[viewer,owner]])('filters search, suggestions, friends and phone matching after either member blocks',async(blocker,blocked)=>{
 expect((await get('/search?q=Neighbor')).body.map(u=>u.id)).toContain(owner);
 await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[blocker,blocked]);
 for(const path of ['/search?q=Neighbor','/suggested','/suggested?neighborhood='+owner,'/me/friends']) {
  const res=await get(path);expect(res.status).toBe(200);expect(res.body.map(u=>u.id)).not.toContain(owner);
 }
 const contacts=await request(app).post('/users/contacts/match').set('x-user',viewer).send({phoneNumbers:['5551234567']});
 expect(contacts.status).toBe(200);expect(contacts.body).toEqual([]);
 const friend=await request(app).post('/users/me/friends').set('x-user',viewer).send({friendId:owner});
 expect(friend.status).toBe(404);
});
it('hides blocked authors ratings on a third party profile',async()=>{
 await state.db.query("INSERT INTO ratings(ratee_id,rater_id,rating,comment) VALUES($1,$2,5,'Private from blocked user')",[other,owner]);
 await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[owner,viewer]);
 expect((await get('/'+other+'/ratings')).body).toEqual([]);
});

it.each([[owner,viewer],[viewer,owner]])('denies blocked friend acceptance without affecting unrelated requests',async(blocker,blocked)=>{
 await state.db.query("UPDATE friendships SET status='pending' WHERE user_id=$1 AND friend_id=$2",[owner,viewer]);
 const target=(await state.db.query('SELECT id FROM friendships WHERE user_id=$1 AND friend_id=$2',[owner,viewer])).rows[0].id;
 await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[blocker,blocked]);
 const accept=(id)=>request(app).post('/users/me/friend-requests/'+id+'/accept').set('x-user',viewer);
 expect((await accept(target)).status).toBe(404);
 const separate=(await state.db.query("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'pending') RETURNING id",[other,viewer])).rows[0].id;
 expect((await accept(separate)).status).toBe(200);
 await state.db.exec('DELETE FROM user_blocks');
 expect((await accept(target)).status).toBe(200);
});
