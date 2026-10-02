import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args) }));
import adminReports from '../../src/routes/adminReports.js';
const app = express(); app.use('/reports', adminReports);
let staff, reporter, target;
const get = (params = '', user = staff) => request(app).get(`/reports${params}`)
  .set('Authorization', `Bearer ${jwt.sign({ userId: user }, 'isolated-admin-report-test-key')}`);
const addReturn = async ({ status = 'open', appealStatus = null, response = null, hours = 24, resolved = false } = {}) => {
  const transactionId = randomUUID(), id = randomUUID();
  await state.db.query("INSERT INTO listings(id,title) VALUES($1,'Ladder')", [transactionId]);
  await state.db.query('INSERT INTO borrow_transactions(id,listing_id) VALUES($1,$1)', [transactionId]);
  await state.db.query(`INSERT INTO return_reports(id,transaction_id,owner_id,borrower_id,detail,status,appeal_status,response,
    response_due_at,resolved_at,photos) VALUES($1,$2,$3,$4,'Still missing',$5,$6,$7,
    NOW()+($8::int*INTERVAL '1 hour'),CASE WHEN $9 THEN NOW() END,ARRAY['private-photo'])`,
  [id, transactionId, reporter, target, status, appealStatus, response, hours, resolved]);
  return id;
};
const addSafety = async (type = null, status = 'open') => {
  const id = randomUUID();
  await state.db.query(`INSERT INTO safety_reports(id,reporter_id,reported_id,reason,status,content_type,content_snapshot)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, reporter, target, type === 'exchange' ? 'Item was damaged' : 'Harassment', status, type,
    JSON.stringify({ title: 'Pressure washer', content: 'Hose is split.', photos: ['private-photo'], reporterRole: 'borrower' })]);
  return id;
};
beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', 'isolated-admin-report-test-key');
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,email TEXT,first_name TEXT,last_name TEXT,display_name TEXT,
    status TEXT DEFAULT 'verified',is_admin BOOLEAN DEFAULT false,token_invalidated_at TIMESTAMPTZ,password_hash TEXT);
    CREATE TABLE listings(id UUID PRIMARY KEY,title TEXT);
    CREATE TABLE borrow_transactions(id UUID PRIMARY KEY,listing_id UUID);
    CREATE TABLE return_reports(id UUID PRIMARY KEY,transaction_id UUID,owner_id UUID,borrower_id UUID,
      detail TEXT,status TEXT DEFAULT 'open',appeal_status TEXT,response TEXT,response_due_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,photos TEXT[] DEFAULT '{}',created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE safety_reports(id UUID PRIMARY KEY,reporter_id UUID,reported_id UUID,reason TEXT,
      status TEXT DEFAULT 'open',content_type TEXT,content_snapshot JSONB,created_at TIMESTAMPTZ DEFAULT NOW());`);
}, 20000);
afterAll(async () => { await state.db?.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  await state.db.exec('TRUNCATE users,listings,borrow_transactions,return_reports,safety_reports');
  [staff, reporter, target] = [randomUUID(), randomUUID(), randomUUID()];
  for (const [id, name] of [[staff, 'Staff'], [reporter, 'Sam'], [target, 'Alex']])
    await state.db.query(`INSERT INTO users(id,email,first_name,is_admin,password_hash) VALUES($1,$2,$3,$4,'secret-credential')`,
      [id, `${name}@example.test`, name, id === staff]);
});

