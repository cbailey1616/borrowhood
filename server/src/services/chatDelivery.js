import { createHash } from 'node:crypto';

// Caller supplies a transaction-scoped client. Lock the participant pair so
// simultaneous sends cannot create duplicate conversations. Idempotency is
// account-scoped and binds the key to the complete, immutable payload.
export async function deliverMessage(client, { senderId, recipientId, content, imageUrl, listingId, clientRequestId }) {
  const blocked = await client.query('SELECT 1 FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)', [senderId, recipientId]);
  if (blocked.rows.length) { const error = new Error('Messages between these accounts are blocked.'); error.status = 403; throw error; }
  if (clientRequestId) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`message:${senderId}:${clientRequestId}`]);
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([recipientId, listingId || null, content || null, imageUrl || null])).digest('hex');
  if (clientRequestId) {
    const previous = await client.query('SELECT id, conversation_id, created_at, client_request_hash FROM messages WHERE sender_id = $1 AND client_request_id = $2', [senderId, clientRequestId]);
    if (previous.rows[0]) {
      if (previous.rows[0].client_request_hash !== fingerprint) {
        const error = new Error('This send attempt was already used for a different message.');
        error.status = 409;
        throw error;
      }
      return { ...previous.rows[0], replayed: true };
    }
  }
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`conversation:${[senderId, recipientId].sort().join(':')}`]);
  const existing = await client.query(`SELECT id FROM conversations
    WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)
    ORDER BY created_at ASC LIMIT 1`, [senderId, recipientId]);
  let conversationId = existing.rows[0]?.id;
  if (!conversationId) {
    const created = await client.query('INSERT INTO conversations (user1_id, user2_id, listing_id) VALUES ($1, $2, $3) RETURNING id', [senderId, recipientId, listingId || null]);
    conversationId = created.rows[0].id;
  } else if (listingId) {
    await client.query('UPDATE conversations SET listing_id = $1 WHERE id = $2 AND listing_id IS NULL', [listingId, conversationId]);
  }
  const result = clientRequestId
    ? await client.query(`INSERT INTO messages (conversation_id, sender_id, content, image_url, client_request_id, client_request_hash)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`, [conversationId, senderId, content || null, imageUrl || null, clientRequestId, fingerprint])
    : await client.query('INSERT INTO messages (conversation_id, sender_id, content, image_url) VALUES ($1, $2, $3, $4) RETURNING id, created_at', [conversationId, senderId, content || null, imageUrl || null]);
  return { ...result.rows[0], conversation_id: conversationId, replayed: false };
}
