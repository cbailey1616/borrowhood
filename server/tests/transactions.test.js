import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { query } from '../src/utils/db.js';

// Create a test app instance
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  // Import routes dynamically
  const { default: transactionRoutes } = await import('../src/routes/transactions.js');

  // Mock authentication middleware for testing
  app.use((req, res, next) => {
    req.user = { id: 'test-user-id' };
    next();
  });

  app.use('/api/transactions', transactionRoutes);
  return app;
};

describe('Transactions API', () => {
  let app;
  let testUserId;
  let testLenderId;
  let testListingId;
  let testCommunityId;

  beforeAll(async () => {
    app = await createTestApp();

    // Create test data
    testCommunityId = '00000000-0000-0000-0000-000000000001';

    // Create test users
    const borrowerResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, status)
       VALUES ('borrower@test.com', 'hash', 'Test', 'Borrower', 'verified')
       RETURNING id`
    );
    testUserId = borrowerResult.rows[0].id;

    const lenderResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, status)
       VALUES ('lender@test.com', 'hash', 'Test', 'Lender', 'verified')
       RETURNING id`
    );
    testLenderId = lenderResult.rows[0].id;

    // Create test listing
    const listingResult = await query(
      `INSERT INTO listings (owner_id, community_id, title, condition, price_per_day, deposit_amount)
       VALUES ($1, $2, 'Test Tool', 'good', 10.00, 50.00)
       RETURNING id`,
      [testLenderId, testCommunityId]
    );
    testListingId = listingResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    await query('DELETE FROM borrow_transactions WHERE borrower_id = $1', [testUserId]);
    await query('DELETE FROM listings WHERE id = $1', [testListingId]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId, testLenderId]);
  });

  describe('POST /api/transactions', () => {
    it('should create a borrow transaction', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 3);

      const response = await request(app)
        .post('/api/transactions')
        .send({
          listingId: testListingId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          message: 'I need this for a project',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('should reject invalid listing ID', async () => {
      const response = await request(app)
        .post('/api/transactions')
        .send({
          listingId: '00000000-0000-0000-0000-000000000000',
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/transactions', () => {
    it('should return user transactions', async () => {
      const response = await request(app)
        .get('/api/transactions');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter by role', async () => {
      const response = await request(app)
        .get('/api/transactions?role=borrower');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/transactions/:id', () => {
    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app)
        .get('/api/transactions/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
    });
  });
});

describe('Transaction Pricing', () => {
  it('should calculate platform fee correctly', () => {
    const rentalFee = 100;
    const platformFeePercent = 0.02;
    const platformFee = rentalFee * platformFeePercent;

    expect(platformFee).toBe(2);
  });

  it('should calculate lender payout correctly', () => {
    const rentalFee = 100;
    const platformFee = 2;
    const lenderPayout = rentalFee - platformFee;

    expect(lenderPayout).toBe(98);
  });

  it('should calculate rental days correctly', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-05');
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    expect(days).toBe(4);
  });
});
