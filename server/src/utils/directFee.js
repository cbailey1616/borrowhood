// Informational only. Never use this field to calculate or collect payments.
export function normalizeDirectFee(value, listingType) {
  if (value == null) return null;
  // Permanent transfers may be free or sold for one flat, offline price.
  if (listingType === 'giveaway' && value.unit !== 'flat') throw new Error('Sale prices must be a one-time amount.');
  if (typeof value !== 'object' || Array.isArray(value) ||
      typeof value.amount !== 'number' || !Number.isFinite(value.amount) ||
      value.amount < 0.01 || value.amount > 100000 ||
      Math.abs(value.amount * 100 - Math.round(value.amount * 100)) > 0.000001 ||
      !['day', 'hour', 'flat'].includes(value.unit)) {
    throw new Error('Enter a valid price with up to two decimal places and a pricing unit.');
  }
  return { amount: value.amount, unit: value.unit, currency: 'USD' };
}
