import { directFeePayload, directFeeLabel } from '../../src/utils/directFee';
test('fee is optional and does not create checkout fields', () => {
  expect(directFeePayload(false, '20')).toBeNull();
  expect(directFeePayload(true, '2.50')).toEqual({ amount: 2.5, unit: 'day', currency: 'USD' });
});
test.each(['0', '-1', '1.999', 'NaN', '12oops', '100001', ''])('rejects invalid price %s', value => {
  expect(() => directFeePayload(true, value)).toThrow();
});
test('shows offline fee and keeps giveaways free', () => {
  expect(directFeeLabel({ directFee: { amount: 5, unit: 'day' } })).toBe('$5.00/day');
  expect(directFeeLabel({ listingType: 'giveaway', directFee: { amount: 5, unit: 'day' } })).toBe('Free to keep');
});
