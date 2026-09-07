import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args), withTransaction: fn => state.db.transaction(fn) }));
import { ensureSafetyReviewSchema } from '../../src/services/safetyReview.js';
import safety from '../../src/routes/safety.js';
import admin from '../../src/routes/safetyAdmin.js';
import { authenticate } from '../../src/middleware/auth.js';
let app, staff, reporter, target, reportId;
const token = user => jwt.sign({ userId: user.id }, 'safety-test-secret', { expiresIn: '1h' });
const staffRequest = (method, path) => request(app)[method](`/admin${path}`).set('Authorization', `Bearer ${token(staff)}`);
const review = (action, version = 0, note = 'Reviewed the report.') => staffRequest('post', `/${reportId}/review`).send({ action, version, note });
beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', 'safety-test-secret');
  state.db = new PGlite();
  await state.db.exec(`CREATE TYPE user_status AS ENUM ('pending','verified','suspended');
    CREATE TABLE users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, first_name TEXT, last_name TEXT,
      display_name TEXT, status user_status DEFAULT 'pending', is_admin BOOLEAN DEFAULT false,
      is_verified BOOLEAN DEFAULT false, token_invalidated_at TIMESTAMPTZ);
    CREATE TABLE safety_reports(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id UUID REFERENCES users(id),
      reported_id UUID REFERENCES users(id), reason TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE user_blocks(user_id UUID REFERENCES users(id) ON DELETE CASCADE, blocked_id UUID REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(user_id,blocked_id));
    CREATE TABLE borrow_transactions(borrower_id UUID, lender_id UUID, status TEXT);`);
  await ensureSafetyReviewSchema(); await ensureSafetyReviewSchema();
  app = express(); app.use(express.json()); app.use('/safety', safety); app.use('/admin', admin);
  app.get('/me', authenticate, (req,res) => res.json({ id: req.user.id }));
}, 20000);
afterAll(async () => { await state.db?.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  await state.db.exec('TRUNCATE users, safety_reports, safety_review_actions, user_blocks, borrow_transactions CASCADE');
  const users = (await state.db.query(`INSERT INTO users(email,first_name,is_admin) VALUES
    ('staff@example.test','Staff',true),('reporter@example.test','Reporter',false),('target@example.test','Target',false) RETURNING *`)).rows;
  [staff, reporter, target] = users;
  reportId = (await state.db.query(`INSERT INTO safety_reports(reporter_id,reported_id,reason) VALUES($1,$2,'Harassment') RETURNING id`, [reporter.id,target.id])).rows[0].id;
});
it('requires authentication and administrator access for both reading and changing reports', async () => {
  expect((await request(app).get('/admin')).status).toBe(401);
  for (const method of ['get','post']) {
    const res = await request(app)[method](method === 'get' ? '/admin' : `/admin/${reportId}/review`).set('Authorization', `Bearer ${token(reporter)}`).send({ action:'suspend',version:0,note:'Not an admin' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('Target');
  }
  expect((await state.db.query('SELECT status FROM users WHERE id=$1',[target.id])).rows[0].status).toBe('pending');
});
it('shows existing database reports without exposing credentials or unrelated messages', async () => {
  const res = await staffRequest('get','');
  expect(res.status).toBe(200); expect(res.body.reports).toHaveLength(1);
  expect(res.body.reports[0]).toMatchObject({ reportedName:'Target',reporterName:'Reporter',reason:'Harassment',status:'open',version:0,reportCount:1,history:[] });
  expect(JSON.stringify(res.body)).not.toMatch(/password|token|email|message_content/);
});
it('accepts a member report without suspending or personally blocking anyone', async () => {
  const res = await request(app).post(`/safety/${target.id}/report`).set('Authorization',`Bearer ${token(reporter)}`).send({ reason:'Inappropriate content' });
  expect(res.status).toBe(200);
  expect((await staffRequest('get','')).body.reports).toHaveLength(2);
  expect((await state.db.query('SELECT status FROM users WHERE id=$1',[target.id])).rows[0].status).toBe('pending');
  expect((await state.db.query('SELECT * FROM user_blocks')).rows).toHaveLength(0);
});
it('records dismissal and reopening with the administrator and note, preserving history', async () => {
  expect((await review('dismiss')).status).toBe(200);
  expect((await staffRequest('get','')).body.reports).toHaveLength(0);
  const closed = (await staffRequest('get','?status=all')).body.reports[0];
  expect(closed.history[0]).toMatchObject({ action:'dismiss',note:'Reviewed the report.',adminName:'Staff' });
  expect((await review('reopen',1,'Needs follow-up.')).status).toBe(200);
  expect((await staffRequest('get','')).body.reports[0].history).toHaveLength(2);
});
it('suspends the account on explicit review, blocks existing API sessions, and restores without verification escalation', async () => {
  expect((await review('suspend')).status).toBe(200);
  const denied = await request(app).get('/me').set('Authorization',`Bearer ${token(target)}`);
  expect(denied.status).toBe(403); expect(denied.body.code).toBe('ACCOUNT_SUSPENDED');
  expect((await staffRequest('get','?status=all')).body.reports[0].canRestore).toBe(true);
  expect((await review('restore',1,'Suspension appealed and reviewed.')).status).toBe(200);
  const restored = (await state.db.query('SELECT * FROM users WHERE id=$1',[target.id])).rows[0];
  expect(restored.status).toBe('pending'); expect(restored.is_verified).toBe(false); expect(restored.moderation_suspended_at).toBeNull();
});
it('rejects stale decisions without duplicating actions or changing the account', async () => {
  expect((await review('dismiss')).status).toBe(200);
  expect((await review('suspend')).status).toBe(409);
  expect((await state.db.query('SELECT * FROM safety_review_actions')).rows).toHaveLength(1);
  expect((await state.db.query('SELECT status FROM users WHERE id=$1',[target.id])).rows[0].status).toBe('pending');
});
it('cannot suspend a staff account, including the current administrator', async () => {
  await state.db.query('UPDATE safety_reports SET reported_id=$1 WHERE id=$2',[staff.id,reportId]);
  expect((await review('suspend')).status).toBe(403);
  expect((await state.db.query('SELECT * FROM safety_review_actions')).rows).toHaveLength(0);
});
it('cannot restore unrelated suspensions or anonymized deleted accounts', async () => {
  await state.db.query("UPDATE users SET status='suspended' WHERE id=$1",[target.id]);
  expect((await review('restore')).status).toBe(409);
  await state.db.query("UPDATE users SET moderation_suspended_at=NOW(), email='deleted_test@deleted.borrowhood.com' WHERE id=$1",[target.id]);
  expect((await review('restore')).status).toBe(409);
});
it('preserves reports when a member deletes their account without leaving a blocking foreign key', async () => {
  await state.db.query('DELETE FROM users WHERE id=$1',[reporter.id]);
  await state.db.query('DELETE FROM users WHERE id=$1',[target.id]);
  const row = (await staffRequest('get','')).body.reports[0];
  expect(row.reporterId).toBeNull(); expect(row.reportedId).toBeNull(); expect(row.reportedName).toBe('Deleted account');
  expect((await review('suspend')).status).toBe(409);
  expect((await review('dismiss')).status).toBe(200);
});
it('validates filters, IDs, decisions and notes before applying changes', async () => {
  expect((await staffRequest('get','?page=-1')).status).toBe(400);
  expect((await staffRequest('get','?status=anything')).status).toBe(400);
  expect((await review('delete')).status).toBe(400);
  expect((await review('suspend',0,'')).status).toBe(400);
  expect((await staffRequest('post','/bad-id/review').send({action:'suspend',version:0,note:'Test'})).status).toBe(400);
  expect((await state.db.query('SELECT * FROM safety_review_actions')).rows).toHaveLength(0);
});
