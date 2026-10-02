import { isTransferListing } from '../utils/directFee';
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import ShimmerImage from './ShimmerImage';
import ItemPhotoPlaceholder from './ItemPhotoPlaceholder';
import { Ionicons } from './Icon';
import api from '../services/api';
import { borrowGuidance } from '../utils/borrowStatus';
import { exchangesWith, exchangeAction } from '../utils/chatExchange';
import { CARD_SURFACE, COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function ChatExchangeCard({ userId, otherId, listingId, navigation, focused, onActiveChange }) {
  const [exchanges, setExchanges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onActiveChange?.(exchanges.length > 0); }, [exchanges.length, onActiveChange]);
  const refresh = useCallback(async () => {
    try {
      const data = await api.getTransactions();
      setExchanges(exchangesWith(data, userId, otherId, listingId));
      setError('');
    } catch { setError('Borrow details could not refresh.'); }
  }, [userId, otherId, listingId]);
  useEffect(() => {
    if (!focused || !otherId) return;
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh, focused, otherId]);
  const exchange = exchanges.find(t => t.id === selectedId) || exchanges[0];
  if (!exchange) return error ? <HapticPressable haptic={null} scaleDown={1} accessibilityRole="button" onPress={refresh} style={styles.retry}><Text style={styles.secondary}>{error} Tap to retry.</Text></HapticPressable> : null;
  const guidance = borrowGuidance({ ...exchange, isBorrower: exchange.borrower?.id === userId, isGiveaway: isTransferListing(exchange) });
  const action = exchangeAction(exchange, userId);
  const details = () => navigation.navigate('TransactionDetail', { id: exchange.id });
  const perform = () => {
    if (action.screen) return navigation.navigate(action.screen, action.params);
    if (!action.method) return details();
    Alert.alert(action.label, action.confirmation, [
      { text: 'Not yet', style: 'cancel' },
      { text: action.label, onPress: async () => {
        setBusy(true);
        try { await api[action.method](exchange.id); await refresh(); }
        catch { setError('Could not confirm the update. Refresh the details before trying again.'); }
        finally { setBusy(false); }
      } },
    ]);
  };
  const date = value => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const photoUrl = exchange.listing?.photoUrl || exchange.listing?.photos?.[0];
  return <View style={styles.card}>
    <HapticPressable haptic={null} scaleDown={1} accessibilityRole="button" accessibilityLabel={`Borrow details for ${exchange.listing?.title}`} onPress={details} style={styles.heading}>
      {photoUrl ? <ShimmerImage source={{ uri: photoUrl }} category={exchange.listing?.category} title={exchange.listing?.title} style={styles.thumbnail} />
        : <ItemPhotoPlaceholder category={exchange.listing?.category} title={exchange.listing?.title} style={styles.thumbnail} />}
      <View style={{ flex: 1, minWidth: 0 }}><Text maxFontSizeMultiplier={1.4} style={styles.title} numberOfLines={1}>{exchange.listing?.title}</Text><Text style={styles.secondary}>{date(exchange.startDate)}{exchange.endDate && !isTransferListing(exchange) ? ` – ${date(exchange.endDate)}` : ''} · {guidance.title}</Text></View>
      <Ionicons name="chevron-forward" size={22} color={COLORS.primary} illustrated={false} selected={false} />
    </HapticPressable>
    {!!error && <Text style={styles.secondary}>{error}</Text>}
    <View style={styles.actions}>
      <HapticPressable haptic={null} scaleDown={1} accessibilityRole="button" disabled={busy || !!error} onPress={perform} style={[styles.primary, (busy || error) && styles.primaryUnavailable]}><Text maxFontSizeMultiplier={1.4} style={[styles.primaryText, (busy || error) && styles.primaryTextUnavailable]}>{busy ? 'Updating…' : action.label}</Text></HapticPressable>
      {!!error ? <HapticPressable haptic={null} scaleDown={1} accessibilityRole="button" onPress={refresh} style={styles.link}><Text maxFontSizeMultiplier={1.4} style={styles.linkText}>Refresh</Text></HapticPressable>
        : action.method && <HapticPressable haptic={null} scaleDown={1} accessibilityRole="button" onPress={details} style={styles.link}><Text maxFontSizeMultiplier={1.4} style={styles.linkText}>Details</Text></HapticPressable>}
      {exchanges.length > 1 && <HapticPressable haptic="selection" scaleDown={1} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.link}><Text maxFontSizeMultiplier={1.4} style={styles.linkText}>{exchanges.length} exchanges {expanded ? '↑' : '↓'}</Text></HapticPressable>}
    </View>
    {expanded && exchanges.map(t => <HapticPressable haptic="selection" scaleDown={1} accessibilityRole="button" key={t.id} style={styles.link} onPress={() => { setSelectedId(t.id); setExpanded(false); }}><Text maxFontSizeMultiplier={1.4} style={styles.linkText}>{t.listing?.title}</Text></HapticPressable>)}
  </View>;
}
const styles = StyleSheet.create({
  card: { ...CARD_SURFACE, marginHorizontal: 16, marginTop: 8, marginBottom: 4, padding: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  thumbnail: { width: 44, height: 44, borderRadius: RADIUS.md, flexShrink: 0 },
  title: { color: COLORS.text, ...TYPOGRAPHY.buttonSmall },
  secondary: { color: COLORS.textSecondary, ...TYPOGRAPHY.caption1, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  primary: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  primaryText: { ...TYPOGRAPHY.buttonCaption, color: COLORS.surface },
  primaryUnavailable: { backgroundColor: COLORS.surfaceElevated, opacity: 1 },
  primaryTextUnavailable: { color: COLORS.textSecondary },
  link: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, flexShrink: 1, marginVertical: 2 },
  linkText: { color: COLORS.primary, ...TYPOGRAPHY.buttonCaption },
  retry: { padding: 12, minHeight: 48, margin: 16, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
});
import { ThemedAlert as Alert } from "./ThemedAlert";
