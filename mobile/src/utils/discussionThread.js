import { COLORS } from './config';

export const DISCUSSION_EMOJIS = [
  ['👍','Like'],['❤️','Love'],['😂','Laugh'],['😮','Surprised'],['😢','Sad'],
  ['🔥','Fire'],['🎉','Celebrate'],['👀','Eyes'],['💯','Hundred percent'],
  ['🙏','Thank you'],['🤔','Thinking'],['👏','Applause'],['🙌','Raised hands'],
  ['😊','Smile'],['✅','Check'],['🤝','Handshake'],['✨','Sparkles'],['🛋️','Sofa'],['👎','Dislike'],
].map(([emoji,label]) => ({ key: emoji, emoji, label }));

export const DISCUSSION_DARK_COLORS = {
  ...COLORS, background: '#151D19', surface: '#202B24', surfaceElevated: '#29362C',
  text: '#EEF2E9', textSecondary: '#CDD6CC', textMuted: '#A0ABA1',
  primary: '#BCD7A5', primaryDark: '#CFE4BC', primaryLight: '#859D71', primaryMuted: '#30432F',
  border: '#435043', borderLight: '#354238', separator: '#354238', danger: '#F0A493',
};
export function sortDiscussion(items, order = 'top') {
  return [...items].sort((a,b) => {
    const dates = (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0);
    if (order === 'oldest') return -dates || String(a.id).localeCompare(String(b.id));
    if (order === 'newest') return dates || String(b.id).localeCompare(String(a.id));
    return (b.score || 0) - (a.score || 0) || dates || String(b.id).localeCompare(String(a.id));
  });
}

// Flatten for FlatList virtualization, keeping real ancestry separate from visual depth.
export function flattenDiscussion(posts, replies, expanded, collapsed, order) {
  const rows = [];
  for (const root of sortDiscussion(posts, order)) {
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
      for (const child of sortDiscussion(children.get(parentId) || [], order)) {
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

// Suggestions only use identities already visible in this discussion, never a global directory.
export function discussionMentions(posts, replies, currentUser) {
  const users = new Map();
  const add = user => { if (user?.id) users.set(user.id, user); };
  add(currentUser);
  posts.forEach(post => add(post.user));
  Object.values(replies).flat().forEach(reply => add(reply.user));
  const handles = new Map();
  return [...users.values()].map(user => {
    const name = user.displayName || [user.firstName,user.lastName].filter(Boolean).join(' ') || 'Neighbor';
    const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'') || 'Neighbor';
    const handle = handles.has(base.toLowerCase()) ? `${base}_${String(user.id).replace(/[^a-zA-Z0-9]/g,'').slice(-4)}` : base;
    handles.set(handle.toLowerCase(), user.id);
    return { ...user, name, handle };
  });
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
