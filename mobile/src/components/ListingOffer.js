import { View, Text, StyleSheet } from 'react-native';
import ListingPrice, { listingPrice } from './ListingPrice';
import ListingTypeIcon from './ListingTypeIcon';
import { isSaleListing } from '../utils/directFee';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

// Free listings need one badge. Paid listings also need the amount and unit.
export default function ListingOffer({ listing, alignment = 'start', showPrice = true }) {
  const price = listingPrice(listing);
  const free = price.amount === 'Free';
  const label = free ? `Free ${price.unit}` : isSaleListing(listing) ? 'For sale' : 'To borrow';
  return <View style={[styles.offer, alignment === 'end' && styles.end]}>
    <View accessible accessibilityLabel={label} style={styles.badge}>
      <ListingTypeIcon listing={listing} />
      <Text style={styles.label}>{label}</Text>
    </View>
    {showPrice && !free && <ListingPrice listing={listing} compact alignment={alignment} />}
  </View>;
}

const styles = StyleSheet.create({
  offer: { gap: SPACING.sm, alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, backgroundColor: COLORS.primaryMuted, borderRadius: RADIUS.full, maxWidth: '100%' },
  label: { ...TYPOGRAPHY.caption1, fontWeight: '400', color: COLORS.primary, flexShrink: 1 },
});
