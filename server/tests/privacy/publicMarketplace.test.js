import { afterAll,beforeAll,beforeEach,expect,it,vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../src/utils/db.js',()=>({query:(...args)=>state.db.query(...args)}));
import publicMarketplace from '../../src/routes/publicMarketplace.js';
const app=express();app.use('/public',publicMarketplace);
let owner,listing;
beforeAll(async()=>{
  state.db=new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,status TEXT DEFAULT 'verified');
    CREATE TABLE categories(id UUID PRIMARY KEY,name TEXT);
    CREATE TABLE listings(id UUID PRIMARY KEY,owner_id UUID,title TEXT,description TEXT,condition TEXT DEFAULT 'good',
      listing_type TEXT DEFAULT 'lend',is_free BOOLEAN DEFAULT true,price_per_day NUMERIC DEFAULT 0,deposit_amount NUMERIC DEFAULT 0,
      direct_fee JSONB,category_id UUID,status TEXT DEFAULT 'active',is_available BOOLEAN DEFAULT true,
      privacy_version INT DEFAULT 1,visibility TEXT DEFAULT 'town',town_preview_enabled BOOLEAN DEFAULT true,
      public_preview_enabled BOOLEAN DEFAULT false,moderation_removed_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE listing_photos(listing_id UUID,url TEXT,sort_order INT);
    CREATE TABLE borrow_transactions(listing_id UUID,status TEXT);`);
},15000);
afterAll(async()=>state.db.close());
beforeEach(async()=>{
  await state.db.exec('TRUNCATE users,listings,listing_photos,borrow_transactions');
  owner=randomUUID();listing=randomUUID();
  await state.db.query('INSERT INTO users(id) VALUES($1)',[owner]);
  await state.db.query("INSERT INTO listings(id,owner_id,title,description) VALUES($1,$2,'Cordless saw','A handy saw')",[listing,owner]);
});

it('lets guests search a real opted-in item without revealing owner identity',async()=>{
  expect((await request(app).get('/public/listings')).body.items).toHaveLength(0);
  await state.db.query('UPDATE listings SET public_preview_enabled=true WHERE id=$1',[listing]);
  const list=await request(app).get('/public/listings?search=saw&type=lend').expect(200);
  expect(list.body.items).toEqual([expect.objectContaining({id:listing,title:'Cordless saw',previewOnly:true,ownerMasked:true})]);
  expect(JSON.stringify(list.body)).not.toContain(owner);
  expect((await request(app).get('/public/listings?search=ladder')).body.items).toHaveLength(0);
  expect((await request(app).get(`/public/listings/${listing}`).expect(200)).body.description).toBe('A handy saw');
});

it.each([
  ['private audience',"visibility='close_friends'"],
  ['neighborhood audience',"visibility='neighborhood'"],
  ['older sharing revision','privacy_version=0'],
  ['revoked preview','public_preview_enabled=false'],
  ['unavailable item','is_available=false'],
  ['paused item',"status='paused'"],
  ['removed item','moderation_removed_at=NOW()'],
])('keeps %s out of public browse and direct links',async(_label,update)=>{
  await state.db.query('UPDATE listings SET public_preview_enabled=true WHERE id=$1',[listing]);
  await state.db.exec(`UPDATE listings SET ${update}`);
  expect((await request(app).get('/public/listings').expect(200)).body.items).toHaveLength(0);
  await request(app).get(`/public/listings/${listing}`).expect(404);
  await request(app).get(`/public/listings/${listing}/photo`).expect(404);
});

it('hides suspended owners and items held in an exchange',async()=>{
  await state.db.query('UPDATE listings SET public_preview_enabled=true WHERE id=$1',[listing]);
  await state.db.query("INSERT INTO borrow_transactions(listing_id,status) VALUES($1,'closed_unreturned')",[listing]);
  expect((await request(app).get('/public/listings')).body.items).toHaveLength(0);
  await state.db.exec('TRUNCATE borrow_transactions');
  await state.db.query("UPDATE users SET status='suspended' WHERE id=$1",[owner]);
  expect((await request(app).get('/public/listings')).body.items).toHaveLength(0);
});

it('rejects malformed filters and ids without inspecting private rows',async()=>{
  await request(app).get('/public/listings?page=-1').expect(400);
  await request(app).get('/public/listings?search='+ 'x'.repeat(81)).expect(400);
  await request(app).get('/public/listings?type=private').expect(400);
  await request(app).get('/public/listings/not-an-id').expect(404);
});