it('requires authenticated admin access before exposing any report or counts', async () => {
  await addReturn(); await addSafety('exchange');
  expect((await request(app).get('/reports')).status).toBe(401);
  const denied = await get('', reporter);
  expect(denied.status).toBe(403);
  expect(JSON.stringify(denied.body)).not.toMatch(/Ladder|Alex|Still missing|counts/);
});
it('combines both report sources with exact counts, prioritizing appeals and ready reports', async () => {
  const appeal = await addReturn({ status: 'confirmed', appealStatus: 'pending' });
  const waiting = await addReturn();
  await addReturn({ hours: -1 }); await addReturn({ response: 'I returned it.' });
  await addReturn({ status: 'confirmed' }); await addReturn({ status: 'dismissed' });
  const damage = await addSafety('exchange'); await addSafety('exchange', 'reviewed');
  await addSafety(); await addSafety(null, 'dismissed');
  const res = await get();
  expect(res.status).toBe(200);
  expect(res.body.counts).toEqual({ total: 10, ready: 4, waiting: 1, appeals: 1, reviewed: 4 });
  expect(res.body.reports).toHaveLength(6);
  expect(res.body.reports[0]).toMatchObject({ id: appeal, queueStatus: 'appeal', source: 'return' });
  expect(res.body.reports.at(-1)).toMatchObject({ id: waiting, queueStatus: 'waiting' });
  expect(res.body.reports.find(r => r.id === damage)).toMatchObject({ issue: 'damage', source: 'safety', reporterRole: 'borrower', photoCount: 1 });
  expect(JSON.stringify(res.body)).not.toMatch(/secret-credential|password|email|token|private-photo/);
  expect((await state.db.query('SELECT DISTINCT status FROM users')).rows).toEqual([{ status: 'verified' }]);
});
it('filters issue types and reviewed reports without hiding appeals in history', async () => {
  const damage = await addSafety('exchange');
  const reviewedDamage = await addSafety('exchange', 'dismissed');
  const appeal = await addReturn({ status: 'confirmed', appealStatus: 'pending' });
  await addSafety();
  const pending = await get('?issue=damage');
  expect(pending.body.reports.map(r => r.id)).toEqual([damage]);
  expect(pending.body.counts).toMatchObject({ total: 2, ready: 1, reviewed: 1 });
  const reviewed = await get('?issue=damage&state=reviewed');
  expect(reviewed.body.reports.map(r => r.id)).toEqual([reviewedDamage]);
  expect((await get('?issue=non_return&state=reviewed')).body.reports).toEqual([]);
  expect((await get('?issue=non_return')).body.reports.map(r => r.id)).toEqual([appeal]);
  expect((await get('?state=all')).body.reports).toHaveLength(4);
});
it('keeps unresolved response periods separate and exposes returned reports for dismissal', async () => {
  const waiting = await addReturn();
  const returned = await addReturn({ resolved: true });
  expect((await get()).body.reports.find(r => r.id === returned)).toMatchObject({ queueStatus: 'ready', returnResolved: true });
  expect((await get()).body.counts).toMatchObject({ ready: 1, waiting: 1 });
  await state.db.query("UPDATE return_reports SET response_due_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [waiting]);
  expect((await get()).body.counts).toMatchObject({ ready: 2, waiting: 0 });
});
it('paginates across queues without truncating counts to the visible page', async () => {
  await addReturn({ hours: -1 });
  await state.db.query(`INSERT INTO safety_reports(id,reporter_id,reported_id,reason)
    SELECT gen_random_uuid(),$1,$2,'Report '||n FROM generate_series(1,27) n`, [reporter, target]);
  const first = (await get()).body, second = (await get('?page=2')).body;
  expect(first.reports).toHaveLength(25); expect(first.hasMore).toBe(true);
  expect(second.reports).toHaveLength(3); expect(second.hasMore).toBe(false);
  expect(first.counts.total).toBe(28); expect(second.counts.total).toBe(28);
  expect(new Set([...first.reports, ...second.reports].map(r => `${r.source}:${r.id}`)).size).toBe(28);
});
it('preserves report visibility when the reporter or reported account is deleted', async () => {
  await addReturn(); await addSafety('exchange');
  await state.db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[reporter, target]]);
  const res = await get();
  expect(res.status).toBe(200); expect(res.body.reports).toHaveLength(2);
  for (const row of res.body.reports) expect(row).toMatchObject({ reporterName: 'Deleted account', reportedName: 'Deleted account', accountStatus: null });
});
it('rejects invalid filters and page values before querying report data', async () => {
  for (const params of ['?issue=dispute', '?state=anything', '?page=0', '?page=1.5', '?page=10001', '?issue=damage%27'])
    expect((await get(params)).status).toBe(400);
});
