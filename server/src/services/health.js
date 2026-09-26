import { query } from '../utils/db.js';

let probe;
// Concurrent probes share one bounded query. A health-check burst must not
// consume the API pool, and overload must produce a timely 503.
export async function healthCheck(_req, res) {
  let timer;
  try {
    probe ||= query({ text: 'SELECT 1', query_timeout: 1500 }).finally(() => { probe = null; });
    await Promise.race([probe, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Probe timed out')), 2000); })]);
    res.set('Cache-Control', 'no-store').json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.set('Cache-Control', 'no-store').status(503).json({ status: 'unavailable' });
  } finally { clearTimeout(timer); }
}
