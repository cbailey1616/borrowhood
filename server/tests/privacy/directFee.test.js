import { describe, it, expect } from 'vitest';
import { normalizeDirectFee } from '../../src/utils/directFee.js';
describe('offline informational pricing', () => {
  it('normalizes an amount without generating checkout fields', () => {
    expect(normalizeDirectFee({ amount: 2.5, unit: 'day' }, 'lend')).toEqual({ amount: 2.5, unit: 'day', currency: 'USD' });
    expect(normalizeDirectFee(null, 'lend')).toBeNull();
  });
  it('never permits a fee for giveaways', () => {
    expect(() => normalizeDirectFee({ amount: 5, unit: 'day' }, 'giveaway')).toThrow();
  });
  it.each([NaN, Infinity, -1, 0, 1.234, 100001, '2.50'])('rejects invalid amount %s', amount => {
    expect(() => normalizeDirectFee({ amount, unit: 'day' }, 'lend')).toThrow();
  });
});
