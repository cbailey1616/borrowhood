import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import SegmentedControl from '../components/SegmentedControl';
import { SkeletonCard } from '../components/SkeletonLoader';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const ROLE_SEGMENTS = ['All', 'Borrowing', 'Lending'];
const ROLE_VALUES = [null, 'borrower', 'lender'];

const STATUS_CONFIG = {
  requested: { label: 'Requested', color: COLORS.warning, icon: 'time-outline' },
  approved: { label: 'Approved', color: COLORS.primary, icon: 'checkmark-circle-outline' },
  active: { label: 'Active', color: COLORS.secondary, icon: 'swap-horizontal' },
  returnPending: { label: 'Return Pending', color: COLORS.primary, icon: 'arrow-undo-outline' },
  completed: { label: 'Completed', color: COLORS.textMuted, icon: 'checkmark-done-outline' },
  cancelled: { label: 'Cancelled', color: COLORS.danger, icon: 'close-circle-outline' },
  declined: { label: 'Declined', color: COLORS.danger, icon: 'close-outline' },
  expired: { label: 'Expired', color: COLORS.textMuted, icon: 'hourglass-outline' },
};

export default function TransactionHistoryScreen({ navigation }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const roleFilter = ROLE_VALUES[selectedIndex];

  const fetchTransactions = useCallback(async () => {
    try {
      const params = {};
      if (roleFilter) params.role = roleFilter;
      const data = await api.getTransactions(params);
      setTransactions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedIndex]);

  useEffect(() => {
    setIsLoading(true);
    fetchTransactions();
  }, [fetchTransactions]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchTransactions();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderTransaction = ({ item }) => {
    const config = STATUS_CONFIG[item.status] || { label: item.status, color: COLORS.textMuted, icon: 'help-outline' };
    const otherUser = item.isBorrower ? item.lender : item.borrower;
    const roleLabel = item.isBorrower ? 'Borrowed from' : 'Lent to';

    return (
      <HapticPressable
        haptic="light"
        style={styles.card}
        onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}
      >
        {item.listing?.photoUrl ? (
          <Image source={{ uri: item.listing.photoUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Ionicons name="cube-outline" size={24} color={COLORS.gray[400]} />
          </View>
        )}
        <View style={styles.cardContent}>
          <Text style={styles.listingTitle} numberOfLines={1}>
            {item.listing?.title || 'Unknown Item'}
          </Text>
          <Text style={styles.otherUser}>
            {roleLabel} {otherUser?.firstName} {otherUser?.lastName}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.statusBadge, { borderColor: config.color + '40' }]}>
              <Ionicons name={config.icon} size={12} color={config.color} />
              <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
            </View>
            {item.rentalFee > 0 && (
              <Text style={styles.amount}>${item.rentalFee.toFixed(2)}</Text>
            )}
          </View>
          <Text style={styles.date}>{formatDate(item.startDate)} - {formatDate(item.endDate)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.gray[400]} />
      </HapticPressable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="receipt-outline" size={48} color={COLORS.textMuted} />
      <Text style={styles.emptyTitle}>No transactions yet</Text>
      <Text style={styles.emptySubtitle}>
        Your borrowing and lending history will appear here
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.segmentWrap}>
          <SegmentedControl
            segments={ROLE_SEGMENTS}
            selectedIndex={selectedIndex}
            onIndexChange={setSelectedIndex}
          />
        </View>
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.segmentWrap}>
        <SegmentedControl
          segments={ROLE_SEGMENTS}
          selectedIndex={selectedIndex}
          onIndexChange={setSelectedIndex}
        />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={transactions.length === 0 ? styles.emptyList : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  segmentWrap: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  skeletonWrap: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
    padding: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  photo: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray[700],
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
  },
  listingTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginBottom: 2,
  },
  otherUser: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
  },
  amount: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.text,
  },
  date: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
