/**
 * Test Fixtures — helpers for creating test data that isn't Stripe-related.
 * Communities, friendships, conversations, messages, notifications, disputes, categories.
 */

import { query } from '../../src/utils/db.js';

/**
 * Create a test community and return its ID.
 */
export async function createTestCommunity(overrides = {}) {
  const defaults = {
    name: `Test Community ${Date.now()}`,
    city: 'TestCity',
    state: 'TS',
    description: 'A test community',
  };
  const opts = { ...defaults, ...overrides };
  const slug = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);

  const result = await query(
    `INSERT INTO communities (name, slug, city, state, description, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id`,
    [opts.name, slug, opts.city, opts.state, opts.description]
  );

  return result.rows[0].id;
}

/**
 * Add a user as a member of a community with the given role.
 */
export async function addCommunityMember(userId, communityId, role = 'member') {
  await query(
    `INSERT INTO community_memberships (user_id, community_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, community_id) DO UPDATE SET role = $3`,
    [userId, communityId, role]
  );
}

/**
 * Create a bidirectional accepted friendship between two users.
 */
export async function createFriendship(userId1, userId2) {
  await query(
    `INSERT INTO friendships (user_id, friend_id, status)
     VALUES ($1, $2, 'accepted')
     ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'`,
    [userId1, userId2]
  );
  await query(
    `INSERT INTO friendships (user_id, friend_id, status)
     VALUES ($1, $2, 'accepted')
     ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'`,
    [userId2, userId1]
  );
}

/**
 * Create a conversation between two users, optionally linked to a listing.
 */
export async function createConversation(user1Id, user2Id, listingId = null) {
  const result = await query(
    `INSERT INTO conversations (user1_id, user2_id, listing_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [user1Id, user2Id, listingId]
  );
  return result.rows[0].id;
}

/**
 * Create a message in a conversation.
 */
export async function createMessage(conversationId, senderId, content = 'Test message') {
  const result = await query(
    `INSERT INTO messages (conversation_id, sender_id, content)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [conversationId, senderId, content]
  );
  return result.rows[0].id;
}

/**
 * Create a test category.
 */
export async function createTestCategory(name = 'Test Category', slug = null) {
  const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const result = await query(
    `INSERT INTO categories (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = $1
     RETURNING id`,
    [name, categorySlug]
  );
  return result.rows[0].id;
}

/**
 * Create a test notification.
 */
export async function createTestNotification(userId, type = 'new_message', data = {}) {
  const result = await query(
    `INSERT INTO notifications (user_id, type, title, body, from_user_id, transaction_id, listing_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      userId,
      type,
      data.title || 'Test Notification',
      data.body || 'Test notification body',
      data.fromUserId || null,
      data.transactionId || null,
      data.listingId || null,
    ]
  );
  return result.rows[0].id;
}

/**
 * Create a test dispute for a transaction.
 *
 * Supports two call signatures for backward compatibility:
 *   Legacy:    createTestDispute(transactionId, openedById, reason)
 *   Enhanced:  createTestDispute(transactionId, claimantId, respondentId, overrides)
 *
 * The heuristic: if the third arg is a string it's the legacy `reason` form;
 * if it's a UUID (or falsy) it's the new `respondentId` form.
 */
export async function createTestDispute(transactionId, claimantOrOpenedById, thirdArg, fourthArg) {
  // --- Legacy path: (transactionId, openedById, reason?) ---
  if (typeof thirdArg === 'string' && !isUUID(thirdArg)) {
    const openedById = claimantOrOpenedById;
    const reason = thirdArg || 'Item damaged';
    const result = await query(
      `INSERT INTO disputes (transaction_id, opened_by_id, reason, status)
       VALUES ($1, $2, $3, 'open')
       RETURNING id`,
      [transactionId, openedById, reason]
    );
    return result.rows[0].id;
  }

  if (thirdArg === undefined) {
    // Called as (transactionId, openedById) — legacy with default reason
    const openedById = claimantOrOpenedById;
    const result = await query(
      `INSERT INTO disputes (transaction_id, opened_by_id, reason, status)
       VALUES ($1, $2, $3, 'open')
       RETURNING id`,
      [transactionId, openedById, 'Item damaged']
    );
    return result.rows[0].id;
  }

  // --- Enhanced path: (transactionId, claimantId, respondentId, overrides?) ---
  const claimantId = claimantOrOpenedById;
  const respondentId = thirdArg;
  const overrides = fourthArg || {};

  const defaults = {
    type: 'damagesClaim',
    description: 'Test dispute - item damaged',
    status: 'awaitingResponse',
  };
  const opts = { ...defaults, ...overrides };

  const result = await query(
    `INSERT INTO disputes (
      transaction_id, claimant_user_id, respondent_user_id, opened_by_id,
      type, description, reason, status
    ) VALUES ($1, $2, $3, $2, $4, $5, $5, $6)
    RETURNING id`,
    [transactionId, claimantId, respondentId, opts.type, opts.description, opts.status]
  );
  return result.rows[0].id;
}

/** Simple check whether a value looks like a UUID (v4). */
function isUUID(val) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

/**
 * Create a test transaction (borrow_transactions) for dispute/notification testing.
 */
export async function createTestTransaction(borrowerId, lenderId, listingId, overrides = {}) {
  const defaults = {
    status: 'picked_up',
    rentalDays: 7,
    dailyRate: 5.00,
    rentalFee: 10.00,
    depositAmount: 50.00,
    platformFee: 0.20,
    lenderPayout: 9.80,
    requestedStartDate: new Date().toISOString(),
    requestedEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const opts = { ...defaults, ...overrides };

  const result = await query(
    `INSERT INTO borrow_transactions (
      borrower_id, lender_id, listing_id, status,
      rental_days, daily_rate, rental_fee, deposit_amount, platform_fee, lender_payout,
      requested_start_date, requested_end_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id`,
    [
      borrowerId, lenderId, listingId, opts.status,
      opts.rentalDays, opts.dailyRate, opts.rentalFee, opts.depositAmount,
      opts.platformFee, opts.lenderPayout,
      opts.requestedStartDate, opts.requestedEndDate,
    ]
  );
  return result.rows[0].id;
}

/**
 * Create a discussion post on a listing.
 */
export async function createTestDiscussion(listingId, userId, content = 'Test question', parentId = null) {
  const result = await query(
    `INSERT INTO listing_discussions (listing_id, user_id, content, parent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [listingId, userId, content, parentId]
  );
  return result.rows[0].id;
}

/**
 * Clean up test fixtures by type and ID.
 */
export async function cleanupFixtures(items) {
  const tableMap = {
    community: 'communities',
    membership: 'community_memberships',
    friendship: 'friendships',
    conversation: 'conversations',
    message: 'messages',
    notification: 'notifications',
    dispute: 'disputes',
    transaction: 'borrow_transactions',
    category: 'categories',
    discussion: 'listing_discussions',
    saved: 'saved_listings',
  };

  for (const { type, id, where } of items) {
    const table = tableMap[type];
    if (!table) continue;

    try {
      if (where) {
        // Custom WHERE clause for tables without simple id lookup
        const keys = Object.keys(where);
        const conditions = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
        await query(`DELETE FROM ${table} WHERE ${conditions}`, Object.values(where));
      } else {
        await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      }
    } catch (e) {
      // Best effort
    }
  }
}
