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
import api from '../services/api';
import { COLORS, TRANSACTION_STATUS_LABELS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import AnimatedCard from '../components/AnimatedCard';
import { haptics } from '../utils/haptics';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'borrower', label: 'Borrowing' },
  { key: 'lender', label: 'Lending' },
];

export default function ActivityScreen({ navigation }) {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  const fetchTransactions = useCallback(async () => {
    try {
      const params = activeTab !== 'all' ? { role: activeTab } : {};
      const data = await api.getTransactions(params);
      setTransactions(data);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchTransactions();
    });
    return unsubscribe;
  }, [navigation, fetchTransactions]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchTransactions();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return COLORS.warning;
      case 'approved':
      case 'paid':
        return COLORS.primary;
      case 'picked_up':
        return COLORS.secondary;
      case 'completed':
      case 'returned':
        return COLORS.secondary;
      case 'cancelled':
      case 'disputed':
        return COLORS.danger;
      default:
        return COLORS.gray[500];
    }
  };

  const renderItem = ({ item, index }) => {
    const otherPerson = item.isBorrower ? item.lender : item.borrower;
    const roleLabel = item.isBorrower ? 'Borrowing from' : 'Lending to';

    return (
      <AnimatedCard index={index}>
        <HapticPressable
          style={styles.card}
          onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}
          haptic="light"
        >
          <Image
            source={{ uri: item.listing.photoUrl || 'https://via.placeholder.com/80' }}
            style={styles.cardImage}
          />
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.title}</Text>

            <View style={styles.personRow}>
              <Text style={styles.roleLabel}>{roleLabel}</Text>
              <Text style={styles.personName}>
                {otherPerson.firstName} {otherPerson.lastName[0]}.
              </Text>
            </View>

            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.gray[400]} />
              <Text style={styles.dateText}>
                {new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.cardFooter}>
              <View style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(item.status) + '20' }
              ]}>
                <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                  {TRANSACTION_STATUS_LABELS[item.status]}
                </Text>
              </View>
              <Text style={styles.amount}>
                ${(item.rentalFee + item.depositAmount).toFixed(2)}
              </Text>
            </View>
          </View>
        </HapticPressable>
      </AnimatedCard>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <HapticPressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => {
              setActiveTab(tab.key);
              haptics.selection();
            }}
            haptic={null}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </HapticPressable>
        ))}
      </View>

      <FlatList
        data={transactions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="swap-horizontal-outline" size={64} color={COLORS.gray[300]} />
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'borrower'
                  ? 'Browse items to start borrowing!'
                  : activeTab === 'lender'
                  ? 'List items to start lending!'
                  : 'Your borrowing and lending activity will appear here'}
              </Text>
            </View>
          )
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  tabActive: {
    backgroundColor: COLORS.primary + '15',
  },
  tabText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  listContent: {
    padding: SPACING.lg,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.separator,
  },
  cardImage: {
    width: 80,
    height: 100,
    backgroundColor: COLORS.gray[200],
  },
  cardContent: {
    flex: 1,
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  personRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  roleLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  personName: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.text,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  dateText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  statusText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  amount: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
  },
});
