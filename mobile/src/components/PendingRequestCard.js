import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import ListingOffer from './ListingOffer';
import HapticPressable from './HapticPressable';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const shortDate = value => value ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
export default function PendingRequestCard({ transaction: t, onMessage, onCancel, onViewItem, busy, error, onRetry }) {
  const ahead = t.queue?.aheadCount;
  const waiting = t.queue?.waiting;
  return <View style={styles.page}>
    <HapticPressable style={[styles.card, styles.item]} accessibilityLabel={`View ${t.listing.title}`} onPress={onViewItem}>
      {t.listing.photos?.[0] ? <Image source={{ uri: t.listing.photos[0] }} style={styles.photo} /> : <Ionicons name="basket" size={48} illustrated />}
      <View style={{ flex: 1, gap: SPACING.sm }}>
        <Text style={styles.title}>{t.listing.title}</Text>
        <ListingOffer listing={{ ...t.listing, listingType: t.listingType, directFee: t.directFee, pricePerDay: t.dailyRate, isFree: !t.dailyRate }} />
        <Text style={styles.body}>From {t.lender.firstName}</Text>
      </View>
    </HapticPressable>
    <View style={[styles.card, { backgroundColor: COLORS.primaryMuted }]} testID="Transaction.nextStep" accessibilityLiveRegion="polite">
      <Text style={styles.title}>{waiting ? 'Reserved for another neighbor' : 'Request sent'}</Text>
      {Number.isInteger(ahead) && ahead >= 0 && <Text style={styles.body}>{ahead === 0 ? 'No one ahead of you' : `${ahead} ${ahead === 1 ? 'person' : 'people'} ahead of you`}</Text>}
      <Text style={styles.body}>{waiting ? 'Your request is still waiting.' : 'The owner chooses who to approve.'}</Text>
      {!!error && <><Text style={styles.body}>Couldn’t refresh your request.</Text><HapticPressable style={styles.button} onPress={onRetry}><Text style={styles.buttonText}>Try again</Text></HapticPressable></>}
    </View>
    {((t.startDate && !['sell', 'giveaway'].includes(t.listingType)) || t.borrowerMessage) && <View style={styles.card}>
      {!['sell', 'giveaway'].includes(t.listingType) && !!t.startDate && <Text style={styles.body}>{shortDate(t.startDate)}{t.endDate ? ` – ${shortDate(t.endDate)}` : ''}</Text>}
      {!!t.borrowerMessage && <Text style={styles.body}>{t.borrowerMessage}</Text>}
    </View>}
    <HapticPressable accessibilityLabel="Message owner" testID="Transaction.button.message" style={styles.button} onPress={onMessage}><Text style={styles.buttonText}>Message owner</Text></HapticPressable>
    <HapticPressable accessibilityLabel="Cancel request" testID="Transaction.button.cancel" style={[styles.button, { borderColor: COLORS.danger }]} disabled={busy} onPress={onCancel}><Text style={[styles.buttonText, { color: COLORS.danger }]}>Cancel request</Text></HapticPressable>
  </View>;
}
const styles = StyleSheet.create({
  page: { gap: SPACING.lg },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, gap: SPACING.md },
  item: { flexDirection: 'row', alignItems: 'center' },
  photo: { width: 88, height: 100, borderRadius: RADIUS.md },
  title: { ...TYPOGRAPHY.title2, fontSize: 24, fontWeight: '700', color: COLORS.primary },
  body: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  button: { minHeight: 48, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...TYPOGRAPHY.button, color: COLORS.primary },
});
