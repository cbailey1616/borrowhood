import { it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { query } from '../src/utils/db.js';
import safety from '../src/routes/safety.js';
const app=express();app.use(express.json());app.use('/safety',safety);
it('serializes concurrent item reports in PostgreSQL without losing the first report',async()=>{
 const owner=randomUUID(),reporter=randomUUID(),other=randomUUID();const users=[owner,reporter,other];let item;
 const auth=id=>({Authorization:`Bearer ${jwt.sign({userId:id},process.env.JWT_SECRET,{expiresIn:'1h'})}`});
 try {
  for(const id of users) await query("INSERT INTO users(id,email,first_name,last_name,city,state,status,is_verified) VALUES($1,$2,'Report','Test','Upton','MA','verified',true)",[id,`${id}@report.invalid`]);
  item=(await query("INSERT INTO listings(owner_id,title,condition,is_free,visibility,privacy_version) VALUES($1,'Report concurrency test','good',true,'town',1) RETURNING id",[owner])).rows[0].id;
  const path=`/safety/content/listing/${item}/report`;
  const results=await Promise.all(Array.from({length:5},()=>request(app).post(path).set(auth(reporter)).send({reason:'Harassment'})));
  expect(results.map(r=>r.status)).toEqual([200,200,200,200,200]);
  expect((await query('SELECT id FROM safety_reports WHERE reporter_id=$1',[reporter])).rows).toHaveLength(1);
  expect((await request(app).get(path).set(auth(reporter))).body).toEqual({submitted:true});
  expect((await request(app).get(path).set(auth(other))).body).toEqual({submitted:false});
  await query("UPDATE safety_reports SET status='dismissed' WHERE reporter_id=$1",[reporter]);
  expect((await request(app).post(path).set(auth(reporter)).send({reason:'Unsafe behavior'})).status).toBe(200);
  expect((await query('SELECT id FROM safety_reports WHERE reporter_id=$1',[reporter])).rows).toHaveLength(1);
  expect((await request(app).post(path).set(auth(other)).send({reason:'Harassment'})).status).toBe(200);
  expect((await query('SELECT id FROM safety_reports WHERE content_id=$1',[item])).rows).toHaveLength(2);
 } finally {
  await query('DELETE FROM safety_reports WHERE reporter_id=ANY($1::uuid[])',[users]);
  if(item) await query('DELETE FROM listings WHERE id=$1',[item]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);
 }
});
