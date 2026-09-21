import { query, withTransaction } from '../utils/db.js';
import { VERIFICATION_PRODUCT_ID, purchaseError, isSandboxUser,
  validateAppleTransaction, verifyAppleTransaction, verifyAppleNotification,
  assertAppleVerificationConfigured } from './appleVerification.js';

export async function ensureVerificationPurchaseSchema() {
  await withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('verification-purchases-schema-v1'))");
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_session_revision INTEGER NOT NULL DEFAULT 0');
    await client.query(`CREATE TABLE IF NOT EXISTS verification_entitlements (
      environment TEXT NOT NULL, original_transaction_id TEXT NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL, app_account_token UUID NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('launch_free','apple')), product_id TEXT NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ,
      last_notification_signed_at_ms BIGINT NOT NULL DEFAULT -1,
      PRIMARY KEY(environment, original_transaction_id),
      CHECK ((source='launch_free' AND environment='FreeLaunch') OR
        (source='apple' AND environment IN ('Production','Sandbox'))))`);
    await client.query('CREATE INDEX IF NOT EXISTS verification_entitlements_user ON verification_entitlements(user_id)');
    await client.query(`CREATE TABLE IF NOT EXISTS apple_verification_transactions (
      environment TEXT NOT NULL CHECK(environment IN ('Production','Sandbox')), transaction_id TEXT NOT NULL,
      original_transaction_id TEXT NOT NULL, user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      app_account_token UUID NOT NULL, product_id TEXT NOT NULL,
      purchased_at TIMESTAMPTZ NOT NULL, signed_at_ms BIGINT NOT NULL,
      revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(environment, transaction_id),
      FOREIGN KEY(environment, original_transaction_id)
        REFERENCES verification_entitlements(environment, original_transaction_id))`);
    await client.query(`CREATE TABLE IF NOT EXISTS apple_notification_events (
      notification_uuid TEXT PRIMARY KEY, notification_type TEXT NOT NULL,
      signed_at_ms BIGINT NOT NULL, processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await client.query(`CREATE TABLE IF NOT EXISTS verification_purchase_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const migration = await client.query(`INSERT INTO verification_purchase_migrations(name)
      VALUES ('grandfather-launch-v1') ON CONFLICT DO NOTHING RETURNING name`);
    if (migration.rows.length) {
      // Snapshot once: do not turn later paid checks into free grants on restart.
      await client.query(`INSERT INTO verification_entitlements
        (environment,original_transaction_id,user_id,app_account_token,source,product_id)
        SELECT 'FreeLaunch',id::TEXT,id,id,'launch_free',$1 FROM users
        WHERE is_verified=true OR stripe_identity_session_id IS NOT NULL
        ON CONFLICT DO NOTHING`, [VERIFICATION_PRODUCT_ID]);
    }
  });
}

function verificationMode() {
  const mode = process.env.VERIFICATION_PAYMENT_MODE || 'free_launch';
  if (!['free_launch', 'apple_iap'].includes(mode)
      || (mode === 'apple_iap' && process.env.VERIFICATION_IAP_READY !== 'true')) {
    throw purchaseError(503, 'Verification purchases are not ready yet. Please try again later.', 'VERIFICATION_PURCHASE_UNAVAILABLE');
  }
  if (mode === 'apple_iap') assertAppleVerificationConfigured();
  return mode;
}

export async function getVerificationEligibility(userId, db = { query }) {
  const mode = verificationMode();
  const result = await db.query(`SELECT u.is_verified,
    EXISTS(SELECT 1 FROM verification_entitlements e WHERE e.user_id=u.id
      AND e.source='launch_free' AND e.revoked_at IS NULL) AS has_launch_grant,
    EXISTS(SELECT 1 FROM verification_entitlements e WHERE e.user_id=u.id
      AND e.source='apple' AND e.product_id=$2 AND e.revoked_at IS NULL
      AND (e.environment='Production' OR (e.environment='Sandbox' AND $3::boolean))) AS has_purchase
    FROM users u WHERE u.id=$1`, [userId, VERIFICATION_PRODUCT_ID, isSandboxUser(userId)]);
  const user = result.rows[0];
  if (!user) throw purchaseError(404, 'User not found.', 'USER_NOT_FOUND');
  const paymentRequired = mode === 'apple_iap' && !user.is_verified && !user.has_launch_grant && !user.has_purchase;
  return { mode, productId: VERIFICATION_PRODUCT_ID, appAccountToken: userId,
    paymentRequired, canStartVerification: !paymentRequired,
    hasVerificationPurchase: Boolean(user.has_purchase), isVerified: Boolean(user.is_verified) };
}

// Run on both hosted and legacy-native Stripe session entry points. Callers
// holding a user row lock pass the same transaction connection here.
export async function requireVerificationEligibility(userId, db = { query }) {
  const eligibility = await getVerificationEligibility(userId, db);
  if (eligibility.paymentRequired) {
    throw purchaseError(402, 'Purchase verification through Apple to continue.', 'VERIFICATION_PURCHASE_REQUIRED');
  }
  if (eligibility.mode === 'free_launch') {
    await db.query(`INSERT INTO verification_entitlements
      (environment,original_transaction_id,user_id,app_account_token,source,product_id)
      VALUES ('FreeLaunch',$1::uuid::text,$1::uuid,$1::uuid,'launch_free',$2) ON CONFLICT DO NOTHING`, [userId, VERIFICATION_PRODUCT_ID]);
  }
  return eligibility;
}

