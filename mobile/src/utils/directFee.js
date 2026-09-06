export function directFeePayload(enabled, amount, unit = 'day') {
  if (!enabled) return null;
  const text = String(amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text) || Number(text) < 0.01 || Number(text) > 100000 || !['day', 'hour', 'flat'].includes(unit)) {
    throw new Error('Enter a price greater than $0, with up to two decimal places.');
  }
  return { amount: Number(text), unit, currency: 'USD' };
}
export function directFeeLabel(listing) {
  if (listing.listingType === 'giveaway') return 'Free to keep';
  if (!listing.directFee) return null;
  const { amount, unit } = listing.directFee;
  return `$${Number(amount).toFixed(2)}${unit === 'flat' ? ' flat fee' : `/${unit}`}`;
}
