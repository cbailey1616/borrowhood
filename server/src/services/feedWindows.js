import { query } from '../utils/db.js';

export const WINDOW_PAGES = 10;
export async function ensureFeedWindowSchema() {
  await query(`CREATE TABLE IF NOT EXISTS feed_windows (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, token UUID NOT NULL,
    filter_key TEXT NOT NULL, window_number INT NOT NULL,
    snapshot_at TIMESTAMPTZ NOT NULL, item_keys JSONB NOT NULL, request_keys JSONB NOT NULL,
    next_cursor JSONB, has_more BOOLEAN NOT NULL, request_count INT NOT NULL DEFAULT 0,
    latest_post_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id,token,filter_key,window_number))`);
  await query('CREATE INDEX IF NOT EXISTS feed_windows_expiry ON feed_windows(created_at)');
  await query('CREATE INDEX IF NOT EXISTS feed_sessions_expiry ON feed_sessions(created_at)');
  await query('CREATE INDEX IF NOT EXISTS feed_events_seen ON feed_events(seen_at)');
  await query("CREATE INDEX IF NOT EXISTS listings_feed_order ON listings(created_at DESC,id DESC) WHERE status='active' AND is_available=true");
  await query("CREATE INDEX IF NOT EXISTS requests_feed_order ON item_requests(created_at DESC,id DESC) WHERE status='open'");
}

export async function loadFeedWindow(userId, token, filterKey, number) {
  if (!token) return { snapshot_at: new Date().toISOString() };
  const { rows } = await query(`SELECT * FROM feed_windows WHERE user_id=$1 AND token=$2 AND filter_key=$3
    AND window_number = ANY($4::int[]) AND created_at > NOW()-INTERVAL '1 day'`,
  [userId,token,filterKey,number ? [number-1,number] : [0]]);
  const stored = rows.find(row => row.window_number === number);
  if (stored) return stored;
  const previous = rows.find(row => row.window_number === number-1);
  if (number && !previous) {
    const error = new Error('Refresh the feed to continue.'); error.status = 409; throw error;
  }
  if (!number) await query(`DELETE FROM feed_windows WHERE user_id=$1 AND token=$2
    AND filter_key=$3 AND created_at<=NOW()-INTERVAL '1 day'`, [userId,token,filterKey]);
  return { snapshot_at: previous?.snapshot_at || new Date().toISOString(),
    before: previous?.next_cursor, exhausted: previous?.has_more === false,
    ribbon_keys: previous?.request_keys, request_count: previous?.request_count,
    latest_post_at: previous?.latest_post_at };
}

// Race-safe: concurrent first requests use the same persisted order. Snapshots
// contain IDs only; every response still runs current visibility/status checks.
export async function saveFeedWindow(userId, token, filterKey, number, value) {
  if (!token) return value;
  const result = await query(`INSERT INTO feed_windows(user_id,token,filter_key,window_number,
    snapshot_at,item_keys,request_keys,next_cursor,has_more,request_count,latest_post_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(user_id,token,filter_key,window_number) DO UPDATE SET
      item_keys=feed_windows.item_keys RETURNING *`,
  [userId,token,filterKey,number,value.snapshot_at,JSON.stringify(value.item_keys),JSON.stringify(value.request_keys),
    JSON.stringify(value.next_cursor),value.has_more,value.request_count,value.latest_post_at]);
  return result.rows[0];
}

// Add a SQL limit before any data leaves the database. Keyset cursors avoid
// increasingly expensive OFFSET scans. Ten pages are ranked together.
export function boundFeedQuery(sql, params, alias, kind, state, size, ribbon = false) {
  const keys = state.item_keys ? [...state.item_keys, ...(ribbon ? state.request_keys : [])]
    : ribbon ? state.ribbon_keys : null;
  if (keys) {
    params.push(keys.filter(key => key.startsWith(`${kind}:`)).map(key => key.slice(kind.length+1)));
    sql += ` AND ${alias}.id = ANY($${params.length}::uuid[])`;
  } else {
    params.push(state.snapshot_at);
    sql += ` AND ${alias}.created_at <= $${params.length}::timestamptz`;
    if (state.before && !ribbon) {
      params.push(state.before.createdAt, state.before.id, state.before.type || 'listing');
      sql += ` AND (${alias}.created_at,${alias}.id,'${kind}'::text) < ($${params.length-2}::timestamptz,$${params.length-1}::uuid,$${params.length}::text)`;
    }
    if (state.exhausted && !ribbon) sql += ' AND FALSE';
  }
  params.push(size+1);
  return `${sql} ORDER BY ${alias}.created_at DESC,${alias}.id DESC LIMIT $${params.length}`;
}

export async function cleanupFeedHistory() {
  // Short, separately committed batches, with a time budget per table. Repeat
  // regularly so expired snapshots cannot accumulate faster than cleanup.
  for (const [table, predicate] of [
    ['feed_windows', "created_at<NOW()-INTERVAL '1 day'"],
    ['feed_sessions', "created_at<NOW()-INTERVAL '1 day'"],
    ['feed_events', "seen_at<NOW()-INTERVAL '31 days' AND (clicked_at IS NULL OR clicked_at<NOW()-INTERVAL '31 days')"],
  ]) {
    const deadline = Date.now()+5000;
    let removed;
    do {
      const result = await query(`DELETE FROM ${table} WHERE ctid IN (
        SELECT ctid FROM ${table} WHERE ${predicate} LIMIT 1000)`);
      removed = result.rowCount;
    } while (removed === 1000 && Date.now()<deadline);
  }
}
