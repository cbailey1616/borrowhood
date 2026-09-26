import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { databasePoolMetrics, withBackgroundDatabase, query } from '../utils/db.js';

export const safeRoute = path => path
  .replace(/\/private-photos\/[^/]+/, '/private-photos/:token')
  .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id');

export function observeRequest(req, res, next) {
  const started = performance.now();
  const requestId = randomUUID();
  res.set('X-Request-Id', requestId);
  res.once('finish', () => {
    const durationMs = Math.round(performance.now()-started);
    // Never log bearer URLs, query strings, request bodies, or user identities.
    const data = { requestId, method: req.method, route: safeRoute(req.path), status: res.statusCode, durationMs };
    if (res.statusCode >= 500) logger.error('HTTP request failed', data);
    else if (durationMs >= 1000) logger.warn('HTTP request slow', data);
  });
  next();
}

export function startPoolMonitoring() {
  let checking = false;
  const timer = setInterval(async () => {
    const pools = databasePoolMetrics();
    if (pools.api.waiting || pools.jobs.waiting) logger.warn('Database pool waiting', pools);
    if (checking) return;
    checking = true;
    try {
      const { rows: [lag] } = await withBackgroundDatabase(() => query(`SELECT
        (SELECT EXTRACT(EPOCH FROM NOW()-available_at)::int FROM push_deliveries
          WHERE status IN ('pending','receipt','sending') AND available_at<NOW()
          AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY available_at LIMIT 1) AS push_seconds,
        (SELECT EXTRACT(EPOCH FROM NOW()-dirty_at)::int FROM neighbor_rank_pending
          ORDER BY dirty_at LIMIT 1) AS rank_seconds`));
      if (lag?.push_seconds > 120 || lag?.rank_seconds > 300) logger.warn('Background queue delayed', lag);
    } catch {
      logger.error('Background queue monitoring failed');
    } finally { checking = false; }
  }, 30000);
  timer.unref();
  return () => clearInterval(timer);
}
