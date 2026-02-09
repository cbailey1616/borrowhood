/**
 * Test Database Seed & Reset
 * Populates the DB with test fixtures and tears them down.
 */

import { query } from '../../src/utils/db.js';
import {
  createTestUser,
  createTestCustomer,
  attachTestPaymentMethod,
  createTestListing,
  createTestConnectAccount,
  cleanupTestUser,
  createTestCategory,
} from './stripe.js';
import {
  createTestCommunity,
  addCommunityMember,
  createFriendship,
} from './fixtures.js';

// Track all created user IDs for cleanup
const createdUserIds = [];

/**
 * Seed the test database with standard test fixtures.
 * Returns references to all created entities.
 */
export async function seedTestData() {
  // 1. Free user — no subscription, no verification
  const freeUser = await createTestUser({
    email: 'free-test@borrowhood.test',
    firstName: 'Free',
    lastName: 'User',
    subscriptionTier: 'free',
    isVerified: false,
  });
  const freeCustomer = await createTestCustomer(freeUser.userId, freeUser.email);
  await attachTestPaymentMethod(freeCustomer.id);
  createdUserIds.push(freeUser.userId);

  // 2. Plus user — subscribed but not verified
  const plusUser = await createTestUser({
    email: 'plus-test@borrowhood.test',
    firstName: 'Plus',
    lastName: 'User',
    subscriptionTier: 'plus',
    isVerified: false,
  });
  const plusCustomer = await createTestCustomer(plusUser.userId, plusUser.email);
  await attachTestPaymentMethod(plusCustomer.id);
  createdUserIds.push(plusUser.userId);

  // 3. Verified Plus user — subscribed + verified + Connect account
  const verifiedPlusUser = await createTestUser({
    email: 'verified-plus-test@borrowhood.test',
    firstName: 'Verified',
    lastName: 'Plus',
    subscriptionTier: 'plus',
    isVerified: true,
    status: 'verified',
  });
  const verifiedCustomer = await createTestCustomer(verifiedPlusUser.userId, verifiedPlusUser.email);
  await attachTestPaymentMethod(verifiedCustomer.id);
  const connectAccount = await createTestConnectAccount(verifiedPlusUser.userId, verifiedPlusUser.email);
  createdUserIds.push(verifiedPlusUser.userId);

  // 4. Create test listings
  const freeListingId = await createTestListing(verifiedPlusUser.userId, {
    title: 'Free Drill',
    isFree: true,
    pricePerDay: 0,
    depositAmount: 0,
    visibility: 'close_friends',
  });

  const rentalListingId = await createTestListing(verifiedPlusUser.userId, {
    title: 'Expensive Camera',
    isFree: false,
    pricePerDay: 10.00,
    depositAmount: 50.00,
    lateFeePerDay: 5.00,
    visibility: 'neighborhood',
  });

  const townListingId = await createTestListing(verifiedPlusUser.userId, {
    title: 'Town-Wide Power Washer',
    isFree: false,
    pricePerDay: 25.00,
    depositAmount: 100.00,
    lateFeePerDay: 10.00,
    visibility: 'town',
  });

  // 5. Create a test community and add all users
  const communityId = await createTestCommunity({
    name: 'Test Neighborhood',
    city: 'TestCity',
    state: 'TS',
  });
  await addCommunityMember(verifiedPlusUser.userId, communityId, 'organizer');
  await addCommunityMember(freeUser.userId, communityId, 'member');
  await addCommunityMember(plusUser.userId, communityId, 'member');

  // 6. Create a test category
  const categoryId = await createTestCategory('Tools', 'tools');

  // 7. Create friendship between free and verified-plus users
  await createFriendship(freeUser.userId, verifiedPlusUser.userId);

  return {
    freeUser: { ...freeUser, customerId: freeCustomer.id },
    plusUser: { ...plusUser, customerId: plusCustomer.id },
    verifiedPlusUser: {
      ...verifiedPlusUser,
      customerId: verifiedCustomer.id,
      connectAccountId: connectAccount.id,
    },
    listings: {
      free: freeListingId,
      rental: rentalListingId,
      town: townListingId,
    },
    communityId,
    categoryId,
  };
}

/**
 * Remove all test data created by seedTestData.
 */
export async function resetTestData() {
  // Clean up community memberships and communities
  try {
    await query(`DELETE FROM community_memberships WHERE user_id = ANY($1)`, [createdUserIds]);
    await query(`DELETE FROM communities WHERE city = 'TestCity' AND state = 'TS'`);
  } catch (e) { /* best effort */ }

  // Clean up friendships
  try {
    await query(`DELETE FROM friendships WHERE user_id = ANY($1) OR friend_id = ANY($1)`, [createdUserIds]);
  } catch (e) { /* best effort */ }

  // Clean up categories
  try {
    await query(`DELETE FROM categories WHERE slug = 'tools'`);
  } catch (e) { /* best effort */ }

  for (const userId of createdUserIds) {
    try {
      await cleanupTestUser(userId);
    } catch (e) {
      console.warn(`Cleanup warning for user ${userId}:`, e.message);
    }
  }
  createdUserIds.length = 0;
}

/**
 * Quick cleanup: delete users by email pattern.
 */
export async function cleanupByEmailPattern(pattern = '%@borrowhood.test') {
  const users = await query('SELECT id FROM users WHERE email LIKE $1', [pattern]);
  for (const row of users.rows) {
    try {
      await cleanupTestUser(row.id);
    } catch (e) {
      // Best effort
    }
  }
}
