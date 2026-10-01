import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Text, View, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import BorrowhoodRefreshList from '../components/BorrowhoodRefreshList';
import HapticPressable from '../components/HapticPressable';
import ActionButton from '../components/ActionButton';
import LayeredCard from '../components/LayeredCard';
import ShimmerImage from '../components/ShimmerImage';
import HeroIcon from '../components/HeroIcon';
import { Ionicons } from '../components/Icon';
import { SkeletonCard } from '../components/SkeletonLoader';
import { trackedExchanges, exchangeRows } from '../utils/exchangeTracking';
import { listingIcon } from '../utils/listingPresentation';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function ExchangesScreen({ navigation }) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState({ userId: null, transactions: [], disputes: [], hasTransactions: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const fetchExchanges = useCallback(async () => {
    const request = ++requestId.current;
    if (!user?.id) { setLoading(false); setRefreshing(false); return; }
    try {
      const results = await Promise.allSettled([api.getTransactions(), api.getDisputes()]);
      if (request !== requestId.current) return;
      const transactions = results[0].status === 'fulfilled' ? results[0].value?.transactions || results[0].value : null;
      const disputes = results[1].status === 'fulfilled' ? results[1].value?.disputes || results[1].value : null;
      setSnapshot(previous => ({ userId: user.id,
        hasTransactions: Array.isArray(transactions) || previous.userId === user.id && previous.hasTransactions,
        transactions: Array.isArray(transactions) ? transactions : previous.userId === user.id ? previous.transactions : [],
        disputes: Array.isArray(disputes) ? disputes : previous.userId === user.id ? previous.disputes : [],
      }));
      setError(!Array.isArray(transactions) || !Array.isArray(disputes));
    } catch {
      if (request === requestId.current) setError(true);
    } finally {
      if (request === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [user?.id]);

  useEffect(() => {
    setSnapshot({ userId: user?.id, transactions: [], disputes: [], hasTransactions: false });
    setLoading(true);
    setRefreshing(false);
    setError(false);
    fetchExchanges();
    const unsubscribe = navigation.addListener('focus', fetchExchanges);
    const refreshVisible = () => { if (navigation.isFocused?.()) fetchExchanges(); };
    const notification = Notifications.addNotificationReceivedListener(refreshVisible);
    let previousState = AppState.currentState;
    const resume = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && previousState !== 'active') refreshVisible();
      previousState = nextState;
    });
    return () => { requestId.current += 1; unsubscribe?.(); notification.remove(); resume.remove(); };
  }, [fetchExchanges, navigation, user?.id]);

  const exchanges = useMemo(() => trackedExchanges(snapshot.userId === user?.id ? snapshot.transactions : [], user?.id,
    new Date(), snapshot.userId === user?.id ? snapshot.disputes : []), [snapshot, user?.id]);
  const rows = exchangeRows(exchanges);
  const onRefresh = () => { setRefreshing(true); fetchExchanges(); };
  const renderItem = ({ item }) => {
    if (item.type === 'section') return <View style={styles.section}>
      <Ionicons name={item.icon} size={22} illustrated color={COLORS.primary} />
      <Text accessibilityRole="header" style={styles.sectionTitle}>{item.title}</Text>
      <Text maxFontSizeMultiplier={1.4} style={styles.sectionCount}>{item.count}</Text>
    </View>;
    return <LayeredCard style={styles.card}>
      <HapticPressable testID={`Exchanges.${item.id}`} accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.status}. ${item.label}`}
        onPress={() => navigation.navigate(item.destination.name, item.destination.params)} style={styles.cardBody}>
        <View style={styles.itemRow}>
          <ShimmerImage source={{ uri: item.transaction.listing?.photoUrl }} style={styles.photo}
            placeholderIcon={listingIcon(item.transaction)} contentPosition="center" />
          <View style={styles.itemText}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.person}>{item.person}</Text>
            <Text maxFontSizeMultiplier={1.4} style={[styles.status, item.section === 'needs-you' && styles.needsYou]}>{item.status}</Text>
          </View>
        </View>
        {!!item.due && <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={18} illustrated color={COLORS.primary} />
          <Text maxFontSizeMultiplier={1.4} style={[styles.date, item.due.overdue && styles.overdue]}>{item.due.label}</Text>
        </View>}
        {!!item.nextStep && <Text style={styles.nextStep}>{item.nextStep}</Text>}
        <View style={styles.actionRow}>
          <Text maxFontSizeMultiplier={1.4} style={styles.action}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
        </View>
      </HapticPressable>
    </LayeredCard>;
  };

  return <View style={styles.container}>
    <View style={styles.topRow}>
      <Text style={styles.summary}>{loading || !snapshot.hasTransactions || snapshot.userId !== user?.id ? ' ' : `${exchanges.length} active`}</Text>
      <HapticPressable onPress={() => navigation.navigate('TransactionHistory')} style={styles.history} accessibilityRole="button" accessibilityLabel="Exchange history">
        <Ionicons name="history-ledger-outline" illustrated size={20} color={COLORS.primary} />
        <Text maxFontSizeMultiplier={1.4} style={styles.action}>History</Text>
      </HapticPressable>
    </View>
    {error && <View style={styles.errorRow}>
      <Text accessibilityRole="alert" style={styles.errorText}>Couldn't update your exchanges.</Text>
      <ActionButton label="Retry" onPress={onRefresh} loading={refreshing} accessibilityLabel="Retry exchanges" />
    </View>}
    {loading ? <View style={styles.skeleton}><SkeletonCard /><SkeletonCard /></View>
      : <BorrowhoodRefreshList testID="Exchanges.list" data={rows} keyExtractor={item => String(item.id)} renderItem={renderItem}
        refreshing={refreshing} onRefresh={onRefresh} contentContainerStyle={styles.list}
        ListEmptyComponent={!error && <View style={styles.empty}>
          <HeroIcon icon="handshake-outline" size={72} />
          <Text style={styles.emptyTitle}>No active exchanges</Text>
          <ActionButton label="Browse items" onPress={() => navigation.navigate('Main', { screen: 'Feed' })} />
        </View>} />}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topRow: { paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 760, alignSelf: 'center' },
  summary: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  history: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  list: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl, width: '100%', maxWidth: 760, alignSelf: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.md, paddingBottom: SPACING.md },
  sectionTitle: { ...TYPOGRAPHY.headline, color: COLORS.primary, flex: 1 },
  sectionCount: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
  card: { marginBottom: SPACING.md },
  cardBody: { padding: SPACING.md, gap: SPACING.sm, borderRadius: RADIUS.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  photo: { width: 64, height: 72, borderRadius: RADIUS.sm },
  itemText: { flex: 1, minWidth: 0, gap: SPACING.xs },
  title: { ...TYPOGRAPHY.headline, color: COLORS.text },
  person: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  status: { ...TYPOGRAPHY.subheadline, color: COLORS.primary },
  needsYou: { fontFamily: 'DMSans_700Bold', fontWeight: '700', },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  date: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flexShrink: 1 },
  overdue: { color: COLORS.danger },
  nextStep: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  actionRow: { minHeight: 36, borderTopWidth: 1, borderTopColor: COLORS.separator, paddingTop: SPACING.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { ...TYPOGRAPHY.subheadline, color: COLORS.primary, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.md },
  emptyTitle: { ...TYPOGRAPHY.h3, color: COLORS.text, textAlign: 'center' },
  skeleton: { padding: SPACING.lg, gap: SPACING.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg },
  errorText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flex: 1 },
});
