import { createHash } from 'node:crypto';
import { withTransaction } from '../utils/db.js';

export async function ensurePublicationSchema() {
  await withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('schema:publication-receipts', 0))");
    await client.query(`CREATE TABLE IF NOT EXISTS publication_receipts (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation TEXT NOT NULL,
    request_id UUID NOT NULL,
    payload_hash TEXT NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, operation, request_id)
    )`);
  });
}

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

// Commit the post and its receipt together. A retry after a lost response must
// return the original result, never publish a second item or send another alert.
export async function publishOnce({ userId, operation, payload }, create) {
  const { clientRequestId, ...body } = payload;
  return withTransaction(async client => {
    let fingerprint;
    if (clientRequestId) {
      fingerprint = createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`publish:${userId}:${operation}:${clientRequestId}`]);
      const previous = await client.query(
        'SELECT payload_hash, result FROM publication_receipts WHERE user_id=$1 AND operation=$2 AND request_id=$3',
        [userId, operation, clientRequestId]
      );
      if (previous.rows[0]) {
        if (previous.rows[0].payload_hash !== fingerprint) {
          throw Object.assign(new Error('This submission was already used for a different post.'), { status: 409 });
        }
        return { value: previous.rows[0].result, replayed: true };
      }
    }
    const value = await create(client);
    if (clientRequestId) await client.query(
      'INSERT INTO publication_receipts (user_id, operation, request_id, payload_hash, result) VALUES ($1,$2,$3,$4,$5)',
      [userId, operation, clientRequestId, fingerprint, JSON.stringify(value)]
    );
    return { value, replayed: false };
  });
}
