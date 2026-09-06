import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { normalizeSharing, listingAccessSql, requestAccessSql } from '../../src/utils/sharingPolicy.js';
import { query } from '../../src/utils/db.js';
import { validateSharing, offerListing } from '../../src/services/listingAccess.js';
import listings from '../../src/routes/listings.js';
import requests from '../../src/routes/requests.js';
import saved from '../../src/routes/saved.js';
import discussions from '../../src/routes/discussions.js';
import requestDiscussions from '../../src/routes/requestDiscussions.js';
import availability from '../../src/routes/availability.js';
import messages from '../../src/routes/messages.js';

const viewer = '10000000-0000-4000-8000-000000000001';
const item = '20000000-0000-4000-8000-000000000002';
const requestId = '30000000-0000-4000-8000-000000000003';
vi.mock('../../src/utils/db.js', () => ({ query: vi.fn() }));
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => { req.user = { id: '10000000-0000-4000-8000-000000000001' }; next(); },
  requireVerified: (req, res, next) => next(), ENABLE_PAID_TIERS: false,
}));
vi.mock('../../src/services/notifications.js', () => ({ sendNotification: vi.fn(), sendBulkNotification: vi.fn() }));
vi.mock('../../src/services/imageAnalysis.js', () => ({ analyzeItemImage: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/listings', listings, discussions, availability);
app.use('/requests', requests, requestDiscussions);
app.use('/saved', saved);
app.use('/messages', messages);

beforeEach(() => { vi.clearAllMocks(); query.mockResolvedValue({ rows: [] }); });

describe('private-first policy', () => {
  it('defaults an omitted audience to private', () => expect(normalizeSharing()).toEqual(['private']));
  it.each([[], ['private', 'town'], ['public'], 'town', null])('rejects ambiguous/legacy audiences: %j', value => {
    expect(() => normalizeSharing(value)).toThrow();
  });
  it('normalizes duplicate scopes', () => expect(normalizeSharing(['close_friends', 'close_friends'])).toEqual(['close_friends']));
  it('supports multiple explicit audiences without mapping legacy groups', () => {
    expect(normalizeSharing(['close_friends', 'neighborhood', 'town'])).toEqual(['close_friends', 'neighborhood', 'town']);
    expect(normalizeSharing(['circle'])).toEqual(['circle']);
  });
  it('requires membership in a selected neighborhood', async () => {
    const body = { visibility: ['neighborhood'], sharingConfirmed: true };
    expect((await validateSharing(body, viewer)).error).toMatch(/Join/);
    expect((await validateSharing({ ...body, communityId: item }, viewer)).error).toMatch(/belong/);
    query.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    expect((await validateSharing({ ...body, communityId: item }, viewer)).scopes).toEqual(['neighborhood']);
    expect(query.mock.calls.at(-1)).toEqual([expect.stringContaining('community_memberships'), [item, viewer]]);
  });
  it('does not silently widen exposure for old clients', async () => {
    expect((await validateSharing({ visibility: ['town'] }, viewer)).error).toMatch(/confirm/);
    expect(query).not.toHaveBeenCalled();
  });
  it('requires actual verification for explicit town opt-in', async () => {
    expect((await validateSharing({ visibility: ['town'], sharingConfirmed: true }, viewer)).error).toMatch(/Verify/);
    expect(query.mock.calls[0][0]).toContain('is_verified = true');
  });
  it('rejects group sharing without selecting an active group', async () => {
    expect((await validateSharing({ visibility: ['circle'], sharingConfirmed: true }, viewer)).error).toMatch(/Choose/);
    expect((await validateSharing({ visibility: ['circle'], circleId: item, sharingConfirmed: true }, viewer)).error).toMatch(/active member/);
  });
  it('keeps offers and transaction exceptions out of discovery', () => {
    const sql = listingAccessSql('l', '$2', { discovery: true });
    expect(sql).toContain('privacy_version = 1');
    expect(sql).not.toContain('listing_shares');
    expect(sql).not.toContain('borrow_transactions');
    expect(sql).toContain("sm.status = 'active' AND so.status = 'active'");
    expect(sql).toContain('LOWER(TRIM(sv.state)) = LOWER(TRIM(so.state))');
    expect(sql).not.toContain('verification_grace');
  });
  it('checks item-specific offer recipient, revocation, expiry and request status', () => {
    const sql = listingAccessSql('l', '$2');
    expect(sql).toContain('ss.listing_id = l.id AND ss.user_id = $2');
    expect(sql).toContain('ss.revoked_at IS NULL AND ss.expires_at > NOW()');
    expect(sql).toContain("sr.status = 'open'");
  });
  it('request groups use membership, not a city match', () => {
    const sql = requestAccessSql('r', '$2');
    expect(sql).toContain('sm.community_id = r.community_id');
    expect(sql).toContain('so.user_id = r.user_id');
  });
  it('cannot offer an item to an inaccessible request', async () => {
    await expect(offerListing(requestId, item, viewer)).rejects.toThrow('Request not found');
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('direct API access fails closed before returning content', () => {
  it('creates a private item when no audience is supplied', async () => {
    query.mockImplementation(async sql => ({ rows: sql.includes('INSERT INTO listings') ? [{ id: item }] : [] }));
    const response = await request(app).post('/listings').send({ title: 'Private power drill', condition: 'good', isFree: true, photos: [`http://localhost:3000/uploads/private-listing-${viewer}-drill.jpg`] });
    expect(response.status).toBe(201);
    const [sql, params] = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO listings'));
    expect(sql).toContain('privacy_version, circle_id');
    expect(params[11]).toBe('private');
  });
  it('rejects attempts by old clients to publish without audience confirmation', async () => {
    const response = await request(app).post('/listings').send({ title: 'Power drill', condition: 'good', isFree: true, visibility: ['town'], photos: [`http://localhost:3000/uploads/private-listing-${viewer}-drill.jpg`] });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/confirm/);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO listings'))).toBe(false);
  });
  it.each([
    `/listings/${item}`, `/listings/${item}/availability`, `/listings/${item}/check-availability?startDate=2026-09-06&endDate=2026-09-07`,
    `/listings/${item}/discussions`, `/requests/${requestId}`, `/requests/${requestId}/discussions`, `/requests/${requestId}/offers`,
  ])('denies inaccessible %s', async url => {
    const response = await request(app).get(url);
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('photoUrl');
  });
  it('cannot save an inaccessible item', async () => {
    expect((await request(app).post(`/saved/${item}`)).status).toBe(404);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO saved_listings'))).toBe(false);
  });
  it('cannot use chat attachments to gain access to an item', async () => {
    const response = await request(app).post('/messages').send({ recipientId: requestId, listingId: item, content: 'Hello' });
    expect(response.status).toBe(404);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO conversations'))).toBe(false);
  });
});
