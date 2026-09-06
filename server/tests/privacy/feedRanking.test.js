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
  expect(rankFeed([item('a'),item('b')],new Map([['listing:a',{ seen: true }]]),now,'fixed')[0].id).toBe('b');
});
it('keeps new posts high and is deterministic for a session', () => {
  const items = [item('old','listing',30),item('new','listing',0)];
  expect(rankFeed(items,new Map(),now,'fixed')[0].id).toBe('new');
  expect(rankFeed(items,new Map(),now,'fixed')).toEqual(rankFeed(items,new Map(),now,'fixed'));
});
