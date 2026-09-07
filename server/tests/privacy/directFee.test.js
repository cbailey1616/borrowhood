import { describe, it, expect } from 'vitest';
import { normalizeDirectFee } from '../../src/utils/directFee.js';
describe('offline informational pricing', () => {
  it('normalizes an amount without generating checkout fields', () => {
    expect(normalizeDirectFee({ amount: 2.5, unit: 'day' }, 'lend')).toEqual({ amount: 2.5, unit: 'day', currency: 'USD' });
    expect(normalizeDirectFee(null, 'lend')).toBeNull();
  });
  it('rejects recurring prices for permanent transfers', () => {
    expect(() => normalizeDirectFee({ amount: 5, unit: 'day' }, 'giveaway')).toThrow();
  });
  it('rejects one-time prices on giveaways', () => {
    expect(() => normalizeDirectFee({ amount: 25.5, unit: 'flat' }, 'giveaway')).toThrow('Giveaways must be free.');
    expect(normalizeDirectFee(null, 'giveaway')).toBeNull();
  });
  it('requires a valid one-time price for sales', () => {
    expect(normalizeDirectFee({ amount: 25, unit: 'flat' }, 'sell')).toEqual({ amount: 25, unit: 'flat', currency: 'USD' });
    expect(() => normalizeDirectFee(null, 'sell')).toThrow();
    expect(() => normalizeDirectFee({ amount: 25, unit: 'day' }, 'sell')).toThrow();
  });
  it.each([NaN, Infinity, -1, 0, 1.234, 100001, '2.50'])('rejects invalid amount %s', amount => {
    expect(() => normalizeDirectFee({ amount, unit: 'day' }, 'lend')).toThrow();
  });
});
