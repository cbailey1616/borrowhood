import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db:null }));
vi.mock('../../src/utils/db.js', () => ({
  query: (...args) => state.db.query(...args),
  withTransaction: async fn => { await state.db.exec('BEGIN');try { const result=await fn({query:(...args)=>state.db.query(...args)});await state.db.exec('COMMIT');return result; } catch(error) { await state.db.exec('ROLLBACK');throw error; } },
}));
import { endorsementState, endorsementSummary, endorsementSummaries, submitEndorsement } from '../../src/services/endorsements.js';
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
  expect(await endorsementSummary(borrower)).toEqual({percent:0,count:1,score:null,completedCount:1});
  expect((await endorsementState(exchange,borrower)).positive).toBeNull();
  expect(await submitEndorsement(exchange,borrower,true)).toEqual({success:true});
  expect(await endorsementSummary(owner)).toEqual({percent:100,count:1,score:null,completedCount:1});
  expect(await endorsementSummary(borrower)).toEqual({percent:0,count:1,score:null,completedCount:1});
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
  expect(await endorsementSummary(borrower)).toEqual({percent:50,count:2,score:null,completedCount:1});
  // Advance the clock in stored state without triggering a new exchange window.
  await state.db.exec('ALTER TABLE borrow_transactions DISABLE TRIGGER start_exchange_endorsements');
  await state.db.query("UPDATE borrow_transactions SET endorsement_started_at=NOW()-INTERVAL '15 days' WHERE id=$1",[id]);
  await state.db.exec('ALTER TABLE borrow_transactions ENABLE TRIGGER start_exchange_endorsements');
  expect((await submitEndorsement(id,borrower,false)).status).toBe(409);
  expect(await endorsementSummary(borrower)).toEqual({percent:50,count:2,score:null,completedCount:1});
});
it('records neutral feedback without changing either side of the percentage', async()=>{
  const id='20000000-0000-4000-8000-000000000003';
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'paid')",[id,borrower,stranger]);
  await state.db.query("UPDATE borrow_transactions SET status='completed' WHERE id=$1",[id]);
  const before = await endorsementSummary(borrower);
  expect(await submitEndorsement(id,stranger,null)).toEqual({success:true});
  expect(await endorsementSummary(borrower)).toEqual(before);
  expect(await submitEndorsement(id,borrower,null)).toEqual({success:true});
  expect(await endorsementSummary(stranger)).toEqual({percent:null,count:0,score:null,completedCount:1});
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
it.each([[2,0,null],[3,0,84],[5,0,90],[8,0,99],[9,0,100],[3,3,75],[0,3,66],[0,5,60],[0,6,57],[0,30,0]])('scores %i positive and %i negative exchanges as %s',async(positive,negative,score)=>{
  const member=randomUUID();
  await state.db.query('INSERT INTO users(id) VALUES($1)',[member]);
  await state.db.query(`WITH exchanges AS (
    INSERT INTO borrow_transactions(id,borrower_id,lender_id,status,endorsement_started_at)
    SELECT gen_random_uuid(),$1,$2,'completed',NOW() FROM generate_series(1,$3::int) RETURNING id
  ) INSERT INTO exchange_endorsements(transaction_id,rater_id,ratee_id,positive)
    SELECT id,$2,$1,ROW_NUMBER() OVER() <= $4::int FROM exchanges`,[member,owner,positive+negative,positive]);
  expect(await endorsementSummary(member)).toMatchObject({count:positive+negative,score,completedCount:positive+negative});
});

async function completedHistory(count, role = 'borrower') {
  const member = randomUUID();
  await state.db.query('INSERT INTO users(id) VALUES($1)', [member]);
  const { rows } = await state.db.query(`INSERT INTO borrow_transactions(id,borrower_id,lender_id,status,endorsement_started_at)
    SELECT gen_random_uuid(),$1,$2,'completed',NOW() FROM generate_series(1,$3::int) RETURNING id`,
  role === 'borrower' ? [member, owner, count] : [owner, member, count]);
  return { member, ids: rows.map(row => row.id) };
}

it.each([[0,null],[1,null],[2,null],[3,78],[4,79],[14,89],[40,89]])
  ('unlocks after three completed exchanges and caps %i unrated exchanges at Good', async (count, score) => {
    const { member } = await completedHistory(count);
    expect(await endorsementSummary(member)).toEqual({ percent: null, count: 0, score, completedCount: count });
  });

it.each(['borrower','lender'])('replaces the initial activity point with +3 or -3 for the %s', async role => {
  const { member, ids } = await completedHistory(3, role);
  expect((await endorsementSummary(member)).score).toBe(78);
  expect(await submitEndorsement(ids[0], owner, true)).toEqual({ success: true });
  expect((await endorsementSummary(member)).score).toBe(80);
  expect(await submitEndorsement(ids[1], owner, false)).toEqual({ success: true });
  expect((await endorsementSummary(member)).score).toBe(76);
  expect(await submitEndorsement(ids[2], owner, null)).toEqual({ success: true });
  expect((await endorsementSummary(member)).score).toBe(76);
  expect(await submitEndorsement(ids[1], owner, false)).toEqual({ success: true });
  expect((await endorsementSummary(member)).score).toBe(76);
});

it('does not award extra points for the other participant submitting feedback', async () => {
  const { member, ids } = await completedHistory(3);
  const before = await endorsementSummary(member);
  await submitEndorsement(ids[0], member, true);
  expect(await endorsementSummary(member)).toEqual(before);
});

it('counts returned and completed once, never pending, disputed, cancelled, or payment-authorized exchanges', async () => {
  const { member, ids } = await completedHistory(2);
  const id = randomUUID();
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$3,'pending')", [id, member, owner]);
  for (const status of ['pending','approved','picked_up','return_pending','disputed','cancelled']) {
    await state.db.query('UPDATE borrow_transactions SET status=$2 WHERE id=$1', [id, status]);
    expect(await endorsementSummary(member)).toMatchObject({ score: null, completedCount: 2 });
  }
  await state.db.query("UPDATE borrow_transactions SET status='returned',payment_status='authorized' WHERE id=$1", [id]);
  expect(await endorsementSummary(member)).toMatchObject({ score: null, completedCount: 2 });
  await state.db.query('UPDATE borrow_transactions SET payment_status=NULL WHERE id=$1', [id]);
  expect(await endorsementSummary(member)).toMatchObject({ score: 78, completedCount: 3 });
  await state.db.query("UPDATE borrow_transactions SET status='completed' WHERE id=$1", [id]);
  expect(await endorsementSummary(member)).toMatchObject({ score: 78, completedCount: 3 });
  await submitEndorsement(ids[0], owner, true);
  expect(await endorsementSummary(member)).toMatchObject({ score: 80, completedCount: 3 });
});

