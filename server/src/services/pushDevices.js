import { createHash } from 'node:crypto';
import { withTransaction } from '../utils/db.js';

export const validPushToken = token => typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token) && token.length <= 256;
export const validInstallationId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// A device belongs to one account; an account may have many devices. The lock
// serializes transfers and logout with registration, including older clients.
export async function registerPushDevice(userId, token, installationId, revocationSecret) {
  const installation = installationId || `legacy:${createHash('sha256').update(token).digest('hex')}`;
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(812762)');
    await client.query(`DELETE FROM push_devices WHERE (token = $1 OR installation_id = $2) AND user_id <> $3`, [token, installation, userId]);
    await client.query(`DELETE FROM push_devices WHERE token = $1 AND installation_id <> $2`, [token, installation]);
    const revocationHash = revocationSecret ? createHash('sha256').update(`${userId}:${revocationSecret}`).digest('hex') : null;
    await client.query(`INSERT INTO push_devices(user_id, token, installation_id, revocation_hash) VALUES($1,$2,$3,$4)
      ON CONFLICT (installation_id) DO UPDATE SET token=EXCLUDED.token, revocation_hash=EXCLUDED.revocation_hash, updated_at=NOW()`, [userId, token, installation, revocationHash]);
    await client.query('UPDATE users SET push_token = NULL WHERE push_token = $1 OR id = $2', [token, userId]);
  });
}

// A device-only revocation capability lets an expired session stop its pushes.
// It cannot register a device, read messages or revoke another installation.
export async function revokePushDevice(installationId, secret, userId) {
  await withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(812762)');
    await client.query('DELETE FROM push_devices WHERE installation_id=$1 AND revocation_hash=$2 AND user_id=$3',
      [installationId, createHash('sha256').update(`${userId}:${secret}`).digest('hex'), userId]);
  });
}

export async function unregisterPushDevice(userId, installationId) {
  await withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(812762)');
    await client.query('DELETE FROM push_devices WHERE user_id=$1 AND installation_id=$2', [userId, installationId]);
    await client.query('UPDATE users SET push_token=NULL WHERE id=$1', [userId]);
  });
}
