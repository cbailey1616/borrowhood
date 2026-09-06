import { createHash } from 'node:crypto';

export function rankFeed(items, signals, now, seed) {
  return items.map(item => {
    const signal = signals.get(`${item.type}:${item.id}`) || {};
    const ageDays = Math.max(0, (now - new Date(item.createdAt).getTime()) / 86400000);
    const freshness = 220 * Math.exp(-ageDays / 7);
    const popularity = Math.min(200, 65 * Math.log1p(Number(signal.clicks) || 0));
    const wanted = item.type === 'request' ? 90 : 0;
    const unseen = signal.seen ? 0 : 260;
    const tie = parseInt(createHash('sha256').update(`${seed}:${item.type}:${item.id}`).digest('hex').slice(0, 6), 16) / 0xffffff;
    return { item, score: freshness + popularity + wanted + unseen + tie * 30 };
  }).sort((a, b) => b.score - a.score).map(({ item }) => item);
}