it('preserves accepted-cancellation feedback without awarding completion points or advancing graduation', async () => {
  const { member } = await completedHistory(3);
  const id = randomUUID();
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status,accepted_at,endorsement_started_at) VALUES($1,$2,$3,'cancelled',NOW(),NOW())", [id, member, owner]);
  expect(await endorsementSummary(member)).toMatchObject({ score: 78, completedCount: 3 });
  await submitEndorsement(id, owner, false);
  expect(await endorsementSummary(member)).toMatchObject({ score: 75, completedCount: 3 });
});

it('never rewards an exchange with oneself or a vote from a nonparticipant', async () => {
  const { member, ids } = await completedHistory(3);
  const before = await endorsementSummary(member);
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status) VALUES($1,$2,$2,'completed')", [randomUUID(), member]);
  await state.db.query('INSERT INTO exchange_endorsements(transaction_id,rater_id,ratee_id,positive) VALUES($1,$2,$3,true)', [ids[0], stranger, member]);
  expect(await endorsementSummary(member)).toEqual(before);
});

it('batches distinct feed authors and matches their profile summaries, including both sides of an exchange', async () => {
  const first = await completedHistory(3);
  const second = await completedHistory(2, 'lender');
  const newcomer = randomUUID();
  await state.db.query('INSERT INTO users(id) VALUES($1)', [newcomer]);
  const sharedExchange = randomUUID();
  await state.db.query("INSERT INTO borrow_transactions(id,borrower_id,lender_id,status,endorsement_started_at) VALUES($1,$2,$3,'completed',NOW())", [sharedExchange, first.member, second.member]);
  await submitEndorsement(sharedExchange, first.member, true);
  await submitEndorsement(sharedExchange, second.member, false);
  const runQuery = vi.fn((...args) => state.db.query(...args));
  const summaries = await endorsementSummaries([first.member, second.member, first.member, newcomer], runQuery);
  expect(runQuery).toHaveBeenCalledTimes(1);
  expect(summaries.size).toBe(3);
  expect(summaries.get(first.member)).toEqual({ percent: 0, count: 1, score: 75, completedCount: 4 });
  expect(summaries.get(second.member)).toEqual({ percent: 100, count: 1, score: 80, completedCount: 3 });
  expect(summaries.get(newcomer)).toEqual({ percent: null, count: 0, score: null, completedCount: 0 });
  for (const [id, summary] of summaries) expect(summary).toEqual(await endorsementSummary(id));
});

it('does not query ratings when the feed has no visible authors', async () => {
  const runQuery = vi.fn();
  expect(await endorsementSummaries([], runQuery)).toEqual(new Map());
  expect(await endorsementSummaries([null, undefined], runQuery)).toEqual(new Map());
  expect(runQuery).not.toHaveBeenCalled();
});
