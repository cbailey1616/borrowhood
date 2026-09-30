import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
const state=vi.hoisted(()=>({db:null,user:'10000000-0000-4000-8000-000000000001'}));
vi.mock('../../src/utils/db.js',()=>({query:(...args)=>state.db.query(...args),withTransaction:fn=>state.db.transaction(fn)}));
vi.mock('../../src/middleware/auth.js',()=>({authenticate:(req,res,next)=>{req.user={id:state.user};next();}}));
import projects from '../../src/routes/projects.js';
import {ensureProjectSchema,lockProjectItem} from '../../src/services/projects.js';
import {matchesProjectItem, seasonalProjects} from '../../src/data/projects.js';
const me='10000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000002';
const app=express();app.use(express.json());app.use('/projects',projects);app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
const create=async()=>{const r=await request(app).post('/projects').send({templateId:'party'});expect(r.status).toBe(201);return (await request(app).get(`/projects/${r.body.id}`)).body;};
beforeAll(async()=> {
 state.db=new PGlite();await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,city TEXT DEFAULT 'Upton',state TEXT DEFAULT 'MA',is_verified BOOLEAN DEFAULT true,status TEXT DEFAULT 'active');
 CREATE TABLE listings(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),owner_id UUID,title TEXT,visibility TEXT DEFAULT 'town',community_id UUID,circle_id UUID,status TEXT DEFAULT 'active',listing_type TEXT DEFAULT 'lend',privacy_version INT DEFAULT 1,town_preview_enabled BOOLEAN DEFAULT true,is_available BOOLEAN DEFAULT true,is_free BOOLEAN DEFAULT true,price_per_day NUMERIC DEFAULT 0,deposit_amount NUMERIC DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE listing_photos(listing_id UUID,url TEXT,sort_order INT);
 CREATE TABLE friendships(user_id UUID,friend_id UUID,status TEXT);
 CREATE TABLE community_memberships(community_id UUID,user_id UUID);
 CREATE TABLE lending_circle_members(circle_id UUID,user_id UUID,status TEXT);
 CREATE TABLE user_blocks(user_id UUID,blocked_id UUID);
 CREATE TABLE borrow_transactions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),listing_id UUID,borrower_id UUID,status TEXT,requested_end_date DATE);`);
 await ensureProjectSchema((...args)=>state.db.query(...args));
},20000);
beforeEach(async()=>{state.user=me;await state.db.exec(`TRUNCATE users,listings,borrow_transactions,borrow_projects,borrow_project_items,user_blocks CASCADE;INSERT INTO users(id) VALUES('${me}'),('${owner}');`);});
afterAll(async()=>state.db.close());
it('creates private durable checklists and denies another account reads and writes',async()=> {
 const p=await create();expect(p.items).toHaveLength(6);
 expect((await request(app).get('/projects')).body).toHaveLength(1);
 state.user=owner;
 expect((await request(app).get(`/projects/${p.id}`)).status).toBe(404);
 expect((await request(app).patch(`/projects/${p.id}/items/${p.items[0].id}`).send({owned:true})).status).toBe(409);
 await request(app).delete(`/projects/${p.id}`);
 state.user=me;expect((await request(app).get(`/projects/${p.id}`)).status).toBe(200);
});
it('suggests only visible free unreserved inventory, respecting both directions of blocking',async()=> {
 for(const [title,visibility,type] of [['Folding table','town','lend'],['Folding table private','private','lend'],['Folding table sale','town','sell']])await state.db.query('INSERT INTO listings(owner_id,title,visibility,listing_type) VALUES($1,$2,$3,$4)',[owner,title,visibility,type]);
 const matches=async()=> (await request(app).get('/projects/ideas')).body.find(p=>p.id==='party').items[0].matches;
 expect((await matches()).map(i=>i.title)).toEqual(['Folding table']);
 await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[owner,me]);expect(await matches()).toEqual([]);
 await state.db.exec('TRUNCATE user_blocks');await state.db.query('INSERT INTO user_blocks VALUES($1,$2)',[me,owner]);expect(await matches()).toEqual([]);
 await state.db.exec('TRUNCATE user_blocks');await state.db.query("UPDATE users SET is_verified=false WHERE id=$1",[me]);expect(await matches()).toEqual([]);
 await state.db.query('UPDATE users SET is_verified=true WHERE id=$1',[me]);
 await state.db.query("INSERT INTO borrow_transactions(listing_id,borrower_id,status) SELECT id,$1,'approved' FROM listings WHERE title='Folding table'",[me]);expect(await matches()).toEqual([]);
});
it('persists owned state and custom items; validates inputs',async()=> {
 const p=await create();
 expect((await request(app).patch(`/projects/${p.id}/items/${p.items[0].id}`).send({owned:true})).status).toBe(200);
 expect((await request(app).post(`/projects/${p.id}/items`).send({label:'Picnic blanket'})).status).toBe(201);
 const after=(await request(app).get(`/projects/${p.id}`)).body;
 expect(after.items[0].owned).toBe(true);expect(after.items).toHaveLength(7);
 expect((await request(app).post(`/projects/${p.id}/items`).send({label:' '})).status).toBe(400);
 expect((await request(app).get('/projects/not-a-uuid')).status).toBe(400);
});
it('locks association to the owner and refuses already covered items',async()=> {
 const p=await create(),id=p.items[0].id;
 await expect(state.db.transaction(c=>lockProjectItem(c,id,owner))).rejects.toMatchObject({status:404});
 await request(app).patch(`/projects/${p.id}/items/${id}`).send({owned:true});
 await expect(state.db.transaction(c=>lockProjectItem(c,id,me))).rejects.toMatchObject({status:409});
});
it('preserves exchanges when deleting projects, and only resets settled or cancelled links',async()=> {
 const p=await create(),id=p.items[0].id;
 const {rows:[t]}=await state.db.query("INSERT INTO borrow_transactions(borrower_id,status) VALUES($1,'pending') RETURNING id",[me]);
 await state.db.query('UPDATE borrow_project_items SET transaction_id=$1 WHERE id=$2',[t.id,id]);
 expect((await request(app).post(`/projects/${p.id}/items/${id}/reset`)).status).toBe(409);
 expect((await request(app).patch(`/projects/${p.id}/items/${id}`).send({owned:true})).status).toBe(409);
 await state.db.query("UPDATE borrow_transactions SET status='cancelled' WHERE id=$1",[t.id]);
 expect((await request(app).post(`/projects/${p.id}/items/${id}/reset`)).status).toBe(200);
 await request(app).delete(`/projects/${p.id}`);
 expect((await state.db.query('SELECT id FROM borrow_transactions WHERE id=$1',[t.id])).rows).toHaveLength(1);
});
it('matches whole item phrases, not unrelated substrings',()=>{expect(matchesProjectItem('Folding chairs',['chair'])).toBe(true);expect(matchesProjectItem('Chairman board game',['chair'])).toBe(false);expect(matchesProjectItem('Tent stakes',['tent'])).toBe(false);});

it('swaps snow trips and kayaking by season and location while keeping ten core suggestions',()=>{
  const january=new Date('2027-01-15T12:00:00Z'), july=new Date('2027-07-15T12:00:00Z');
  const ids=location=>seasonalProjects(january,location).map(p=>p.id);
  expect(ids({state:'MA',city:'Upton'})).toContain('snow');
  expect(ids({state:'Florida',city:'Tampa'})).not.toContain('snow');
  expect(ids({state:'SC',city:'Charleston'})).toContain('paddle');
  expect(ids({state:'CA',city:'Mammoth Lakes'})).toContain('snow');
  expect(ids({state:'CA',city:'San Diego'})).not.toContain('snow');
  expect(ids({})).not.toContain('snow');
  const summer=seasonalProjects(july,{state:'Massachusetts',city:'Upton'});
  expect(summer.map(p=>p.id)).toContain('paddle');expect(summer.map(p=>p.id)).not.toContain('snow');
  expect(summer).toHaveLength(10);expect(seasonalProjects(january,{state:'MA'})).toHaveLength(10);
});
it('persists optional checklist items without requiring them for plan completion',async()=>{
 const res=await request(app).post('/projects').send({templateId:'move'});
 const detail=await request(app).get(`/projects/${res.body.id}`);
 expect(detail.body.items.find(i=>i.label==='Truck or trailer').optional).toBe(true);
});
