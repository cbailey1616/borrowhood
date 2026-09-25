import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import ActionButton from '../components/ActionButton';
import SegmentedControl from '../components/SegmentedControl';
import ActionSheet from '../components/ActionSheet';
import LayeredCard from '../components/LayeredCard';
import ShimmerImage from '../components/ShimmerImage';
import HeroIcon from '../components/HeroIcon';
import { SkeletonCard } from '../components/SkeletonLoader';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { exchangeIsActive, isBorrower } from '../utils/homeAction';
import { isSaleListing, isTransferListing } from '../utils/directFee';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const ROLE_SEGMENTS = ['All', 'From others', 'From you'];
const OUTCOMES = [
  { key: 'all', label: 'All outcomes' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'declined', label: 'Declined' },
  { key: 'expired', label: 'Expired' },
];
const STATUS_CONFIG = {
  returned: { label: 'Returned', icon: 'checkmark-done-outline', complete: true },
  completed: { label: 'Completed', icon: 'checkmark-done-outline', complete: true },
  cancelled: { label: 'Cancelled', icon: 'close-circle-outline' },
  declined: { label: 'Declined', icon: 'close-outline' },
  expired: { label: 'Expired', icon: 'time-outline' },
};

function historyOutcome(item) {
  // A loan awaiting return confirmation is still active. Sales and giveaways
  // are finished at pickup and never need a return step.
  if (exchangeIsActive(item)) return null;
  if (['returned', 'completed'].includes(item.status)
    || (item.status === 'picked_up' && isTransferListing(item))) return 'completed';
  return ['cancelled', 'declined', 'expired'].includes(item.status) ? item.status : null;
}