async function upsertPurchase(client, transaction, { notification = null } = {}) {
  const userId = transaction.appAccountToken.toLowerCase();
  // A tombstone can arrive before the client claims its purchase. Keeping its
  // ownership and revocation prevents a stale signed purchase replay later.
  await client.query(`INSERT INTO verification_entitlements
    (environment,original_transaction_id,user_id,app_account_token,source,product_id,revoked_at)
    VALUES ($1,$2,(SELECT id FROM users WHERE id=$3),$3,'apple',$4,$5)
    ON CONFLICT DO NOTHING`, [transaction.environment, transaction.originalTransactionId, userId,
    transaction.productId, transaction.revocationDate ? new Date(transaction.revocationDate) : null]);
  const entitlement = (await client.query(`SELECT * FROM verification_entitlements
    WHERE environment=$1 AND original_transaction_id=$2 FOR UPDATE`,
  [transaction.environment, transaction.originalTransactionId])).rows[0];
  if (entitlement.app_account_token !== userId || entitlement.product_id !== transaction.productId
      || (entitlement.user_id && entitlement.user_id !== userId)) {
    throw purchaseError(409, 'This purchase is already linked to another account.', 'VERIFICATION_PURCHASE_ACCOUNT_MISMATCH');
  }
  const existingTransaction = (await client.query(`INSERT INTO apple_verification_transactions
    (environment,transaction_id,original_transaction_id,user_id,app_account_token,product_id,purchased_at,signed_at_ms,revoked_at)
    VALUES ($1,$2,$3,(SELECT id FROM users WHERE id=$4),$4,$5,$6,$7,$8)
    ON CONFLICT(environment,transaction_id) DO UPDATE SET
      signed_at_ms=GREATEST(apple_verification_transactions.signed_at_ms,EXCLUDED.signed_at_ms)
    RETURNING app_account_token,original_transaction_id,product_id`,
  [transaction.environment, transaction.transactionId, transaction.originalTransactionId, userId, transaction.productId,
    new Date(transaction.purchaseDate), transaction.signedDate, transaction.revocationDate ? new Date(transaction.revocationDate) : null])).rows[0];
  if (existingTransaction.app_account_token !== userId
      || existingTransaction.original_transaction_id !== transaction.originalTransactionId
      || existingTransaction.product_id !== transaction.productId) {
    throw purchaseError(409, 'This Apple transaction is already linked to another account.', 'VERIFICATION_PURCHASE_ACCOUNT_MISMATCH');
  }
  if (notification) {
    const type = notification.notificationType;
    const signedDate = notification.signedDate;
    // Only explicit refund reversal may restore an entitlement. Ordinary later
    // purchase JWSs or ONE_TIME_CHARGE notifications never erase revocation.
    if (['REFUND', 'REVOKE', 'REFUND_REVERSED'].includes(type)) {
      await client.query(`UPDATE verification_entitlements SET revoked_at=$3,last_notification_signed_at_ms=$4
        WHERE environment=$1 AND original_transaction_id=$2 AND
          (last_notification_signed_at_ms < $4 OR (last_notification_signed_at_ms=$4 AND $3::TIMESTAMPTZ IS NOT NULL))`,
      [transaction.environment, transaction.originalTransactionId,
        type === 'REFUND_REVERSED' ? null : new Date(transaction.revocationDate || signedDate), signedDate]);
    }
  } else if (entitlement.revoked_at) {
    throw purchaseError(409, 'This purchase was refunded or revoked.', 'VERIFICATION_PURCHASE_REVOKED');
  }
}

export async function recordAppleVerificationPurchase(userId, signedTransaction) {
  // The same account may restore/retry while launch is free. Accepting payment
  // evidence here never changes the launch switch or initiates a charge.
  const transaction = await verifyAppleTransaction(signedTransaction, userId);
  validateAppleTransaction(transaction, userId);
  return withTransaction(async client => {
    const user = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!user.rows.length) throw purchaseError(404, 'User not found.', 'USER_NOT_FOUND');
    await upsertPurchase(client, transaction);
    return getVerificationEligibility(userId, client);
  });
}

export async function handleAppleVerificationNotification(signedPayload) {
  const { notification, transaction } = await verifyAppleNotification(signedPayload);
  if (typeof notification.notificationUUID !== 'string' || notification.notificationUUID.length > 128
      || !notification.notificationUUID.length || !Number.isSafeInteger(notification.signedDate)
      || notification.signedDate <= 0 || notification.signedDate > Date.now() + 300000) {
    throw purchaseError(400, 'Invalid Apple notification.');
  }
  if (transaction) validateAppleTransaction(transaction, transaction.appAccountToken,
    { allowRevoked: true, allowSandboxNotification: true });
  else if (notification.notificationType !== 'TEST') throw purchaseError(400, 'Missing Apple transaction.');
  return withTransaction(async client => {
    const event = await client.query(`INSERT INTO apple_notification_events(notification_uuid,notification_type,signed_at_ms)
      VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING notification_uuid`,
    [notification.notificationUUID, notification.notificationType, notification.signedDate]);
    if (!event.rows.length) return { received: true, duplicate: true };
    if (transaction && ['REFUND', 'REVOKE', 'REFUND_REVERSED', 'ONE_TIME_CHARGE'].includes(notification.notificationType)) {
      await upsertPurchase(client, transaction, { notification });
    }
    return { received: true };
  });
}
