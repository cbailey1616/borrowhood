import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
const state=vi.hoisted(()=>({db:null,maxFeedRows:0}));
vi.mock('../../src/utils/db.js',()=>({query:async(...args)=>{
  const r=await state.db.query(...args);
  if(typeof args[0]==='string'&&/FROM (listings l|item_requests r)/.test(args[0]))state.maxFeedRows=Math.max(state.maxFeedRows,r.rows.length);
  return r;
},withTransaction:fn=>state.db.transaction(fn)}));
import feed from '../../src/routes/feed.js';
import messages from '../../src/routes/messages.js';
import notifications from '../../src/routes/notifications.js';
import { ensureFeedWindowSchema } from '../../src/services/feedWindows.js';
import { ensureNotificationSchema } from '../../src/services/notificationSchema.js';
import { ensureCommunityChatSchema } from '../../src/services/communityChat.js';
const app=express();app.use(express.json());app.use('/feed',feed);app.use('/messages',messages);app.use('/notifications',notifications);
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const report={createdAt:new Date().toISOString(),environment:'isolated local PGlite (single connection)',
  limitation:'Exercises real route SQL and HTTP concurrency using synthetic data. Excludes hosting, network, native database pool concurrency, S3 and Expo capacity. These timings do not establish production capacity.',
  fixtures:{members:150,listings:10000,requests:1000,feedEvents:100000,messages:10000,notifications:5000,exchanges:1000,endorsements:1000,pushDeliveries:5000},runs:[]};
