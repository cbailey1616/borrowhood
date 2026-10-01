import { visibleDiscussionSql } from './discussionControls.js';
import { query } from '../utils/db.js';
import { listingAccessSql, requestAccessSql } from '../utils/sharingPolicy.js';
import { townPreviewSql } from './townPreview.js';
import { communityChatVisibleSql } from './communityChat.js';
import { unblockedSql } from './contentPolicy.js';

const unavailable = () => Object.assign(new Error('This content is no longer available.'), { status: 404 });
// Resolve the author internally. In particular, a Town preview never returns
// an author ID to the client, even when reporting or blocking its author.
export async function resolveReportContent(type, id, viewer, db = { query }) {
  let sql;
  if (type === 'listing') sql = `SELECT l.owner_id AS author, l.title, l.description AS content,
    ARRAY(SELECT url FROM listing_photos WHERE listing_id=l.id ORDER BY sort_order) AS photos
    FROM listings l WHERE l.id=$1 AND (${listingAccessSql('l', '$2')} OR ${townPreviewSql('l', 'owner_id', '$2', { listing: true })})`;
  if (type === 'request') sql = `SELECT r.user_id AS author, r.title, r.description AS content,
    ARRAY_REMOVE(ARRAY[r.photo_url], NULL) AS photos FROM item_requests r WHERE r.id=$1
    AND (${requestAccessSql('r', '$2')} OR ${townPreviewSql('r', 'user_id', '$2')})`;
  if (type === 'discussion') sql = `SELECT d.user_id AS author, 'Comment' AS title, d.content, ARRAY[]::text[] AS photos
    FROM listing_discussions d JOIN listing_discussions root ON root.id=COALESCE(d.parent_id,d.id)
    WHERE d.id=$1 AND d.is_hidden=false AND root.is_hidden=false AND ${visibleDiscussionSql('d', '$2')}
    AND ${unblockedSql('d.user_id', '$2')} AND ${unblockedSql('root.user_id', '$2')}
    AND (EXISTS (SELECT 1 FROM listings l WHERE l.id=d.listing_id AND ${listingAccessSql('l', '$2')})
      OR EXISTS (SELECT 1 FROM item_requests r WHERE r.id=d.request_id AND ${requestAccessSql('r', '$2')}))`;
  if (type === 'community_message') sql = `SELECT m.sender_id AS author, 'Neighborhood message' AS title, m.content, ARRAY[]::text[] AS photos
    FROM community_chat_messages m JOIN community_memberships cm ON cm.community_id=m.community_id AND cm.user_id=$2
    JOIN communities c ON c.id=m.community_id AND c.is_active=true
    WHERE m.id=$1 AND m.deleted_at IS NULL AND ${communityChatVisibleSql('m', 'cm.joined_at')}
    AND ${unblockedSql('m.sender_id', '$2')}`;
  if (type === 'message') sql = `SELECT m.sender_id AS author, 'Private message' AS title, m.content,
    ARRAY_REMOVE(ARRAY[m.image_url],NULL) AS photos FROM messages m JOIN conversations c ON c.id=m.conversation_id
    WHERE m.id=$1 AND m.deleted_at IS NULL AND (c.user1_id=$2 OR c.user2_id=$2)`;
  if (!sql) throw unavailable();
  const row = (await db.query(sql, [id, viewer])).rows[0];
  if (!row || row.author === viewer) throw unavailable();
  return row;
}

export async function removeReportedContent(db, report, adminId) {
  const id = report.content_id;
  switch (report.content_type) {
    case 'listing':
      await db.query(`UPDATE listings SET status='deleted', is_available=false, title='Removed by Borrowhood', description='', moderation_removed_at=NOW() WHERE id=$1`, [id]);
      await db.query('DELETE FROM listing_photos WHERE listing_id=$1', [id]);
      await db.query('UPDATE listing_discussions SET is_hidden=true, hidden_by=$2, hidden_at=NOW() WHERE listing_id=$1', [id, adminId]);
      break;
    case 'request':
      await db.query(`UPDATE item_requests SET status='closed', title='Removed by Borrowhood', description='', photo_url=NULL, moderation_removed_at=NOW() WHERE id=$1`, [id]);
      await db.query('UPDATE listing_discussions SET is_hidden=true, hidden_by=$2, hidden_at=NOW() WHERE request_id=$1', [id, adminId]);
      break;
    case 'discussion':
      await db.query('UPDATE listing_discussions SET is_hidden=true, hidden_by=$2, hidden_at=NOW() WHERE id=$1 OR parent_id=$1', [id, adminId]);
      break;
    case 'community_message':
      await db.query("UPDATE community_chat_messages SET deleted_at=NOW(), content='Message removed' WHERE id=$1 OR parent_id=$1", [id]);
      break;
    case 'message':
      await db.query("UPDATE messages SET deleted_at=NOW(), content='Message removed', image_url=NULL WHERE id=$1", [id]);
      break;
    default: throw Object.assign(new Error('This report does not identify removable content.'), { status: 409 });
  }
}
