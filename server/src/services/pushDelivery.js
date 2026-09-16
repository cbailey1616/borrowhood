import { query, withTransaction } from '../utils/db.js';
import logger from '../utils/logger.js';
import { shouldSendPush, audiencePreferences } from './notificationPreferences.js';
import { notificationAudienceAllowsPush } from './notificationAudience.js';
import { UNREAD_ACTIVITY_SQL } from './requestActivity.js';
import { validPushToken } from './pushDevices.js';

const MAX_ATTEMPTS = 8;
export const retrySeconds = attempts => Math.min(1800, 30 * 2 ** Math.max(0, attempts - 1));
const permanentCodes = new Set(['DeviceNotRegistered', 'MessageTooBig', 'InvalidCredentials', 'MismatchSenderId']);

export async function expoRequest(path, payload) {
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const error = new Error(`Expo HTTP ${response.status}`);
    error.permanent = response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408;
    throw error;
  }
  const result = await response.json();
  if (result.errors?.length || !result.data) throw new Error('Expo returned an invalid response');
  return result.data;
}

export function pushMessage(notification, device, badge, prefs) {
  return {
    to: device.token, title: notification.title, body: notification.body,
    badge: Math.max(0, Number(badge) || 0), ...(prefs.push_sound !== false ? { sound: 'default' } : {}),
    data: { ...notification.push_data, notificationId: notification.id, type: notification.type,
      recipientUserId: notification.user_id, fromUserId: notification.from_user_id,
      listingId: notification.listing_id, requestId: notification.request_id,
      transactionId: notification.transaction_id, conversationId: notification.conversation_id,
      disputeId: notification.dispute_id, discussionId: notification.discussion_id,
      threadId: notification.thread_id, circleId: notification.circle_id },
  };
}

async function recordFailure(run, job, error) {
  const code = error.code || error.message || 'Push delivery failed';
  const terminal = error.permanent || permanentCodes.has(error.code) || (!job.ticket_id && job.attempts >= MAX_ATTEMPTS);
  await run(`UPDATE push_deliveries SET status=$2, lease_until=NULL,
    available_at=NOW()+($3 * INTERVAL '1 second'), last_error=$4 WHERE id=$1`,
  [job.id, terminal ? 'failed' : job.ticket_id ? 'receipt' : 'pending', retrySeconds(job.attempts), code]);
  logger.warn('Push delivery failed', { deliveryId: job.id, code, terminal: !!terminal });
}

async function processJob(job) {
  // Keep ownership stable until the request finishes. A successful logout waits
  // for an in-flight send, then removes the device and its remaining jobs.
  await withTransaction(async client => {
    const run = client.query.bind(client);
    const { rows: [row] } = await run(`SELECT n.*, d.token, d.user_id AS device_user_id, u.notification_preferences
      FROM push_deliveries p JOIN notifications n ON n.id=p.notification_id
      JOIN push_devices d ON d.id=p.device_id JOIN users u ON u.id=n.user_id
      WHERE p.id=$1 FOR SHARE OF d`, [job.id]);
    if (!row) return;
    try {
      if (job.ticket_id) {
        const receipts = await expoRequest('getReceipts', { ids: [job.ticket_id] });
        const receipt = receipts[job.ticket_id];
        if (!receipt) {
          const error = new Error('Push receipt not available');
          error.permanent = Date.now() - new Date(job.ticket_at).getTime() > 23 * 60 * 60 * 1000;
          throw error;
        }
        if (receipt.status !== 'ok') {
          const error = new Error('Push provider rejected delivery');
          error.code = receipt.details?.error;
          // A known failed receipt may be retried, but a missing receipt must
          // never resend a notification which may already have arrived.
          if (!permanentCodes.has(error.code)) {
            await run('UPDATE push_deliveries SET ticket_id=NULL, ticket_at=NULL WHERE id=$1', [job.id]);
            job.ticket_id = null;
          }
          throw error;
        }
        await run("UPDATE push_deliveries SET status='delivered', lease_until=NULL, last_error=NULL WHERE id=$1", [job.id]);
        await run('UPDATE notifications SET push_sent=true WHERE id=$1', [row.id]);
        return;
      }
      const prefs = row.notification_preferences || {};
      let allowed = row.device_user_id === row.user_id && !row.is_read && validPushToken(row.token)
        && shouldSendPush(row.type, prefs, row.push_data || {})
        && await notificationAudienceAllowsPush(run, row.user_id, row.from_user_id, audiencePreferences(row.type, prefs, row.push_data || {}));
      if (allowed && row.type === 'new_message' && row.conversation_id) {
        const unread = await run(`SELECT 1 FROM messages WHERE conversation_id=$1 AND sender_id<>$2 AND is_read=false LIMIT 1`, [row.conversation_id, row.user_id]);
        allowed = unread.rows.length > 0;
      }
      if (!allowed) {
        await run("UPDATE push_deliveries SET status='suppressed', lease_until=NULL WHERE id=$1", [job.id]);
        return;
      }
      const { rows: [count] } = await run(`SELECT (${UNREAD_ACTIVITY_SQL}) +
        (SELECT COUNT(DISTINCT m.conversation_id) FROM messages m JOIN conversations c ON c.id=m.conversation_id
        WHERE m.is_read=false AND m.sender_id<>$1 AND (c.user1_id=$1 OR c.user2_id=$1)) AS count`, [row.user_id]);
      const ticket = await expoRequest('send', pushMessage(row, row, count.count, prefs));
      if (ticket.status !== 'ok' || !ticket.id) {
        const error = new Error('Expo rejected push');
        error.code = ticket.details?.error;
        throw error;
      }
      await run(`UPDATE push_deliveries SET status='receipt', ticket_id=$2, ticket_at=NOW(), sent_token=$3,
        available_at=NOW()+INTERVAL '15 minutes', lease_until=NULL, last_error=NULL WHERE id=$1`, [job.id, ticket.id, row.token]);
    } catch (error) {
      await recordFailure(run, job, error);
      if (error.code === 'DeviceNotRegistered') {
        // An old receipt must not remove a newly rotated token.
        await run('DELETE FROM push_devices WHERE id=$1 AND token=$2', [job.device_id, job.sent_token || row.token]);
      }
    }
  });
}

let running = false;
export async function processPushDeliveries() {
  if (running) return;
  running = true;
  try {
    await query(`UPDATE push_deliveries SET status='failed', last_error='Delivery retry window expired', lease_until=NULL
      WHERE status IN ('pending','sending') AND created_at<NOW()-INTERVAL '24 hours'`);
    const jobs = await query(`WITH picked AS (
      SELECT id FROM push_deliveries WHERE status IN ('pending','receipt','sending') AND available_at<=NOW()
      AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY available_at, created_at LIMIT 6 FOR UPDATE SKIP LOCKED
    ) UPDATE push_deliveries p SET status='sending', lease_until=NOW()+INTERVAL '2 minutes',
      attempts=attempts+CASE WHEN ticket_id IS NULL THEN 1 ELSE 0 END
      FROM picked WHERE p.id=picked.id RETURNING p.*`);
    await Promise.all(jobs.rows.map(job => processJob(job).catch(error => logger.error('Push worker job failed', { deliveryId: job.id, error: error.message }))));
  } catch (error) { logger.error('Push worker failed', { error: error.message }); }
  finally { running = false; }
}
