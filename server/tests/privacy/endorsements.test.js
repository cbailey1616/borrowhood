import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db:null }));
vi.mock('../../src/utils/db.js', () => ({
  query: (...args) => state.db.query(...args),
  withTransaction: async fn => { await state.db.exec('BEGIN');try { const result=await fn({query:(...args)=>state.db.query(...args)});await state.db.exec('COMMIT');return result; } catch(error) { await state.db.exec('ROLLBACK');throw error; } },
}));
import { endorsementState, endorsementSummary, submitEndorsement } from '../../src/services/endorsements.js';
const owner='10000000-0000-4000-8000-000000000001', borrower='10000000-0000-4000-8000-000000000002', stranger='10000000-0000-4000-8000-000000000003';
const exchange='20000000-0000-4000-8000-000000000001';
beforeAll(async () => {
  state.db=new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY); CREATE TABLE borrow_transactions(id UUID PRIMARY KEY,borrower_id UUID,lender_id UUID,status TEXT,payment_status TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
    INSERT INTO users VALUES('${owner}'),('${borrower}'),('${stranger}');`);
  await state.db.exec(await readFile(new URL('../../migrations/020_exchange_endorsements.sql',import.meta.url),'utf8'));
  await state.db.exec(await readFile(new URL('../../migrations/021_neutral_endorsements.sql',import.meta.url),'utf8'));
},15000);
afterAll(async()=>state.db.close());
it('applies votes immediately while keeping feedback participant-only and immutable', async()=>{
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'paid')",[exchange,borrower,owner]);
  expect((await submitEndorsement(exchange,owner,false)).status).toBe(409);
  await state.db.query("UPDATE borrow_transactions SET status='completed' WHERE id=$1",[exchange]);
  expect((await endorsementState(exchange,owner)).canRate).toBe(true);
  expect((await submitEndorsement(exchange,stranger,true)).status).toBe(404);
  expect(await submitEndorsement(exchange,owner,false)).toEqual({success:true});
  expect(await endorsementSummary(borrower)).toEqual({percent:0,count:1,score:63});
  expect((await endorsementState(exchange,borrower)).positive).toBeNull();
  expect(await submitEndorsement(exchange,borrower,true)).toEqual({success:true});
  expect(await endorsementSummary(owner)).toEqual({percent:100,count:1,score:79});
  expect(await endorsementSummary(borrower)).toEqual({percent:0,count:1,score:63});
  expect((await submitEndorsement(exchange,owner,true)).status).toBe(409);
  expect(await submitEndorsement(exchange,owner,false)).toEqual({success:true});
});
it('only accepted cancellations qualify and the submission deadline still applies', async()=>{
  const id='20000000-0000-4000-8000-000000000002';
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'pending')",[id,borrower,owner]);
  await state.db.query("UPDATE borrow_transactions SET status='cancelled' WHERE id=$1",[id]);
  expect((await endorsementState(id,owner)).canRate).toBe(false);
  await state.db.query("UPDATE borrow_transactions SET status='paid',accepted_at=NOW() WHERE id=$1",[id]);
  await state.db.query("UPDATE borrow_transactions SET status='cancelled' WHERE id=$1",[id]);
  expect(await submitEndorsement(id,owner,true)).toEqual({success:true});
  expect(await endorsementSummary(borrower)).toEqual({percent:50,count:2,score:68});
  // Advance the clock in stored state without triggering a new exchange window.
  await state.db.exec('ALTER TABLE borrow_transactions DISABLE TRIGGER start_exchange_endorsements');
  await state.db.query("UPDATE borrow_transactions SET endorsement_started_at=NOW()-INTERVAL '15 days' WHERE id=$1",[id]);
  await state.db.exec('ALTER TABLE borrow_transactions ENABLE TRIGGER start_exchange_endorsements');
  expect((await submitEndorsement(id,borrower,false)).status).toBe(409);
  expect(await endorsementSummary(borrower)).toEqual({percent:50,count:2,score:68});
});
it('records neutral feedback without changing either side of the percentage', async()=>{
  const id='20000000-0000-4000-8000-000000000003';
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'paid')",[id,borrower,stranger]);
  await state.db.query("UPDATE borrow_transactions SET status='completed' WHERE id=$1",[id]);
  const before = await endorsementSummary(borrower);
  expect(await submitEndorsement(id,stranger,null)).toEqual({success:true});
  expect(await endorsementSummary(borrower)).toEqual(before);
  expect(await submitEndorsement(id,borrower,null)).toEqual({success:true});
  expect(await endorsementSummary(stranger)).toEqual({percent:null,count:0,score:null});
  expect(await endorsementState(id,borrower)).toMatchObject({submitted:true,positive:null,canRate:false});
  expect(await submitEndorsement(id,borrower,null)).toEqual({success:true});
  expect((await submitEndorsement(id,borrower,true)).status).toBe(409);
  expect((await submitEndorsement(id,borrower,undefined)).status).toBe(400);
  expect((await submitEndorsement(id,borrower,'neutral')).status).toBe(400);
  // Reapplying the upgrade preserves both previous votes and neutral feedback.
  await state.db.exec(await readFile(new URL('../../migrations/021_neutral_endorsements.sql',import.meta.url),'utf8'));
  expect(await endorsementSummary(borrower)).toEqual(before);
  expect(await endorsementState(id,borrower)).toMatchObject({submitted:true,positive:null});
});
it.each([[2,0,82],[20,0,95],[45,5,89]])('scores %i positive and %i negative exchanges as %i',async(positive,negative,score)=>{
  const member=randomUUID();
  await state.db.query('INSERT INTO users(id) VALUES($1)',[member]);
  await state.db.query(`WITH exchanges AS (
    INSERT INTO borrow_transactions(id,borrower_id,lender_id,status,endorsement_started_at)
    SELECT gen_random_uuid(),$1,$2,'completed',NOW() FROM generate_series(1,$3::int) RETURNING id
  ) INSERT INTO exchange_endorsements(transaction_id,rater_id,ratee_id,positive)
    SELECT id,$2,$1,ROW_NUMBER() OVER() <= $4::int FROM exchanges`,[member,owner,positive+negative,positive]);
  expect(await endorsementSummary(member)).toMatchObject({count:positive+negative,score});
});
