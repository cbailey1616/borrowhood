import { View, Text, StyleSheet } from 'react-native';
import ListingPrice, { listingPrice } from './ListingPrice';
import { Ionicons } from './Icon';
import { isSaleListing, isTransferListing } from '../utils/directFee';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

// Free listings need one badge. Paid listings also need the amount and unit.
export default function ListingOffer({ listing }) {
  const price = listingPrice(listing);
  const free = price.amount === 'Free';
  const label = free ? `Free ${price.unit}` : isSaleListing(listing) ? 'For sale' : 'To borrow';
  const icon = isSaleListing(listing) ? 'pricetag' : isTransferListing(listing) ? 'gift' : 'basket';
  return <View style={styles.offer}>
    <View accessible accessibilityLabel={label} style={styles.badge}>
      <Ionicons name={icon} size={18} illustrated />
      <Text style={styles.label}>{label}</Text>
    </View>
    {!free && <ListingPrice listing={listing} compact />}
  </View>;
}

const styles = StyleSheet.create({
  offer: { gap: SPACING.sm, alignItems: 'flex-start' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, backgroundColor: COLORS.primaryMuted, borderRadius: RADIUS.full, maxWidth: '100%' },
  label: { ...TYPOGRAPHY.caption1, fontWeight: '600', color: COLORS.primary, flexShrink: 1 },
});
