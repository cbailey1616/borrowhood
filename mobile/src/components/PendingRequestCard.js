import ListingTypeIcon from './ListingTypeIcon';
import { View, Text, Image, StyleSheet } from 'react-native';
import ListingOffer from './ListingOffer';
import HapticPressable from './HapticPressable';
import { CARD_SURFACE, COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const shortDate = value => value ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
export default function PendingRequestCard({ transaction: t, onMessage, onCancel, onViewItem, busy, error, onRetry }) {
  const hasOtherRequests = t.queue?.hasOtherRequests ?? (t.queue?.aheadCount > 0);
  const waiting = t.queue?.waiting;
  return <View style={styles.page}>
    <HapticPressable style={[styles.card, styles.item]} accessibilityLabel={`View ${t.listing.title}`} onPress={onViewItem}>
      {t.listing.photos?.[0] ? <Image source={{ uri: t.listing.photos[0] }} style={styles.photo} /> : <ListingTypeIcon listing={t} size={48} />}
      <View style={{ flex: 1, gap: SPACING.sm }}>
        <Text style={styles.title}>{t.listing.title}</Text>
        <ListingOffer listing={{ ...t.listing, listingType: t.listingType ?? t.listing.listingType, directFee: t.directFee ?? t.listing.directFee, pricePerDay: t.dailyRate, isFree: !t.dailyRate }} />
        <Text style={styles.body}>From {t.lender.firstName}</Text>
      </View>
    </HapticPressable>
    <View style={[styles.card, { backgroundColor: COLORS.primaryMuted }]} testID="Transaction.nextStep" accessibilityLiveRegion="polite">
      <Text style={styles.title}>{waiting ? 'Reserved for another neighbor' : 'Request sent'}</Text>
      <Text style={styles.body}>{waiting ? 'Your request is still waiting.' : 'Your request is being reviewed.'}</Text>
      {hasOtherRequests && <Text style={styles.body}>Multiple people have submitted a request. Some may be ahead of you.</Text>}
      {!!error && <><Text style={styles.body}>Couldn’t refresh your request.</Text><HapticPressable style={styles.button} onPress={onRetry}><Text style={styles.buttonText}>Try again</Text></HapticPressable></>}
    </View>
    {((t.startDate && !['sell', 'giveaway'].includes(t.listingType)) || t.borrowerMessage) && <View style={styles.card}>
      {!['sell', 'giveaway'].includes(t.listingType) && !!t.startDate && <Text style={styles.body}>{shortDate(t.startDate)}{t.endDate ? ` – ${shortDate(t.endDate)}` : ''}</Text>}
      {!!t.borrowerMessage && <Text style={styles.body}>{t.borrowerMessage}</Text>}
    </View>}
    <HapticPressable accessibilityLabel="Message owner" testID="Transaction.button.message" style={styles.button} onPress={onMessage}><Text style={styles.buttonText}>Message owner</Text></HapticPressable>
    <HapticPressable accessibilityLabel="Cancel request" testID="Transaction.button.cancel" style={[styles.button, { borderColor: COLORS.danger, backgroundColor: COLORS.danger }]} disabled={busy} onPress={onCancel}><Text style={[styles.buttonText, { color: COLORS.surface }]}>Cancel request</Text></HapticPressable>
  </View>;
}
const styles = StyleSheet.create({
  page: { gap: SPACING.lg },
  card: { ...CARD_SURFACE, borderRadius: RADIUS.xl, padding: SPACING.lg, gap: SPACING.md },
  item: { flexDirection: 'row', alignItems: 'center' },
  photo: { width: 88, height: 100, borderRadius: RADIUS.md },
  title: { ...TYPOGRAPHY.title2, fontSize: 24, fontWeight: '400', color: COLORS.primary },
  body: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  button: { minHeight: 48, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...TYPOGRAPHY.button, color: COLORS.primary },
});
