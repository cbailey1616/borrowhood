/**
 * Disputes Route Tests
 * Tests: list, detail, evidence, resolve (organizer only)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { query } from '../src/utils/db.js';
import { createTestUser, createTestApp, createTestListing, cleanupTestUser } from './helpers/stripe.js';
import {
  createTestCommunity,
  addCommunityMember,
  createTestTransaction,
  createTestDispute,
} from './helpers/fixtures.js';

let app;
let borrower, lender, organizer, outsider;
let communityId, listingId, transactionId, disputeId;
const createdUserIds = [];

beforeAll(async () => {
  app = await createTestApp(
    { path: '/api/disputes', module: '../../src/routes/disputes.js' }
  );

  borrower = await createTestUser({ email: `disp-borr-${Date.now()}@borrowhood.test`, firstName: 'Disp', lastName: 'Borrower' });
  lender = await createTestUser({ email: `disp-lend-${Date.now()}@borrowhood.test`, firstName: 'Disp', lastName: 'Lender' });
  organizer = await createTestUser({ email: `disp-org-${Date.now()}@borrowhood.test`, firstName: 'Disp', lastName: 'Organizer' });
  outsider = await createTestUser({ email: `disp-out-${Date.now()}@borrowhood.test`, firstName: 'Disp', lastName: 'Outsider' });
  createdUserIds.push(borrower.userId, lender.userId, organizer.userId, outsider.userId);

  // Community with organizer
  communityId = await createTestCommunity({ name: 'Dispute Neighborhood', city: 'DispCity', state: 'DS' });
  await addCommunityMember(organizer.userId, communityId, 'organizer');
  await addCommunityMember(lender.userId, communityId, 'member');
  await addCommunityMember(borrower.userId, communityId, 'member');

  // Listing in community
  listingId = await createTestListing(lender.userId, {
    title: 'Disputed Item',
    isFree: false,
    pricePerDay: 10.00,
    depositAmount: 50.00,
    visibility: 'neighborhood',
  });
  await query('UPDATE listings SET community_id = $1 WHERE id = $2', [communityId, listingId]);

  // Transaction
  transactionId = await createTestTransaction(borrower.userId, lender.userId, listingId, {
    status: 'picked_up',
    rentalFee: 30.00,
    depositAmount: 50.00,
  });

  // Dispute
  disputeId = await createTestDispute(transactionId, borrower.userId, 'Item was already damaged');
});

afterAll(async () => {
  try {
    await query('DELETE FROM disputes WHERE transaction_id = $1', [transactionId]);
    await query('DELETE FROM borrow_transactions WHERE id = $1', [transactionId]);
    await query('DELETE FROM notifications WHERE user_id = ANY($1)', [createdUserIds]);
    await query('DELETE FROM listing_photos WHERE listing_id = $1', [listingId]);
    await query('DELETE FROM listings WHERE id = $1', [listingId]);
    await query('DELETE FROM community_memberships WHERE community_id = $1', [communityId]);
    await query('DELETE FROM communities WHERE id = $1', [communityId]);
  } catch (e) { /* */ }
  for (const id of createdUserIds) {
    try { await cleanupTestUser(id); } catch (e) { /* */ }
  }
});

