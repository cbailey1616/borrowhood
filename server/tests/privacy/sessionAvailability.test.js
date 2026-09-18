import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../src/utils/db.js', () => ({ query: vi.fn() }));
import { query } from '../../src/utils/db.js';
import { authenticate } from '../../src/middleware/auth.js';

const app = express();
app.get('/account', authenticate, (req, res) => res.json({ id: req.user.id }));
const account = { id: 'test-account', status: 'pending', is_admin: false };
const token = () => jwt.sign({ userId: account.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
const getAccount = accessToken => request(app).get('/account').set('Authorization', `Bearer ${accessToken || token()}`);

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', 'local-session-availability-test-secret');
  query.mockReset();
  query.mockResolvedValue({ rows: [account] });
});
afterEach(() => vi.unstubAllEnvs());

it.each(['ECONNREFUSED', '57014', '53300'])('retains a valid session when the database is unavailable (%s)', async code => {
  const accessToken = token();
  query.mockRejectedValueOnce(Object.assign(new Error('temporary database failure'), { code }));
  const failed = await getAccount(accessToken);
  expect(failed.status).toBe(503);
  expect(failed.body.code).toBe('AUTH_UNAVAILABLE');
  expect(JSON.stringify(failed.body)).not.toContain('temporary database failure');
  expect(query).toHaveBeenCalledTimes(1);
  const retry = await getAccount(accessToken);
  expect(retry.status).toBe(200);
  expect(retry.body).toEqual({ id: account.id });
});

it('allows the legacy schema fallback only for a missing column', async () => {
  query.mockRejectedValueOnce(Object.assign(new Error('column is missing'), { code: '42703' }));
  expect((await getAccount()).status).toBe(200);
  expect(query).toHaveBeenCalledTimes(2);
});

it('does not turn a failed legacy-schema lookup into an expired session', async () => {
  query.mockRejectedValueOnce(Object.assign(new Error('column is missing'), { code: '42703' }))
    .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'ECONNREFUSED' }));
  const failed = await getAccount();
  expect(failed.status).toBe(503);
  expect(failed.body.code).toBe('AUTH_UNAVAILABLE');
});

it('still rejects invalid and expired tokens before querying the database', async () => {
  const invalid = await getAccount('invalid-token');
  expect(invalid.status).toBe(401);
  expect(invalid.body.code).toBe('INVALID_SESSION');
  const expired = await getAccount(jwt.sign({ userId: account.id }, process.env.JWT_SECRET, { expiresIn: -1 }));
  expect(expired.status).toBe(401);
  expect(expired.body.code).toBe('SESSION_EXPIRED');
  expect(query).not.toHaveBeenCalled();
});
