import { exchangeReportSummarySql } from '../../src/services/exchangeReportSummary.js';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args),
  withTransaction: fn => state.db.transaction(db => fn({ query: (sql, params) => params ? db.query(sql, params) : db.exec(sql) })) }));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn(async (user, type, data, { runQuery }) => {
  await runQuery('INSERT INTO notices(user_id,transaction_id,type) VALUES($1,$2,$3)', [user, data.transactionId, type]); return 'saved';
}) }));
import { reportExchangeIssue } from '../../src/services/exchangeIssues.js';
import { ensureReturnRecoverySchema, returnHelp } from '../../src/services/returnRecovery.js';
import { privatePhotoUrl } from '../../src/services/privatePhotos.js';
import returnRoutes from '../../src/routes/returnRecovery.js';

let owner, borrower, outsider;
const app = express(); app.use(express.json()); app.use('/return-help', returnRoutes);
const rows = async (sql, params) => (await state.db.query(sql, params)).rows;
const seed = async (status = 'picked_up', type = 'lend') => {
  const id = randomUUID();
  await state.db.query('INSERT INTO listings(id,owner_id,listing_type) VALUES($1,$2,$3)', [id, owner, type]);
  await state.db.query(`INSERT INTO borrow_transactions(id,listing_id,lender_id,borrower_id,status,actual_pickup_at,requested_end_date)
    VALUES($1,$1,$2,$3,$4,NOW()-INTERVAL '7 days',CURRENT_DATE-2)`, [id, owner, borrower, status]);
  return id;
};
const photo = user => `https://borrowhood-uploads.s3.us-east-1.amazonaws.com/listings/${user}/damage.jpg`;
const token = user => jwt.sign({ userId: user }, process.env.JWT_SECRET);
const post = (id, user = owner) => request(app).post(`/return-help/exchange/${id}/issue`).set('Authorization', `Bearer ${token(user)}`);

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', 'isolated-exchange-report-test-key');
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,email TEXT,first_name TEXT DEFAULT 'Neighbor',last_name TEXT,display_name TEXT,
    status TEXT DEFAULT 'verified',is_admin BOOLEAN DEFAULT false,token_invalidated_at TIMESTAMPTZ);
    CREATE TABLE listings(id UUID PRIMARY KEY,owner_id UUID,listing_type TEXT DEFAULT 'lend',title TEXT DEFAULT 'Pressure washer');
    CREATE TABLE listing_photos(listing_id UUID,url TEXT);
    CREATE TABLE borrow_transactions(id UUID PRIMARY KEY,listing_id UUID REFERENCES listings(id),lender_id UUID REFERENCES users(id),borrower_id UUID REFERENCES users(id),
      status TEXT,actual_pickup_at TIMESTAMPTZ,actual_return_at TIMESTAMPTZ,requested_end_date DATE);
    CREATE TABLE safety_reports(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),reporter_id UUID REFERENCES users(id),reported_id UUID REFERENCES users(id),
      reason TEXT,status TEXT DEFAULT 'open',created_at TIMESTAMPTZ DEFAULT NOW(),content_type TEXT,content_id UUID,content_snapshot JSONB);
    CREATE TABLE notices(user_id UUID,transaction_id UUID,type TEXT);`);
  await ensureReturnRecoverySchema(); await ensureReturnRecoverySchema();
}, 15000);
afterAll(async () => { await state.db.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  vi.clearAllMocks(); await state.db.exec('TRUNCATE users,listings,listing_photos,borrow_transactions,safety_reports,return_reports,borrowing_restrictions,return_review_actions,notices CASCADE');
  owner = randomUUID(); borrower = randomUUID(); outsider = randomUUID();
  for (const user of [owner, borrower, outsider]) await state.db.query('INSERT INTO users(id,email) VALUES($1,$2)', [user, `${user}@example.test`]);
});

it('stores a damage report and evidence for account moderation without changing account access', async () => {
  const id = await seed('return_pending');
  const report = await reportExchangeIssue(id, owner, { reason: 'damage', detail: '  The hose is split.  ', photos: [photo(owner)] });
  const [saved] = await rows('SELECT * FROM safety_reports');
  expect(saved).toMatchObject({ id: report.id, reporter_id: owner, reported_id: borrower, reason: 'Item was damaged', content_id: id, content_type: 'exchange', status: 'open' });
  expect(saved.content_snapshot).toMatchObject({ title: 'Pressure washer', content: 'The hose is split.', photos: [photo(owner)], reporterRole: 'owner', transactionId: id });
  expect(await rows('SELECT * FROM return_reports')).toHaveLength(0);
  expect(await rows('SELECT * FROM borrowing_restrictions')).toHaveLength(0);
  expect((await rows('SELECT status FROM users WHERE id=$1', [borrower]))[0].status).toBe('verified');
  expect((await rows('SELECT status FROM borrow_transactions WHERE id=$1', [id]))[0].status).toBe('return_pending');
});
it('records a borrower’s damage disclosure as their own report, without accusing the owner', async () => {
  await reportExchangeIssue(await seed(), borrower, { reason: 'damage' });
  const [saved] = await rows('SELECT * FROM safety_reports');
  expect(saved.reporter_id).toBe(borrower); expect(saved.reported_id).toBe(borrower);
  expect(saved.content_snapshot).toMatchObject({ reporterRole: 'borrower', content: 'Item was damaged.' });
});
it('retries a damage report without duplicating the incident', async () => {
  const id = await seed();
  const first = await reportExchangeIssue(id, owner, { reason: 'damage' });
  expect(await reportExchangeIssue(id, owner, { reason: 'damage' })).toEqual({ id: first.id, alreadyReported: true });
  expect(await rows('SELECT * FROM safety_reports')).toHaveLength(1);
});
it('uses the existing non-return review rules and preserves private evidence', async () => {
  const id = await seed();
  const first = await reportExchangeIssue(id, owner, { reason: 'non_return', photos: [privatePhotoUrl(photo(owner), owner)] });
  expect(await reportExchangeIssue(id, owner, { reason: 'non_return' })).toEqual({ id: first.id, alreadyReported: true });
  const [saved] = await rows('SELECT * FROM return_reports');
  expect(saved).toMatchObject({ owner_id: owner, borrower_id: borrower, status: 'open', detail: 'Item wasn’t returned.', photos: [photo(owner)] });
  expect(saved.response_due_at - saved.created_at).toBe(48 * 3600000);
  expect((await returnHelp(owner, false, 1, id)).reports[0].photos).toEqual([photo(owner)]);
  expect((await returnHelp(outsider)).reports).toHaveLength(0);
  expect(await rows('SELECT * FROM borrowing_restrictions')).toHaveLength(0);
});
it('rejects outsiders and non-return reports from borrowers', async () => {
  const id = await seed();
  await expect(reportExchangeIssue(id, outsider, { reason: 'damage' })).rejects.toMatchObject({ status: 404 });
  await expect(reportExchangeIssue(id, borrower, { reason: 'non_return' })).rejects.toMatchObject({ status: 403 });
  expect(await rows('SELECT * FROM safety_reports')).toHaveLength(0);
  expect(await rows('SELECT * FROM return_reports')).toHaveLength(0);
});
it('rejects non-return before the agreed deadline but permits reporting damage', async () => {
  const id = await seed(); await state.db.query('UPDATE borrow_transactions SET requested_end_date=CURRENT_DATE+1 WHERE id=$1', [id]);
  await expect(reportExchangeIssue(id, owner, { reason: 'non_return' })).rejects.toMatchObject({ status: 409 });
  expect(await reportExchangeIssue(id, owner, { reason: 'damage' })).toHaveProperty('id');
});
it.each(['pending','approved','completed','cancelled'])('rejects damage reports for %s exchanges', async status => {
  await expect(reportExchangeIssue(await seed(status), owner, { reason: 'damage' })).rejects.toMatchObject({ status: 409 });
});
it.each(['sell','giveaway'])('rejects return reports on a %s', async type => {
  const id = await seed('picked_up', type);
  for (const reason of ['damage','non_return']) await expect(reportExchangeIssue(id, owner, { reason })).rejects.toMatchObject({ status: 409 });
});
it('rejects photos uploaded by someone else and unmanaged URLs', async () => {
  const id = await seed();
  for (const url of [photo(borrower), 'https://example.test/other.jpg'])
    await expect(reportExchangeIssue(id, owner, { reason: 'damage', photos: [url] })).rejects.toMatchObject({ status: 400 });
  expect(await rows('SELECT * FROM safety_reports')).toHaveLength(0);
});
it('exposes authenticated issue reporting with optional details and rejects malformed reasons', async () => {
  const id = await seed();
  const good = await post(id).send({ reason: 'damage', detail: '', photos: [] });
  expect(good.status).toBe(200); expect(good.body).toHaveProperty('id');
  expect((await post(id).send({ reason: 'payment_claim' })).status).toBe(400);
  expect((await post(id).send({ reason: 'damage', photos: Array(6).fill(photo(owner)) })).status).toBe(400);
  expect((await post(id).send({ reason: 'damage', detail: 'x'.repeat(2001) })).status).toBe(400);
  expect((await request(app).post(`/return-help/exchange/${id}/issue`).send({ reason: 'damage' })).status).toBe(401);
});

it('exposes non-return summaries to both participants but keeps damage summaries private to the author', async () => {
  const id=await seed();
  await reportExchangeIssue(id,owner,{reason:'non_return'});
  await reportExchangeIssue(id,owner,{reason:'damage',detail:'Private evidence'});
  const summary=async viewer => (await rows(`SELECT ${exchangeReportSummarySql('$2')} FROM borrow_transactions t WHERE t.id=$1 AND (t.lender_id=$2 OR t.borrower_id=$2)`,[id,viewer]))[0]?.issue_reports;
  expect(await summary(owner)).toEqual(expect.arrayContaining([
    expect.objectContaining({reason:'non_return',reportedByMe:true,status:'open'}),
    expect.objectContaining({reason:'damage',reportedByMe:true,status:'open'})]));
  expect(await summary(borrower)).toEqual([expect.objectContaining({reason:'non_return',reportedByMe:false})]);
  expect(await summary(outsider)).toBeUndefined();
  expect(JSON.stringify(await summary(owner))).not.toContain('Private evidence');
  await state.db.query('UPDATE borrow_transactions SET actual_return_at=NOW() WHERE id=$1',[id]);
  expect((await summary(owner)).find(r=>r.reason==='non_return').resolved).toBe(true);
});
