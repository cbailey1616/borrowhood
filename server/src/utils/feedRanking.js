import { createHash } from 'node:crypto';

const DAY_MS = 86400000;
const DISCOVERY_BOOST = 600;

export function rankFeed(items, signals, now, seed) {
  return items.map(item => {
    const signal = signals.get(`${item.type}:${item.id}`) || {};
    const ageDays = Math.max(0, (now - new Date(item.createdAt).getTime()) / DAY_MS);
    const freshness = 220 * Math.exp(-ageDays / 7);
    const popularity = Math.min(200, 65 * Math.log1p(Number(signal.clicks) || 0));
    const wanted = item.type === 'request' ? 90 : 0;
    const lastSeen = signal.last_seen_at ? new Date(signal.last_seen_at).getTime() : NaN;
    const daysSinceSeen = Math.max(0, (now - lastSeen) / DAY_MS);
    // Unseen posts outrank even a popular recent view. After a day's cooldown,
    // seen posts gradually recover their discovery boost over the next six days.
    // Ranking never removes a viewed post, including from search and filters.
    const discovery = Number.isFinite(lastSeen)
      ? DISCOVERY_BOOST * Math.min(1, Math.max(0, daysSinceSeen - 1) / 6)
      : DISCOVERY_BOOST;
    const tie = parseInt(createHash('sha256').update(`${seed}:${item.type}:${item.id}`).digest('hex').slice(0, 6), 16) / 0xffffff;
    return { item, score: freshness + popularity + wanted + discovery + tie * 30 };
  }).sort((a, b) => b.score - a.score).map(({ item }) => item);
}