function formatDate(value, calendarDate = false) {
  if (!value) return '';
  const input = calendarDate && typeof value === 'string' ? value.slice(0, 10) : value;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T12:00:00` : input);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function historyDate(item) {
  if (isTransferListing(item)) {
    const pickedUp = historyOutcome(item) === 'completed' && formatDate(item.actualPickupAt);
    if (pickedUp) return `Picked up ${pickedUp}`;
    const requested = formatDate(item.createdAt);
    return requested ? `Requested ${requested}` : '';
  }
  const start = formatDate(item.startDate, true);
  const end = formatDate(item.endDate, true);
  return start && end && start !== end ? `${start} – ${end}` : start || end;
}

function roleLabel(item, borrower) {
  if (historyOutcome(item) !== 'completed') return borrower ? 'From' : 'To';
  if (isSaleListing(item)) return borrower ? 'Bought from' : 'Sold to';
  if (isTransferListing(item)) return borrower ? 'Received from' : 'Given to';
  return borrower ? 'Borrowed from' : 'Lent to';
}

export default function TransactionHistoryScreen({ navigation }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [outcome, setOutcome] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestId = useRef(0);

  const fetchTransactions = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const data = await api.getTransactions({});
      if (currentRequest !== requestId.current) return;
      setTransactions(Array.isArray(data) ? data.filter(item => historyOutcome(item)) : []);
      setLoadError(false);
    } catch {
      if (currentRequest === requestId.current) setLoadError(true);
    } finally {
      if (currentRequest === requestId.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
    const unsubscribe = navigation.addListener('focus', fetchTransactions);
    return () => { unsubscribe?.(); requestId.current += 1; };
  }, [fetchTransactions, navigation]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchTransactions();
  };

  const filteredTransactions = useMemo(() => transactions.filter(item => {
    const borrower = isBorrower(item, user?.id);
    return (selectedIndex === 0 || (selectedIndex === 1 ? borrower : !borrower))
      && (outcome === 'all' || historyOutcome(item) === outcome);
  }), [transactions, selectedIndex, outcome, user?.id]);
  const selectedOutcome = OUTCOMES.find(option => option.key === outcome);
  const hasFilter = selectedIndex !== 0 || outcome !== 'all';

  const renderTransaction = ({ item }) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.completed;
    const borrower = isBorrower(item, user?.id);
    const otherUser = borrower ? item.lender : item.borrower;
    const name = [otherUser?.firstName, otherUser?.lastName].filter(Boolean).join(' ') || 'a neighbor';
    const date = historyDate(item);

    return (
      <LayeredCard style={styles.card}>
        <HapticPressable style={styles.cardBody}
          onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}>
          <ShimmerImage source={{ uri: item.listing?.photoUrl }} style={styles.photo}
            contentPosition="center" placeholderIcon={isSaleListing(item) ? 'pricetag' : isTransferListing(item) ? 'gift' : 'basket'} />
          <View style={styles.cardContent}>
            <Text style={styles.listingTitle} numberOfLines={2}>{item.listing?.title || 'Item unavailable'}</Text>
            <View style={[styles.statusBadge, config.complete && styles.completeBadge]}>
              <Ionicons name={config.icon} size={14} color={config.complete ? COLORS.primary : COLORS.textSecondary} />
              <Text style={[styles.statusText, config.complete && styles.completeText]}>{config.label}</Text>
            </View>
            <Text style={styles.otherUser} numberOfLines={2}>{roleLabel(item, borrower)} {name}</Text>
            {!!date && <Text style={styles.date}>{date}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </HapticPressable>
      </LayeredCard>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <SegmentedControl variant="underline" segments={ROLE_SEGMENTS}
          selectedIndex={selectedIndex} onIndexChange={setSelectedIndex} testID="History.tabs" />
        <View style={styles.filterRow}>
          <HapticPressable style={styles.filterButton} onPress={() => setShowFilter(true)}
            accessibilityLabel={`Filter history: ${selectedOutcome.label}`} accessibilityState={{ expanded: showFilter }}>
            <Ionicons name="options-outline" size={18} color={COLORS.primary} />
            <Text style={styles.filterText}>{selectedOutcome.label}</Text>
            <Ionicons name="chevron-down" size={16} color={COLORS.primary} />
          </HapticPressable>
        </View>
      </View>

      {loadError && <View style={styles.errorRow}>
        <Text style={styles.errorText} accessibilityRole="alert">Couldn't load history. Please try again.</Text>
        <ActionButton label="Retry" onPress={onRefresh} loading={isRefreshing} accessibilityLabel="Retry history" />
      </View>}

      {isLoading ? <View style={styles.skeletonWrap}><SkeletonCard /><SkeletonCard /></View> : (
        <FlatList data={filteredTransactions} keyExtractor={item => item.id} renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLORS.spinner} colors={[COLORS.spinner]} />}
          ListEmptyComponent={!loadError ? <View style={styles.emptyContainer}>
            <HeroIcon icon="receipt-outline" size={72} />
            <Text style={styles.emptyTitle}>{hasFilter ? 'No matching history' : 'No history yet'}</Text>
            <Text style={styles.emptySubtitle}>{hasFilter
              ? 'Try a different filter to see more.'
              : 'Finished exchanges and closed item requests will appear here.'}</Text>
            {hasFilter && <HapticPressable style={styles.resetButton} onPress={() => { setSelectedIndex(0); setOutcome('all'); }}>
              <Text style={styles.filterText}>Clear filters</Text>
            </HapticPressable>}
          </View> : null}
        />
      )}
      <ActionSheet isVisible={showFilter} onClose={() => setShowFilter(false)} variant="options" title="Show history"
        actions={OUTCOMES.map(option => ({ label: option.label, selected: outcome === option.key, onPress: () => setOutcome(option.key) }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  controls: { paddingHorizontal: SPACING.lg, width: '100%', maxWidth: 760, alignSelf: 'center' },
  filterRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: SPACING.md },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 44, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: COLORS.surface },
  filterText: { ...TYPOGRAPHY.subheadline, color: COLORS.primary },
  listContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl, width: '100%', maxWidth: 760, alignSelf: 'center' },
  skeletonWrap: { padding: SPACING.lg, gap: SPACING.md, width: '100%', maxWidth: 760, alignSelf: 'center' },
  card: { marginBottom: SPACING.md },
  cardBody: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, gap: SPACING.md, borderRadius: RADIUS.lg },
  photo: { width: 72, height: 80, borderRadius: RADIUS.md },
  cardContent: { flex: 1, minWidth: 0, gap: SPACING.xs },
  listingTitle: { ...TYPOGRAPHY.headline, color: COLORS.text },
  statusBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: SPACING.xs, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceElevated },
  completeBadge: { backgroundColor: COLORS.primaryMuted },
  statusText: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, flexShrink: 1 },
  completeText: { color: COLORS.primary },
  otherUser: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  date: { ...TYPOGRAPHY.caption1, color: COLORS.textMuted },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, padding: SPACING.xl },
  emptyTitle: { ...TYPOGRAPHY.h3, color: COLORS.text, textAlign: 'center' },
  emptySubtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, textAlign: 'center' },
  resetButton: { minHeight: 44, padding: SPACING.md, marginTop: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: COLORS.surface },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, maxWidth: 760, width: '100%', alignSelf: 'center' },
  errorText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flex: 1 },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.md },
});
