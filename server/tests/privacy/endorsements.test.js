import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
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
},15000);
afterAll(async()=>state.db.close());
it('keeps unilateral votes private, prevents retaliation edits, and reveals both percentages together', async()=>{
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'paid')",[exchange,borrower,owner]);
  expect((await submitEndorsement(exchange,owner,false)).status).toBe(409);
  await state.db.query("UPDATE borrow_transactions SET status='completed' WHERE id=$1",[exchange]);
  expect((await endorsementState(exchange,owner)).canRate).toBe(true);
  expect((await submitEndorsement(exchange,stranger,true)).status).toBe(404);
  expect(await submitEndorsement(exchange,owner,false)).toEqual({success:true});
  expect(await endorsementSummary(borrower)).toEqual({percent:null,count:0});
  expect((await endorsementState(exchange,borrower)).positive).toBeNull();
  expect(await submitEndorsement(exchange,borrower,true)).toEqual({success:true});
  expect(await endorsementSummary(owner)).toEqual({percent:100,count:1});
  expect(await endorsementSummary(borrower)).toEqual({percent:0,count:1});
  expect((await submitEndorsement(exchange,owner,true)).status).toBe(409);
  expect(await submitEndorsement(exchange,owner,false)).toEqual({success:true});
});
it('only accepted cancellations qualify and unpaired votes count when the window closes', async()=>{
  const id='20000000-0000-4000-8000-000000000002';
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'pending')",[id,borrower,owner]);
  await state.db.query("UPDATE borrow_transactions SET status='cancelled' WHERE id=$1",[id]);
  expect((await endorsementState(id,owner)).canRate).toBe(false);
  await state.db.query("UPDATE borrow_transactions SET status='paid',accepted_at=NOW() WHERE id=$1",[id]);
  await state.db.query("UPDATE borrow_transactions SET status='cancelled' WHERE id=$1",[id]);
  expect(await submitEndorsement(id,owner,true)).toEqual({success:true});
  // Advance the clock in stored state without triggering a new exchange window.
  await state.db.exec('ALTER TABLE borrow_transactions DISABLE TRIGGER start_exchange_endorsements');
  await state.db.query("UPDATE borrow_transactions SET endorsement_started_at=NOW()-INTERVAL '15 days' WHERE id=$1",[id]);
  await state.db.exec('ALTER TABLE borrow_transactions ENABLE TRIGGER start_exchange_endorsements');
  expect((await submitEndorsement(id,borrower,false)).status).toBe(409);
  expect(await endorsementSummary(borrower)).toEqual({percent:50,count:2});
});
