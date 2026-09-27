import { it, expect } from 'vitest';
import { rankFeed } from '../../src/utils/feedRanking.js';
const now = Date.parse('2026-09-07T00:00:00Z');
const item = (id, type = 'listing', days = 2) => ({ id, type, createdAt: new Date(now - days * 86400000).toISOString() });
it('promotes popular listings at equal age and exposure', () => {
  const result = rankFeed([item('a'),item('b')], new Map([['listing:b',{ clicks: 10 }]]),now,'fixed');
  expect(result[0].id).toBe('b');
});
it('promotes wanted items and services and unseen content', () => {
  expect(rankFeed([item('a'),item('b','request')],new Map(),now,'fixed')[0].id).toBe('b');
  expect(rankFeed([item('a'),item('b')],new Map([['listing:a',{ last_seen_at: new Date(now).toISOString() }]]),now,'fixed')[0].id).toBe('b');
});
it('keeps new posts high and is deterministic for a session', () => {
  const items = [item('old','listing',30),item('new','listing',0)];
  expect(rankFeed(items,new Map(),now,'fixed')[0].id).toBe('new');
  expect(rankFeed(items,new Map(),now,'fixed')).toEqual(rankFeed(items,new Map(),now,'fixed'));
});
it('puts an unseen older item ahead of a popular post viewed in the past day', () => {
  const posts = [item('popular', 'request', 0), item('unseen', 'listing', 25)];
  const signals = new Map([['request:popular', { clicks: 1000, last_seen_at: new Date(now - 12 * 3600000).toISOString() }]]);
  expect(rankFeed(posts, signals, now, 'fixed').map(post => post.id)).toEqual(['unseen', 'popular']);
});
it('gradually resurfaces viewed posts while keeping every post reachable', () => {
  const posts = [item('today'), item('three-days'), item('week')];
  const signals = new Map(posts.map((post, index) => [`listing:${post.id}`, {
    last_seen_at: new Date(now - [0, 3, 7][index] * 86400000).toISOString(),
  }]));
  expect(rankFeed(posts, signals, now, 'fixed').map(post => post.id)).toEqual(['week', 'three-days', 'today']);
  const popular = [item('seen-popular', 'listing', 5), item('unseen', 'listing', 30)];
  expect(rankFeed(popular, new Map([['listing:seen-popular', {
    clicks: 100, last_seen_at: new Date(now - 7 * 86400000).toISOString(),
  }]]), now, 'fixed')[0].id).toBe('seen-popular');
});
