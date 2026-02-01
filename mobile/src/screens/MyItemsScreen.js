import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
  Alert,
  Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '../components/Icon';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { COLORS, CONDITION_LABELS } from '../utils/config';

const TABS = [
  { key: 'items', label: 'My Items' },
  { key: 'requests', label: 'My Requests' },
];

export default function MyItemsScreen({ navigation }) {
  const { showError } = useError();
  const [activeTab, setActiveTab] = useState('items');
  const [listings, setListings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      if (activeTab === 'items') {
        const data = await api.getMyListings();
        setListings(data);
      } else {
        const data = await api.getMyRequests();
        setRequests(data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation, fetchData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const handleDeleteListing = (item) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteListing(item.id);
              setListings(prev => prev.filter(l => l.id !== item.id));
            } catch (error) {
              showError({
                message: error.message || 'Unable to delete this item. Please check your connection and try again.',
                type: 'network',
              });
            }
          },
        },
      ]
    );
  };

  const handleDeleteRequest = (item) => {
    Alert.alert(
      'Delete Request',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteRequest(item.id);
              setRequests(prev => prev.filter(r => r.id !== item.id));
            } catch (error) {
              showError({
                message: error.message || 'Unable to delete this request. Please check your connection and try again.',
                type: 'network',
              });
            }
          },
        },
      ]
    );
  };

  const renderRightActions = (progress, dragX, onDelete) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={onDelete}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash-outline" size={24} color="#fff" />
          <Text style={styles.deleteActionText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderListingItem = ({ item }) => (
    <Swipeable
      renderRightActions={(progress, dragX) =>
        renderRightActions(progress, dragX, () => handleDeleteListing(item))
      }
      overshootRight={false}
    >
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.photoUrl || 'https://via.placeholder.com/100' }}
        style={styles.cardImage}
      />
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardCondition}>{CONDITION_LABELS[item.condition]}</Text>

        <View style={styles.cardStats}>
          <View style={styles.stat}>
            <Ionicons name="swap-horizontal" size={14} color={COLORS.gray[400]} />
            <Text style={styles.statText}>{item.timesBorrowed} borrows</Text>
          </View>
          {item.totalEarnings > 0 && (
            <View style={styles.stat}>
              <Ionicons name="cash" size={14} color={COLORS.secondary} />
              <Text style={[styles.statText, { color: COLORS.secondary }]}>
                ${item.totalEarnings.toFixed(0)} earned
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardFooter}>
          <View style={[
            styles.statusBadge,
            { backgroundColor: item.isAvailable ? COLORS.secondary + '20' : COLORS.warning + '20' }
          ]}>
            <Text style={[
              styles.statusText,
              { color: item.isAvailable ? COLORS.secondary : COLORS.warning }
            ]}>
              {item.isAvailable ? 'Available' : 'Borrowed'}
            </Text>
          </View>
          {item.pendingRequests > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>{item.pendingRequests} pending</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
    </Swipeable>
  );

  const renderRequestItem = ({ item }) => (
    <Swipeable
      renderRightActions={(progress, dragX) =>
        renderRightActions(progress, dragX, () => handleDeleteRequest(item))
      }
      overshootRight={false}
    >
    <TouchableOpacity
      style={styles.requestCard}
      onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.requestHeader}>
        <Text style={styles.requestTitle} numberOfLines={1}>{item.title}</Text>
        <View style={[
          styles.requestStatusBadge,
          { backgroundColor: item.status === 'open' ? COLORS.secondary + '20' : COLORS.gray[800] }
        ]}>
          <Text style={[
            styles.requestStatusText,
            { color: item.status === 'open' ? COLORS.secondary : COLORS.textSecondary }
          ]}>
            {item.status === 'open' ? 'Open' : 'Closed'}
          </Text>
        </View>
      </View>

      {item.description && (
        <Text style={styles.requestDescription} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      {(item.neededFrom || item.neededUntil) && (
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.dateText}>
            {item.neededFrom && new Date(item.neededFrom).toLocaleDateString()}
            {item.neededFrom && item.neededUntil && ' - '}
            {item.neededUntil && new Date(item.neededUntil).toLocaleDateString()}
          </Text>
        </View>
      )}

      <Text style={styles.requestDate}>
        Posted {new Date(item.createdAt).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
    </Swipeable>
  );

  const data = activeTab === 'items' ? listings : requests;

  return (
    <View style={styles.container}>
      {/* Tab Switcher */}
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
        data={data}
        renderItem={activeTab === 'items' ? renderListingItem : renderRequestItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.emptyContainer}>
              <Ionicons
                name={activeTab === 'items' ? 'construct-outline' : 'search-outline'}
                size={64}
                color={COLORS.gray[700]}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'items' ? 'No items yet' : 'No requests yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'items'
                  ? 'List your first tool to start lending!'
                  : 'Post a request when you need to borrow something'}
              </Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => navigation.navigate(activeTab === 'items' ? 'CreateListing' : 'CreateRequest')}
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.addButtonText}>
                  {activeTab === 'items' ? 'List an Item' : 'Post a Request'}
                </Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListHeaderComponent={
          data.length > 0 && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate(activeTab === 'items' ? 'CreateListing' : 'CreateRequest')}
            >
              <Ionicons name="add-circle" size={24} color={COLORS.primary} />
              <Text style={styles.headerButtonText}>
                {activeTab === 'items' ? 'List a new item' : 'Post a new request'}
              </Text>
            </TouchableOpacity>
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
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
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
    width: 100,
    height: 100,
    backgroundColor: COLORS.gray[700],
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
  cardCondition: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cardStats: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  pendingBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.primary,
  },
  // Request card styles
  requestCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 12,
  },
  requestStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  requestStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  requestDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dateText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  requestDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  // Empty state
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
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAction: {
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 12,
    borderRadius: 16,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
