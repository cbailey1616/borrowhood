import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, TRANSACTION_STATUS_LABELS } from '../utils/config';

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

  const renderItem = ({ item }) => {
    const otherPerson = item.isBorrower ? item.lender : item.borrower;
    const roleLabel = item.isBorrower ? 'Borrowing from' : 'Lending to';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}
        activeOpacity={0.7}
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
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={transactions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: COLORS.primary + '15',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImage: {
    width: 80,
    height: 100,
    backgroundColor: COLORS.gray[200],
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  personRow: {
    flexDirection: 'row',
    gap: 4,
  },
  roleLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  personName: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  amount: {
    fontSize: 14,
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
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