let tokens;
beforeAll(async()=>{
  // No .env loading. Refuse inherited production endpoints and all outgoing fetch.
  vi.stubEnv('JWT_SECRET','synthetic-local-load-test-secret');
  vi.stubGlobal('fetch',()=>{throw new Error('External requests are blocked in the launch rehearsal');});
  const connectionString=process.env.LAUNCH_TEST_DATABASE_URL;
  if(connectionString){
    const target=new URL(connectionString);
    if(target.hostname!=='127.0.0.1'||target.pathname!=='/borrowhood_launch_test'||target.search||target.hash||process.env.LAUNCH_TEST_FRESH_CLUSTER!=='yes')throw new Error('Launch tests require a fresh disposable loopback database.');
    const pool=new pg.Pool({connectionString,ssl:false,max:10,connectionTimeoutMillis:5000});
    const existing=await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public'");
    if(existing.rows.length){await pool.end();throw new Error('Refusing to change a nonempty database.');}
    state.db={query:pool.query.bind(pool),exec:pool.query.bind(pool),close:()=>pool.end(),transaction:async fn=>{
      const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}
      catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    }};
    report.environment='isolated native PostgreSQL';
    report.limitation='Synthetic local workload; excludes Railway resources, external network, S3 and Expo. A staging rehearsal is still required before claiming production capacity.';
  }else state.db=new PGlite();
  await state.db.exec(await readFile(new URL('../helpers/launch-schema.sql',import.meta.url),'utf8'));
  await state.db.exec(await readFile(new URL('../../migrations/020_exchange_endorsements.sql',import.meta.url),'utf8'));
  await ensureFeedWindowSchema();await ensureNotificationSchema();await ensureCommunityChatSchema();
  await state.db.query(`INSERT INTO users(id,email) SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    'test-'||n||'@example.invalid' FROM generate_series(1,150) n`);
  await state.db.query(`INSERT INTO listings(owner_id,title,description,created_at)
    SELECT ('10000000-0000-4000-8000-'||lpad((101+n%50)::text,12,'0'))::uuid,
    'Tool '||n,repeat('Synthetic garden tool. ',10),NOW()-n*INTERVAL '1 minute' FROM generate_series(1,10000)n`);
  await state.db.query(`INSERT INTO borrow_transactions(listing_id,borrower_id,lender_id,status)
    SELECT id,$1,owner_id,'completed' FROM listings ORDER BY id LIMIT 1000`,[id(1)]);
  await state.db.query(`INSERT INTO exchange_endorsements(transaction_id,rater_id,ratee_id,positive)
    SELECT id,borrower_id,lender_id,true FROM borrow_transactions`);
  await state.db.query(`INSERT INTO push_devices(user_id,installation_id,token)
    SELECT id,'synthetic-'||id,'ExpoPushToken[synthetic_'||replace(id::text,'-','')||']' FROM users`);
  await state.db.query(`INSERT INTO item_requests(user_id,title,description,created_at)
    SELECT $1,'Wanted '||n,'Synthetic wanted post',NOW()-n*INTERVAL '1 minute' FROM generate_series(1,1000)n`,[id(150)]);
  await state.db.query(`INSERT INTO feed_events(user_id,item_type,item_id,seen_at,clicked_at)
    SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'listing',l.id,NOW(),NOW()
    FROM listings l CROSS JOIN generate_series(1,10)n`);
  await state.db.query(`INSERT INTO conversations(id,user1_id,user2_id)
    SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1 FROM generate_series(1,100)n`,[id(150)]);
  await state.db.query(`INSERT INTO messages(conversation_id,sender_id,content,created_at)
    SELECT c.id,$1,'Synthetic message '||n,NOW()-n*INTERVAL '1 minute' FROM conversations c CROSS JOIN generate_series(1,100)n`,[id(150)]);
  await state.db.query(`INSERT INTO notifications(user_id,type,title,body,push_data)
    SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'rank_up','Rating update','Synthetic activity','{}'::jsonb
    FROM generate_series(1,100)n CROSS JOIN generate_series(1,50)j`);
  await state.db.exec('ANALYZE');
  tokens=Array.from({length:100},(_,n)=>jwt.sign({userId:id(n+1)},process.env.JWT_SECRET));
},60000);
afterAll(async()=>{
  report.maxFeedCandidateRows=state.maxFeedRows;
  await writeFile(new URL('../../../docs/qa/launch-load-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  await state.db?.close();vi.unstubAllGlobals();vi.unstubAllEnvs();
});
it.each([10,25,50,100])('handles a burst of %i concurrent synthetic clients',async clients=>{
  const samples=[],errors=[],byRoute={};
  const started=performance.now();
  await Promise.all(Array.from({length:clients},async(_,n)=>{
    const session=randomUUID();
    const paths=[`/feed?layout=sections&session=${session}`,
      `/feed?layout=sections&session=${session}&page=2`,
      `/messages/conversations/20000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,
      '/notifications?limit=50', '/feed?summary=true'];
    for(const path of paths){
      const start=performance.now();
      const res=await request(app).get(path).set('Authorization',`Bearer ${tokens[n]}`);
      const duration=performance.now()-start;
      samples.push(duration);
      const route=path.includes('summary=true')?'feed summary':path.includes('page=2')?'feed next page':path.startsWith('/feed')?'feed first page':path.startsWith('/messages')?'chat':'notifications';
      (byRoute[route]||=[]).push(duration);
      if(res.status!==200)errors.push({path:path.split('?')[0],status:res.status});
      if(path.startsWith('/feed?layout'))expect(res.body.items?.length).toBeLessThanOrEqual(20);
    }
  }));
  samples.sort((a,b)=>a-b);
  const row={clients,requests:samples.length,errors:errors.length,durationMs:Math.round(performance.now()-started),
    medianMs:Math.round(samples[Math.floor(samples.length*.5)]),p95Ms:Math.round(samples[Math.floor(samples.length*.95)]),maxMs:Math.round(samples.at(-1)),
    byRoute:Object.fromEntries(Object.entries(byRoute).map(([route,values])=>{
      values.sort((a,b)=>a-b);return [route,{requests:values.length,medianMs:Math.round(values[Math.floor(values.length*.5)]),p95Ms:Math.round(values[Math.floor(values.length*.95)])}];
    }))};
  report.runs.push(row);console.log(JSON.stringify(row));
  expect(errors).toEqual([]);expect(state.maxFeedRows).toBeLessThanOrEqual(201);
});
it('persists simultaneous message retries once and queues one delivery per message',async()=>{
  const before=Number((await state.db.query('SELECT COUNT(*) AS n FROM push_deliveries')).rows[0].n);
  await Promise.all(Array.from({length:50},async(_,n)=>{
    const payload={recipientId:id(150),content:'Synthetic retry test',clientRequestId:randomUUID()};
    const responses=await Promise.all([0,1].map(()=>request(app).post('/messages')
      .set('Authorization',`Bearer ${tokens[n]}`).send(payload)));
    expect(responses.map(res=>res.status).sort()).toEqual([200,201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
  }));
  expect(Number((await state.db.query('SELECT COUNT(*) AS n FROM messages WHERE client_request_id IS NOT NULL')).rows[0].n)).toBe(50);
  expect(Number((await state.db.query('SELECT COUNT(*) AS n FROM push_deliveries')).rows[0].n)-before).toBe(50);
  report.messageRetries={requests:100,persistedMessages:50,queuedDeliveries:50};
});
it('restores the local synthetic dataset into a separate database',async()=>{
  if(!state.db.dumpDataDir){report.restore='Native restore uses scripts/rehearse-launch-restore.js after this suite.';return;}
  const tables=['users','listings','item_requests','messages','notifications','feed_windows','borrow_transactions','exchange_endorsements','push_deliveries'];
  const totals=async db=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,
    (await db.query(`SELECT COUNT(*)::int AS count,md5(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text)) AS digest FROM ${table} t`)).rows[0]])));
  const expected=await totals(state.db);
  const dump=await state.db.dumpDataDir();
  const restored=new PGlite({loadDataDir:dump});
  try{expect(await totals(restored)).toEqual(expected);report.restore='Passed synthetic PGlite export/restore with row counts and full-row digests across nine tables. Railway backup/restore remains unverified.';}
  finally{await restored.close();}
});
