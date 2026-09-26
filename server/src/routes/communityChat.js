import { Router } from 'express';
import { withTransaction } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { communityConversations, communityChatVisibleSql } from '../services/communityChat.js';

const router = Router({ mergeParams: true });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sequence = value => typeof value === 'string' && /^\d{1,18}$/.test(value);
const blocked = `NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
  (b.user_id = $2 AND b.blocked_id = m.sender_id) OR (b.blocked_id = $2 AND b.user_id = m.sender_id))`;

// All operations recheck membership under a lock in the same transaction as the
// read/write. Removal cannot race a send or expose messages after membership ends.
function memberRoute(handler) {
  return async (req, res) => {
    if (!uuid(req.params.id)) return res.status(400).json({ error: 'Invalid neighborhood' });
    try {
      const data = await withTransaction(async db => {
        // Keep PostgreSQL's full timestamp precision for the cutoff; a JS Date
        // rounds to milliseconds and can let messages from just before joining in.
        const member = await db.query(`SELECT cm.role, cm.chat_muted, cm.joined_at::text AS chat_joined_at FROM community_memberships cm
          JOIN communities c ON c.id = cm.community_id WHERE cm.community_id = $1 AND cm.user_id = $2
          AND c.is_active = true FOR UPDATE OF cm`, [req.params.id, req.user.id]);
        if (!member.rows.length) throw Object.assign(new Error('Join this neighborhood to access its chat'), { status: 403 });
        return handler(req, db, member.rows[0]);
      });
      res.json(data);
    } catch (error) {
      if (!error.status) console.error('Neighborhood chat error:', error);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not update neighborhood chat' });
    }
  };
}
function invalid(message, status = 400) { throw Object.assign(new Error(message), { status }); }
router.use(authenticate);
// The overview shares Inbox's preview and unread rules, without marking chat read.
router.get('/summary', memberRoute(async (req, db) => {
  const [summary] = await communityConversations(req.user.id, db, req.params.id);
  return summary;
}));
router.get('/', memberRoute(async (req, db, member) => {
  const { before, parentId } = req.query;
  if (before && !sequence(before)) invalid('Invalid page');
  if (parentId && !uuid(parentId)) invalid('Invalid thread');
  if (parentId) {
    const parent = await db.query(`SELECT m.id FROM community_chat_messages m WHERE m.id = $3
      AND m.community_id = $1 AND m.parent_id IS NULL AND m.created_at >= $4::timestamptz
      AND ${blocked}`, [req.params.id, req.user.id, parentId, member.chat_joined_at]);
    if (!parent.rows.length) invalid('This thread is unavailable', 404);
  }
  const watermark = await db.query('SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM community_chat_messages WHERE community_id = $1', [req.params.id]);
  const rows = await db.query(`SELECT m.id, m.sequence::text, m.parent_id, m.created_at,
    CASE WHEN m.deleted_at IS NULL THEN m.content ELSE 'Message removed' END AS content,
    (m.deleted_at IS NOT NULL) AS deleted, m.sender_id,
    COALESCE(NULLIF(TRIM(u.display_name), ''), u.first_name) AS name, u.profile_photo_url,
    (SELECT COUNT(*) FROM community_chat_messages reply WHERE reply.parent_id = m.id
      AND reply.created_at >= $6::timestamptz
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
        (b.user_id = $2 AND b.blocked_id = reply.sender_id) OR (b.blocked_id = $2 AND b.user_id = reply.sender_id))) AS reply_count
    FROM community_chat_messages m JOIN users u ON u.id = m.sender_id
    WHERE m.community_id = $1 AND ${blocked} AND m.sequence <= $5::bigint
    AND ${communityChatVisibleSql('m', '$6::timestamptz')}
    AND (($3::uuid IS NULL AND m.parent_id IS NULL) OR m.parent_id = $3 OR m.id = $3)
    AND ($4::bigint IS NULL OR m.sequence < $4)
    ORDER BY m.sequence DESC LIMIT 51`, [req.params.id, req.user.id, parentId || null, before || null, watermark.rows[0].sequence, member.chat_joined_at]);
  const page = rows.rows.slice(0, 50);
  return { messages: page.map(m => ({ id: m.id, sequence: m.sequence, content: m.content,
    parentId: m.parent_id, createdAt: m.created_at, deleted: m.deleted,
    sender: { id: m.sender_id, name: m.name, photoUrl: m.profile_photo_url }, replyCount: Number(m.reply_count) })),
    nextBefore: rows.rows.length > 50 ? page[page.length - 1].sequence : null,
    readSequence: watermark.rows[0].sequence, muted: member.chat_muted, role: member.role };
}));
router.post('/', memberRoute(async (req, db, member) => {
  const { content, parentId, clientRequestId } = req.body;
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 2000 || !uuid(clientRequestId)) invalid('Enter a message up to 2,000 characters');
  if (parentId && !uuid(parentId)) invalid('Invalid thread');
  // Serialize channel sends so sequence order is also commit order.
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`community-chat:${req.params.id}`]);
  if (parentId) {
    const parent = await db.query(`SELECT m.id FROM community_chat_messages m WHERE m.id = $3
      AND m.community_id = $1 AND m.parent_id IS NULL AND m.deleted_at IS NULL
      AND m.created_at >= $4::timestamptz AND ${blocked}`, [req.params.id, req.user.id, parentId, member.chat_joined_at]);
    if (!parent.rows.length) invalid('This thread is unavailable', 404);
  }
  const previous = await db.query(`SELECT *, created_at >= $3::timestamptz AS since_join
    FROM community_chat_messages WHERE sender_id = $1 AND client_request_id = $2`, [req.user.id, clientRequestId, member.chat_joined_at]);
  if (previous.rows.length) {
    const row = previous.rows[0];
    if (!row.since_join || row.community_id !== req.params.id || row.content !== content.trim() || row.parent_id !== (parentId || null)) invalid('Message retry does not match', 409);
    return { id: row.id };
  }
  const result = await db.query(`INSERT INTO community_chat_messages(community_id, sender_id, content, parent_id, client_request_id)
    VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.params.id, req.user.id, content.trim(), parentId || null, clientRequestId]);
  return result.rows[0];
}));
router.post('/read', memberRoute(async (req, db) => {
  if (!sequence(req.body.sequence)) invalid('Invalid read position');
  // Mark only the snapshot the client actually loaded, never a later arrival.
  await db.query(`UPDATE community_memberships SET chat_read_sequence = GREATEST(chat_read_sequence,
    LEAST($3::bigint, (SELECT COALESCE(MAX(sequence),0) FROM community_chat_messages WHERE community_id = $1)))
    WHERE community_id = $1 AND user_id = $2`, [req.params.id, req.user.id, req.body.sequence]);
  return { success: true };
}));
router.patch('/preferences', memberRoute(async (req, db) => {
  if (typeof req.body.muted !== 'boolean') invalid('Invalid mute preference');
  await db.query('UPDATE community_memberships SET chat_muted = $3 WHERE community_id = $1 AND user_id = $2', [req.params.id, req.user.id, req.body.muted]);
  return { muted: req.body.muted };
}));
router.delete('/:messageId', memberRoute(async (req, db, member) => {
  if (!uuid(req.params.messageId)) invalid('Invalid message');
  const result = await db.query(`UPDATE community_chat_messages m SET deleted_at = COALESCE(m.deleted_at, NOW())
    WHERE m.community_id = $1 AND m.id = $2 AND (m.sender_id = $3 OR $4)
    AND ${communityChatVisibleSql('m', '$5::timestamptz')} RETURNING m.id`,
  [req.params.id, req.params.messageId, req.user.id, member.role === 'organizer', member.chat_joined_at]);
  if (!result.rows.length) invalid('Message unavailable or removal not permitted', 403);
  return { success: true };
}));
export default router;
