import { query } from '../utils/db.js';

export async function ensureCommunityChatSchema(db = { query }) {
  await db.query(`CREATE TABLE IF NOT EXISTS community_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sequence BIGSERIAL UNIQUE,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
    parent_id UUID REFERENCES community_chat_messages(id) ON DELETE SET NULL,
    client_request_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ, UNIQUE(sender_id, client_request_id))`);
  await db.query('CREATE INDEX IF NOT EXISTS community_chat_timeline ON community_chat_messages(community_id, sequence DESC)');
  await db.query(`ALTER TABLE community_memberships
    ADD COLUMN IF NOT EXISTS chat_read_sequence BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS chat_muted BOOLEAN NOT NULL DEFAULT false`);
}

// Shared by the inbox and app badge. Explicit membership, not the legacy
// geographic type, controls chat access. A removed member has no access.
export async function communityConversations(userId, db = { query }, communityId = null) {
  const result = await db.query(`SELECT c.id, c.name, c.banner_url, cm.chat_muted,
    m.content, m.deleted_at, m.created_at, m.sender_id,
    (SELECT COUNT(*) FROM community_chat_messages msg
      WHERE msg.community_id = c.id AND msg.sequence > cm.chat_read_sequence
      AND msg.sender_id != $1 AND msg.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
        (b.user_id = $1 AND b.blocked_id = msg.sender_id) OR
        (b.blocked_id = $1 AND b.user_id = msg.sender_id))) AS unread_count
    FROM community_memberships cm JOIN communities c ON c.id = cm.community_id
    LEFT JOIN LATERAL (SELECT content, deleted_at, created_at, sender_id FROM community_chat_messages msg
      WHERE msg.community_id = c.id AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
        (b.user_id = $1 AND b.blocked_id = msg.sender_id) OR
        (b.blocked_id = $1 AND b.user_id = msg.sender_id))
      ORDER BY sequence DESC LIMIT 1) m ON true
    WHERE cm.user_id = $1 AND c.is_active = true
    ${communityId ? 'AND c.id = $2' : ''}`, communityId ? [userId, communityId] : [userId]);
  return result.rows.map(c => ({ id: `community:${c.id}`, kind: 'community', communityId: c.id,
    name: c.name, photoUrl: c.banner_url, muted: c.chat_muted,
    lastMessage: c.deleted_at ? 'Message removed' : c.content,
    lastMessageAt: c.created_at, lastMessageSenderId: c.sender_id,
    unreadCount: c.chat_muted ? 0 : Number(c.unread_count),
  }));
}
