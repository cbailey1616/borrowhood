import { afterAll,beforeAll,beforeEach,it,expect,vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../src/utils/db.js',()=>({query:(...args)=>state.db.query(...args),withTransaction:fn=>state.db.transaction(c=>fn({query:(sql,params)=>sql.includes('CREATE TABLE IF NOT EXISTS return_reports')?c.exec(sql):c.query(sql,params)}))}));
vi.mock('../../src/services/notifications.js',()=>({sendNotification:vi.fn(async(userId,type,data,{runQuery,dedupeKey})=>{
 const r=await runQuery('INSERT INTO notices(user_id,type,transaction_id,key) VALUES($1,$2,$3,$4) ON CONFLICT(key) DO UPDATE SET key=EXCLUDED.key RETURNING id',[userId,type,data.transactionId,dedupeKey]);return r.rows[0].id;
})}));
import { sendNotification } from '../../src/services/notifications.js';
import { ensureReturnRecoverySchema,reportNonReturn,extendReturn,returnHelp,respondReturnReport,reviewReturnReport } from '../../src/services/returnRecovery.js';
import { completeFreeReturn } from '../../src/services/borrowReturn.js';
const owner=randomUUID(),owner2=randomUUID(),owner3=randomUUID(),borrower=randomUUID(),admin=randomUUID(),outsider=randomUUID();
const rows=async(sql,args)=>(await state.db.query(sql,args)).rows;
const report=async id=>(await rows('SELECT * FROM return_reports WHERE id=$1',[id]))[0];
const review=async(id,action='confirm',by=admin)=>reviewReturnReport(id,by,action,'Reviewed the exchange and both parties’ evidence.',(await report(id)).version);
const seed=async(person=owner,status='picked_up',type='lend')=>{
 const id=randomUUID();await state.db.query('INSERT INTO listings(id,listing_type) VALUES($1,$2)',[id,type]);
 await state.db.query(`INSERT INTO borrow_transactions(id,listing_id,lender_id,borrower_id,status,actual_pickup_at,requested_end_date)
 VALUES($1,$1,$2,$3,$4,NOW()-INTERVAL '7 days',CURRENT_DATE-2)`,[id,person,borrower,status]);return id;
};
const reported=async(id,person=owner)=>{
 const r=await reportNonReturn(id,person,'My ladder has not been returned as agreed.');
 await state.db.query("UPDATE return_reports SET response_due_at=NOW()-INTERVAL '1 hour' WHERE id=$1",[r.id]);return r.id;
};
beforeAll(async()=>{
 state.db=new PGlite();await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,is_admin BOOLEAN DEFAULT false,display_name TEXT,first_name TEXT DEFAULT 'Neighbor');
 CREATE TABLE listings(id UUID PRIMARY KEY,listing_type TEXT DEFAULT 'lend',title TEXT DEFAULT 'Ladder',status TEXT DEFAULT 'active',is_available BOOLEAN DEFAULT false,times_borrowed INTEGER DEFAULT 0);
 CREATE TABLE borrow_transactions(id UUID PRIMARY KEY,listing_id UUID REFERENCES listings(id),lender_id UUID REFERENCES users(id),borrower_id UUID REFERENCES users(id),status TEXT,
 actual_pickup_at TIMESTAMPTZ,actual_return_at TIMESTAMPTZ,requested_end_date DATE,condition_at_pickup TEXT DEFAULT 'good',condition_at_return TEXT,condition_notes TEXT,payment_status TEXT,stripe_payment_intent_id TEXT,
 reminder_day_before_sent BOOLEAN DEFAULT true,reminder_day_of_sent BOOLEAN DEFAULT true);
 CREATE TABLE notices(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID,type TEXT,transaction_id UUID,key TEXT UNIQUE);`);
 await ensureReturnRecoverySchema();await ensureReturnRecoverySchema();
},20000);
afterAll(()=>state.db.close());
beforeEach(async()=>{
 vi.clearAllMocks();await state.db.exec('TRUNCATE users,listings,borrow_transactions,return_reports,return_review_actions,borrowing_restrictions,notices CASCADE');
 for(const id of [owner,owner2,owner3,borrower,admin,outsider])await state.db.query('INSERT INTO users(id,is_admin) VALUES($1,$2)',[id,id===admin]);
});
it('accepts one report per overdue picked-up loan and gives 48 hours to respond',async()=>{
 const id=await seed();const a=await reportNonReturn(id,owner,'My ladder is still missing.');const b=await reportNonReturn(id,owner,'Second tap of the same report.');
 expect(a.id).toBe(b.id);expect(b.alreadyReported).toBe(true);
 const r=await report(a.id);expect(r.response_due_at-r.created_at).toBe(48*3600000);
 expect(await rows('SELECT * FROM borrowing_restrictions')).toHaveLength(0);expect(await rows('SELECT * FROM notices')).toHaveLength(1);
 await expect(review(a.id)).rejects.toMatchObject({status:409});
});
it('rejects outsiders, borrowers, future dates, uncollected items and giveaways',async()=>{
 const id=await seed();await expect(reportNonReturn(id,outsider,'Not my exchange')).rejects.toMatchObject({status:404});
 await expect(reportNonReturn(id,borrower,'I am not the owner')).rejects.toMatchObject({status:403});
 await state.db.query('UPDATE borrow_transactions SET requested_end_date=CURRENT_DATE+1 WHERE id=$1',[id]);
 await expect(reportNonReturn(id,owner,'It is not late yet')).rejects.toMatchObject({status:409});
 await state.db.query('UPDATE borrow_transactions SET requested_end_date=CURRENT_DATE-1,actual_pickup_at=NULL WHERE id=$1',[id]);
 await expect(reportNonReturn(id,owner,'No handoff took place')).rejects.toMatchObject({status:409});
 await expect(reportNonReturn(await seed(owner,'picked_up','giveaway'),owner,'This was a gift')).rejects.toMatchObject({status:409});
});
it('lets only the borrower respond, exposes reports only to parties, and refuses stale decisions',async()=>{
 const id=await seed(),r=await reported(id);
 await expect(respondReturnReport(r,outsider,'Not my report',0)).rejects.toMatchObject({status:404});
 await respondReturnReport(r,borrower,'We agreed I could return it tomorrow.',0);
 await expect(reviewReturnReport(r,admin,'confirm','Reviewed the evidence.',0)).rejects.toMatchObject({status:409});
 expect((await returnHelp(outsider)).reports).toHaveLength(0);expect((await returnHelp(owner)).reports).toHaveLength(1);
 expect((await returnHelp(admin,true)).reports[0].response).toContain('tomorrow');
});
it('keeps a borrower-reported return pending, then resolves it only on owner confirmation',async()=>{
 const id=await seed(),r=await reported(id);expect(await completeFreeReturn(id,borrower,'good')).toMatchObject({pendingOwner:true});
 expect((await rows('SELECT status,actual_return_at FROM borrow_transactions WHERE id=$1',[id]))[0]).toEqual({status:'return_pending',actual_return_at:null});
 expect((await rows('SELECT is_available FROM listings WHERE id=$1',[id]))[0].is_available).toBe(false);
 expect((await report(r)).resolved_at).toBeNull();await completeFreeReturn(id,owner,'good');expect((await report(r)).resolved_at).toBeTruthy();
 expect((await rows('SELECT times_borrowed FROM listings WHERE id=$1',[id]))[0].times_borrowed).toBe(1);
 await expect(review(r)).rejects.toMatchObject({status:409});
});
it('does not count an agreed extension as a non-return and resets return reminders',async()=>{
 const id=await seed(),r=await reported(id);await extendReturn(id,owner,new Date(Date.now()+86400000).toISOString().slice(0,10));
 expect((await report(r)).status).toBe('dismissed');
 expect((await rows('SELECT reminder_day_of_sent,is_available FROM borrow_transactions JOIN listings USING(id) WHERE id=$1',[id]))[0]).toEqual({reminder_day_of_sent:false,is_available:false});
 await expect(extendReturn(id,borrower,'2099-01-01')).rejects.toMatchObject({status:403});await expect(extendReturn(id,owner,'2099-01-01')).rejects.toMatchObject({status:400});
});
it('requires two different confirmed owners, not raw reports or repeated reports by one owner',async()=>{
 const ids=[await seed(),await seed(),await seed(owner2)],rs=[];
 for(let i=0;i<ids.length;i++)rs.push(await reported(ids[i],i===2?owner2:owner));
 await review(rs[0]);await review(rs[1]);expect(await rows('SELECT * FROM borrowing_restrictions')).toHaveLength(0);
 await review(rs[2]);const restriction=(await rows('SELECT * FROM borrowing_restrictions'))[0];expect(restriction.state).toBe('hold');
 expect(restriction.until_at.getTime()-Date.now()).toBeGreaterThan(13.99*86400000);
 await expect(seed()).rejects.toMatchObject({code:'P0001'});await expect(review(rs[2],'restore')).rejects.toMatchObject({status:409});
});
it('excludes incidents older than 12 months',async()=>{
 const a=await reported(await seed()),b=await reported(await seed(owner2),owner2);
 await state.db.query("UPDATE return_reports SET created_at=NOW()-INTERVAL '13 months' WHERE id=$1",[a]);
 await review(a);await review(b);expect(await rows('SELECT * FROM borrowing_restrictions')).toHaveLength(0);
});
it('requires review for a permanent restriction and supports an appeal that reverses it',async()=>{
 const txs=[await seed(),await seed(owner2),await seed(owner3)],rs=[];
 for(let i=0;i<3;i++)rs.push(await reported(txs[i],[owner,owner2,owner3][i]));for(const r of rs)await review(r);
 expect((await rows('SELECT state FROM borrowing_restrictions'))[0].state).toBe('review');
 await expect(review(rs[2],'ban',borrower)).rejects.toMatchObject({status:403});await review(rs[2],'ban');
 expect((await rows('SELECT state FROM borrowing_restrictions'))[0].state).toBe('permanent');
 await respondReturnReport(rs[2],borrower,'This report was made by mistake. Here are the agreed arrangements.',(await report(rs[2])).version,true);
 await expect(review(rs[2],'ban')).rejects.toMatchObject({status:409});await review(rs[2],'overturn');
 expect((await rows('SELECT state FROM borrowing_restrictions'))[0].state).toBe('hold');
 await respondReturnReport(rs[1],borrower,'The owner had agreed to a new date in our messages.',(await report(rs[1])).version,true);
 await review(rs[1],'overturn');expect(await rows('SELECT * FROM borrowing_restrictions')).toHaveLength(0);
});
it('restores only after 14 days and all outstanding returns are resolved',async()=>{
 const a=await seed(),b=await seed(owner2),ra=await reported(a),rb=await reported(b,owner2);await review(ra);await review(rb);
 await state.db.query("UPDATE borrowing_restrictions SET until_at=NOW()-INTERVAL '1 hour'");await expect(review(rb,'restore')).rejects.toMatchObject({status:409});
 await completeFreeReturn(a,owner,'good');await completeFreeReturn(b,owner2,'good');await review(rb,'restore');
 expect(await rows('SELECT * FROM borrowing_restrictions')).toHaveLength(0);
 const c=await reported(await seed());await review(c,'dismiss');expect(await rows('SELECT * FROM borrowing_restrictions')).toHaveLength(0);
});
it('rolls back a report or restriction when its notification cannot save',async()=>{
 const id=await seed();sendNotification.mockRejectedValueOnce(new Error('Storage unavailable'));
 await expect(reportNonReturn(id,owner,'My item was not returned.')).rejects.toThrow('Storage unavailable');expect(await rows('SELECT * FROM return_reports')).toHaveLength(0);
 const a=await reported(id),b=await reported(await seed(owner2),owner2);await review(a);
 sendNotification.mockRejectedValueOnce(new Error('Storage unavailable'));await expect(review(b)).rejects.toThrow('Storage unavailable');
 expect((await report(b)).status).toBe('open');expect(await rows('SELECT * FROM borrowing_restrictions')).toHaveLength(0);
});
it('blocks approvals and pickups of pre-existing requests while restricted',async()=>{
 const waiting=await seed(owner,'pending'),approved=await seed(owner,'paid');
 await state.db.query("INSERT INTO borrowing_restrictions(user_id,state) VALUES($1,'hold')",[borrower]);
 await expect(state.db.query("UPDATE borrow_transactions SET status='paid' WHERE id=$1",[waiting])).rejects.toMatchObject({code:'P0001'});
 await expect(state.db.query("UPDATE borrow_transactions SET status='picked_up' WHERE id=$1",[approved])).rejects.toMatchObject({code:'P0001'});
});
it('reopens one case after a missed extended deadline with a fresh response window',async()=>{
 const id=await seed(),r=await reported(id);await review(r,'dismiss');
 expect((await reportNonReturn(id,owner,'Repeated allegation with no new deadline.')).alreadyReported).toBe(true);
 await state.db.query('UPDATE borrow_transactions SET requested_end_date=CURRENT_DATE-1 WHERE id=$1',[id]);
 const reopened=await reportNonReturn(id,owner,'The later agreed deadline has also passed.');
 expect(reopened.id).toBe(r);expect(reopened.alreadyReported).toBeUndefined();
 expect((await report(r)).status).toBe('open');expect((await report(r)).response).toBeNull();
 expect(await rows('SELECT * FROM return_reports')).toHaveLength(1);
 await expect(review(r)).rejects.toMatchObject({status:409});
 expect((await returnHelp(owner)).reports[0].history).toHaveLength(2);
});
