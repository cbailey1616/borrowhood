import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { query } from '../../src/utils/db.js';
import feed from '../../src/routes/feed.js';

vi.mock('../../src/utils/db.js', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: '10000000-0000-4000-8000-000000000001' }; next(); },
  ENABLE_PAID_TIERS: false,
}));

const app = express();
app.use('/feed', feed);
const author = '10000000-0000-4000-8000-000000000002';
const newcomer = '10000000-0000-4000-8000-000000000003';
const offPageAuthor = '10000000-0000-4000-8000-000000000004';
const session = '20000000-0000-4000-8000-000000000001';
const createdAt = '2026-09-12T08:00:00.000Z';
const listing = (id, userId, fullAccess = true) => ({ id, user_id: userId, owner_id: userId, full_access: fullAccess,
  title: 'Garden tools', created_at: createdAt, is_available: true, is_free: true, first_name: 'Sam', listing_visibility: 'town' });
const postRequest = (id, userId, fullAccess = true) => ({ id, user_id: userId, full_access: fullAccess,
  title: 'Need a ladder', created_at: createdAt, first_name: 'Jo', accepting_offers: true });

function serveRows(listings, requests) {
  const keys = [...listings.map(row => `listing:${row.id}`), ...requests.map(row => `request:${row.id}`)];
  query.mockImplementation(async (sql, params) => {
    if (sql.includes('MAX(')) return { rows: [{ latest_post_at: createdAt }] };
    if (sql.includes('FROM listings l')) return { rows: listings };
    if (sql.includes('FROM item_requests r')) return { rows: requests };
    if (sql.includes('FROM feed_sessions')) return { rows: [{ item_keys: keys }] };
    if (sql.includes('unnest($1::uuid[])')) return { rows: params[0].filter(id => id === author).map(id => ({
      member_id: id, completed: 6, total: 2, positive: 2, activity: 4,
    })) };
    throw new Error(`Unexpected query: ${sql}`);
  });
}

const rankQueries = () => query.mock.calls.filter(([sql]) => sql.includes('unnest($1::uuid[])'));
beforeEach(() => { query.mockReset(); });

it('includes the same author summary on listings and request ribbons with one query after pagination', async () => {
  serveRows([listing('visible', author), listing('later', offPageAuthor)], [postRequest('request', author), postRequest('new', newcomer)]);
  const response = await request(app).get(`/feed?layout=sections&limit=1&session=${session}`);
  expect(response.status).toBe(200);
  expect(response.body.items.map(item => item.id)).toEqual(['visible']);
  expect(response.body.hasMore).toBe(true);
  const expected = { completedCount: 6, score: 85, count: 2, percent: 100 };
  expect(response.body.items[0].user.endorsement).toEqual(expected);
  expect(response.body.requests[0].user.endorsement).toEqual(expected);
  expect(response.body.requests[1].user.endorsement).toEqual({ completedCount: 0, score: null, count: 0, percent: null });
  expect(rankQueries()).toHaveLength(1);
  expect(rankQueries()[0][1]).toEqual([[author, newcomer]]);
});

it('includes ranks in the request-only feed', async () => {
  serveRows([], [postRequest('request', author)]);
  const response = await request(app).get(`/feed?type=requests&session=${session}`);
  expect(response.status).toBe(200);
  expect(response.body.items[0].user.endorsement).toMatchObject({ score: 85, completedCount: 6 });
});

it('does not look up authors beyond the eight visible request cards', async () => {
  serveRows([], [...Array.from({ length: 8 }, (_, index) => postRequest(`request-${index}`, author)), postRequest('overflow', offPageAuthor)]);
  const response = await request(app).get(`/feed?layout=sections&session=${session}`);
  expect(response.status).toBe(200);
  expect(response.body.requests).toHaveLength(8);
  expect(response.body.requestCount).toBe(9);
  expect(rankQueries()[0][1]).toEqual([[author]]);
});

it('keeps ranks and identities out of town previews', async () => {
  serveRows([listing('preview', author, false)], [postRequest('request-preview', newcomer, false)]);
  const response = await request(app).get(`/feed?layout=sections&session=${session}`);
  expect(response.status).toBe(200);
  for (const item of [...response.body.items, ...response.body.requests]) {
    expect(item).toMatchObject({ ownerMasked: true, previewOnly: true, user: { id: null } });
    expect(item.user).not.toHaveProperty('endorsement');
  }
  expect(rankQueries()).toHaveLength(0);
  expect(JSON.stringify(response.body)).not.toContain(author);
  expect(JSON.stringify(response.body)).not.toContain(newcomer);
});

it('keeps summary polling free of rank lookups and identities', async () => {
  serveRows([listing('visible', author)], [postRequest('request', newcomer)]);
  const response = await request(app).get('/feed?summary=true');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ latestPostAt: createdAt });
  expect(rankQueries()).toHaveLength(0);
});
