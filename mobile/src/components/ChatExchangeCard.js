import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import api from '../services/api';
import { borrowGuidance } from '../utils/borrowStatus';
import { exchangesWith, exchangeAction } from '../utils/chatExchange';
import { COLORS, RADIUS } from '../utils/config';

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
  if (!exchange) return error ? <HapticPressable accessibilityRole="button" onPress={refresh} style={styles.retry}><Text style={styles.secondary}>{error} Tap to retry.</Text></HapticPressable> : null;
  const guidance = borrowGuidance({ status: exchange.status, isBorrower: exchange.borrower?.id === userId, isGiveaway: exchange.listingType === 'giveaway' });
  const action = exchangeAction(exchange, userId);
  const details = () => navigation.navigate('TransactionDetail', { id: exchange.id });
  const perform = () => {
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
  return <View style={styles.card}>
    <HapticPressable accessibilityRole="button" accessibilityLabel={`Borrow details for ${exchange.listing?.title}`} onPress={details} style={styles.heading}>
      <Ionicons name="cube-outline" size={24} color={COLORS.primary} />
      <View style={{ flex: 1 }}><Text style={styles.title} numberOfLines={1}>{exchange.listing?.title}</Text><Text style={styles.secondary}>{date(exchange.startDate)}{exchange.endDate && exchange.listingType !== 'giveaway' ? ` – ${date(exchange.endDate)}` : ''} · {guidance.title}</Text></View>
    </HapticPressable>
    {!!error && <Text accessibilityRole="alert" style={styles.secondary}>{error}</Text>}
    <View style={styles.actions}>
      <HapticPressable accessibilityRole="button" disabled={busy || !!error} onPress={perform} style={[styles.primary, (busy || error) && { opacity: 0.5 }]}><Text style={styles.primaryText}>{busy ? 'Updating…' : action.label}</Text></HapticPressable>
      {!!error ? <HapticPressable accessibilityRole="button" onPress={refresh} style={styles.link}><Text style={styles.linkText}>Refresh</Text></HapticPressable>
        : action.method && <HapticPressable accessibilityRole="button" onPress={details} style={styles.link}><Text style={styles.linkText}>Details</Text></HapticPressable>}
      {exchanges.length > 1 && <HapticPressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.link}><Text style={styles.linkText}>{exchanges.length} exchanges {expanded ? '↑' : '↓'}</Text></HapticPressable>}
    </View>
    {expanded && exchanges.map(t => <HapticPressable accessibilityRole="button" key={t.id} style={styles.link} onPress={() => { setSelectedId(t.id); setExpanded(false); }}><Text style={styles.linkText}>{t.listing?.title}</Text></HapticPressable>)}
  </View>;
}
const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 8, marginBottom: 4, padding: 12, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.lg },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  title: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  secondary: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  primary: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  primaryText: { color: COLORS.surface, fontWeight: '600', fontSize: 13 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  retry: { padding: 12, minHeight: 44 },
});
import { ThemedAlert as Alert } from "./ThemedAlert";
