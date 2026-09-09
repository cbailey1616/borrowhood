import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

// One presentation for feed and detail prices. Giveaways always remain free,
// even if an older listing still carries a fee from before its type changed.
export function listingPrice(listing = {}) {
  if (listing.listingType === 'giveaway') return { amount: 'Free', unit: 'to keep', kind: 'Giveaway' };
  const sale = listing.listingType === 'sell';
  const fee = listing.directFee;
  const value = Number(fee?.amount);
  const kind = sale ? 'Sale price' : 'Borrowing price';
  if (fee && Number.isFinite(value) && value > 0) {
    return {
      amount: `$${value.toFixed(2)}`,
      unit: sale ? 'one-time price' : fee.unit === 'hour' ? 'per hour' : fee.unit === 'flat' ? 'flat fee' : 'per day',
      kind,
      paid: true,
    };
  }
  if (sale) return { amount: 'Ask for price', unit: '', kind };
  const legacyPrice = Number(listing.pricePerDay);
  if (listing.isFree === false && Number.isFinite(legacyPrice) && legacyPrice > 0) {
    return { amount: `$${legacyPrice.toFixed(2)}`, unit: 'per day', kind, paid: true };
  }
  return { amount: 'Free', unit: 'to borrow', kind };
}

export default function ListingPrice({ listing, compact = false }) {
  const price = listingPrice(listing);
  return (
    <View accessible accessibilityLabel={`${price.amount}${price.unit ? ` ${price.unit}` : ''}`} style={styles.row}>
      <Text style={[styles.amount, compact && styles.compact]}>{price.amount}</Text>
      {!!price.unit && <Text style={styles.unit}>{price.unit}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: SPACING.sm, rowGap: 2 },
  amount: { ...TYPOGRAPHY.largeTitle, color: COLORS.primaryDark, fontVariant: ['tabular-nums'], fontWeight: '700', fontFamily: 'DMSans_700Bold' },
  compact: { fontSize: 25, lineHeight: 32, letterSpacing: -0.5 },
  unit: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
