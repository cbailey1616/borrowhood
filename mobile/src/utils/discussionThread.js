import { COLORS } from './config';

// Match the rest of the app; small secondary text also stays AA-readable on pills.
export const DISCUSSION_LIGHT_COLORS = { ...COLORS, textMuted: COLORS.textSecondary };

export function formatDiscussionTime(value, now = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const minutes = Math.floor(Math.max(0, now - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function discussionInitials(user) {
  const name = user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const parts = name.split(/\s+/).map(part => part.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0] || 'N').toUpperCase();
}

// Both rectangles come from measureInWindow, including the native header/safe areas.
export function composerScrollOffset(offset, viewport, composer, margin = 8) {
  if (!viewport || !composer || viewport.height <= 0 || composer.height <= 0) return offset;
  const top = viewport.y + margin;
  const bottom = viewport.y + viewport.height - margin;
  if (composer.y + composer.height > bottom) return Math.max(0, offset + composer.y + composer.height - bottom);
  if (composer.y < top) return Math.max(0, offset + composer.y - top);
  return offset;
}

export { REACTION_OPTIONS as DISCUSSION_EMOJIS } from './reactions';

export const DISCUSSION_DARK_COLORS = {
  ...COLORS, background: COLORS.discussionDark.background, surface: COLORS.discussionDark.surface, surfaceElevated: COLORS.discussionDark.surfaceElevated,
  text: COLORS.discussionDark.text, textSecondary: COLORS.discussionDark.textSecondary, textMuted: COLORS.discussionDark.textMuted,
  primary: COLORS.discussionDark.primary, primaryDark: COLORS.discussionDark.primaryDark, primaryLight: COLORS.discussionDark.primaryLight, primaryMuted: COLORS.discussionDark.primaryMuted,
  border: COLORS.discussionDark.border, borderLight: COLORS.discussionDark.separator, separator: COLORS.discussionDark.separator, danger: COLORS.discussionDark.danger,
};
// Comments always follow the conversation: older first, newest at the bottom.
// Stable ID ordering makes pagination deterministic when timestamps match.
export function sortDiscussion(items) {
  return [...items].sort((a,b) => {
    const dates = (new Date(a.createdAt).getTime() || 0) - (new Date(b.createdAt).getTime() || 0);
    return dates || String(a.id).localeCompare(String(b.id));
  });
}

// Flatten for FlatList virtualization, keeping real ancestry separate from visual depth.
export function flattenDiscussion(posts, replies, expanded, collapsed) {
  const rows = [];
  for (const root of sortDiscussion(posts)) {
    rows.push({ ...root, rootId: root.id, depth: 0 });
    if (!expanded.has(root.id) || collapsed.has(root.id)) continue;
    const children = new Map();
    const items = replies[root.id] || [];
    const ids = new Set(items.map(item => item.id));
    for (const item of items) {
      const parent = item.replyToId && ids.has(item.replyToId) ? item.replyToId : root.id;
      children.set(parent, [...(children.get(parent) || []), item]);
    }
    const visited = new Set([root.id]);
    const visit = (parentId, depth) => {
      for (const child of sortDiscussion(children.get(parentId) || [])) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        rows.push({ ...child, rootId: root.id, depth });
        if (!collapsed.has(child.id)) visit(child.id, depth + 1);
      }
    };
    visit(root.id, 1);
  }
  return rows;
}

// Remove the whole branch so orphaned descendants cannot reappear at the root.
export function removeDiscussionBranch(items, id) {
  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (!removed.has(item.id) && removed.has(item.replyToId)) {
        removed.add(item.id); changed = true;
      }
    }
  }
  return { items: items.filter(item => !removed.has(item.id)), removed };
}