describe('GET /api/disputes', () => {
  it('should return disputes for involved party', async () => {
    const res = await request(app)
      .get('/api/disputes')
      .set('Authorization', `Bearer ${borrower.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(d => d.id === disputeId);
    expect(found).toBeDefined();
    expect(found.status).toBe('open');
    expect(found.reason).toBe('Item was already damaged');
    expect(found.borrower).toBeDefined();
    expect(found.lender).toBeDefined();
  });

  it('should return disputes for organizer of community', async () => {
    const res = await request(app)
      .get('/api/disputes')
      .set('Authorization', `Bearer ${organizer.token}`);

    expect(res.status).toBe(200);
    const found = res.body.find(d => d.id === disputeId);
    expect(found).toBeDefined();
  });

  it('should return empty for outsider', async () => {
    const res = await request(app)
      .get('/api/disputes')
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(res.status).toBe(200);
    const found = res.body.find(d => d.id === disputeId);
    expect(found).toBeUndefined();
  });
});

describe('GET /api/disputes/:id', () => {
  it('should return dispute details for party', async () => {
    const res = await request(app)
      .get(`/api/disputes/${disputeId}`)
      .set('Authorization', `Bearer ${lender.token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(disputeId);
    expect(res.body.reason).toBe('Item was already damaged');
    expect(res.body.borrower.id).toBe(borrower.userId);
    expect(res.body.lender.id).toBe(lender.userId);
    expect(res.body.transaction).toBeDefined();
    expect(res.body.transaction.depositAmount).toBe(50);
  });

  it('should return dispute details for organizer', async () => {
    const res = await request(app)
      .get(`/api/disputes/${disputeId}`)
      .set('Authorization', `Bearer ${organizer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.isOrganizer).toBe(true);
  });

  it('should return 403 for non-party non-organizer', async () => {
    const res = await request(app)
      .get(`/api/disputes/${disputeId}`)
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(res.status).toBe(403);
  });

  it('should return 404 for non-existent dispute', async () => {
    const res = await request(app)
      .get('/api/disputes/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${borrower.token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/disputes/:id/evidence', () => {
  it('should add evidence as party to dispute', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId}/evidence`)
      .set('Authorization', `Bearer ${borrower.token}`)
      .send({ urls: ['https://example.com/evidence1.jpg', 'https://example.com/evidence2.jpg'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.evidenceCount).toBe(2);
  });

  it('should append to existing evidence', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId}/evidence`)
      .set('Authorization', `Bearer ${lender.token}`)
      .send({ urls: ['https://example.com/lender-evidence.jpg'] });

    expect(res.status).toBe(200);
    expect(res.body.evidenceCount).toBe(3);
  });

  it('should reject evidence from non-party', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId}/evidence`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ urls: ['https://example.com/hacker.jpg'] });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/disputes/:id/resolve', () => {
  it('should reject resolution by non-organizer', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${borrower.token}`)
      .send({ outcome: 'borrower', notes: 'I think I should win this dispute.' });

    expect(res.status).toBe(403);
  });

  it('should resolve dispute as lender (full deposit to lender)', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        outcome: 'lender',
        notes: 'Evidence clearly shows item was damaged by borrower.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.resolution.status).toBe('resolved_lender');
    expect(res.body.resolution.depositToLender).toBe(50);
    expect(res.body.resolution.depositToBorrower).toBe(0);
    expect(res.body.resolution.organizerFee).toBeGreaterThan(0);

    // Verify dispute is resolved in DB
    const dispute = await query('SELECT status, resolved_at FROM disputes WHERE id = $1', [disputeId]);
    expect(dispute.rows[0].status).toBe('resolved_lender');
    expect(dispute.rows[0].resolved_at).toBeTruthy();

    // Verify transaction is completed
    const tx = await query('SELECT status FROM borrow_transactions WHERE id = $1', [transactionId]);
    expect(tx.rows[0].status).toBe('completed');
  });

  it('should reject resolving already-resolved dispute', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ outcome: 'borrower', notes: 'Trying again on resolved dispute.' });

    expect(res.status).toBe(404);
  });
});

describe('Dispute resolution types', () => {
  let disputeId2, transactionId2, listingId2;

  beforeAll(async () => {
    listingId2 = await createTestListing(lender.userId, {
      title: 'Split Dispute Item',
      isFree: false,
      pricePerDay: 20.00,
      depositAmount: 100.00,
      visibility: 'neighborhood',
    });
    await query('UPDATE listings SET community_id = $1 WHERE id = $2', [communityId, listingId2]);

    transactionId2 = await createTestTransaction(borrower.userId, lender.userId, listingId2, {
      depositAmount: 100.00,
    });
    disputeId2 = await createTestDispute(transactionId2, lender.userId, 'Partial damage');
  });

  afterAll(async () => {
    try {
      await query('DELETE FROM disputes WHERE transaction_id = $1', [transactionId2]);
      await query('DELETE FROM borrow_transactions WHERE id = $1', [transactionId2]);
      await query('DELETE FROM listing_photos WHERE listing_id = $1', [listingId2]);
      await query('DELETE FROM listings WHERE id = $1', [listingId2]);
    } catch (e) { /* */ }
  });

  it('should resolve dispute as split', async () => {
    const res = await request(app)
      .post(`/api/disputes/${disputeId2}/resolve`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        outcome: 'split',
        lenderPercent: 70,
        notes: 'Both parties share some responsibility.',
      });

    expect(res.status).toBe(200);
    expect(res.body.resolution.status).toBe('resolved_split');
    expect(res.body.resolution.depositToLender).toBe(70);
    expect(res.body.resolution.depositToBorrower).toBe(30);
  });
});
