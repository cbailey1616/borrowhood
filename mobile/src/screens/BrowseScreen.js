import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Image,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, CONDITION_LABELS } from '../utils/config';

const TABS = [
  { key: 'items', label: 'Items' },
  { key: 'wanted', label: 'Wanted' },
];

const DISTANCE_FILTERS = [
  { key: 'all', label: 'All', maxDistance: null },
  { key: 'nearby', label: 'Walking', maxDistance: 1 },
  { key: 'driving', label: 'Driving', maxDistance: 10 },
];

export default function BrowseScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('items');
  const [listings, setListings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [distanceFilter, setDistanceFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;

      const selectedFilter = DISTANCE_FILTERS.find(f => f.key === distanceFilter);
      if (selectedFilter?.maxDistance) {
        params.maxDistance = selectedFilter.maxDistance;
      }

      if (activeTab === 'items') {
        const data = await api.getListings(params);
        setListings(data);
      } else {
        const data = await api.getRequests(params);
        setRequests(data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab, search, distanceFilter]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const handleSearch = () => {
    setIsLoading(true);
    fetchData();
  };

  const renderListingItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.photoUrl || 'https://via.placeholder.com/150' }}
        style={styles.cardImage}
      />
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardCondition}>{CONDITION_LABELS[item.condition]}</Text>

        <View style={styles.cardPricing}>
          {item.isFree ? (
            <Text style={styles.freeLabel}>Free to borrow</Text>
          ) : (
            <Text style={styles.priceLabel}>
              ${item.pricePerDay}/day
            </Text>
          )}
        </View>

        {item.distanceMiles && (
          <View style={styles.distanceRow}>
            <Ionicons name="location-outline" size={12} color={COLORS.textSecondary} />
            <Text style={styles.distanceText}>{item.distanceMiles} mi</Text>
          </View>
        )}

        <View style={styles.cardOwner}>
          <Image
            source={{ uri: item.owner.profilePhotoUrl || 'https://via.placeholder.com/32' }}
            style={styles.ownerAvatar}
          />
          <Text style={styles.ownerName} numberOfLines={1}>
            {item.owner.firstName} {item.owner.lastName[0]}.
          </Text>
          {item.owner.rating > 0 && (
            <View style={styles.rating}>
              <Text style={styles.star}>★</Text>
              <Text style={styles.ratingText}>{item.owner.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderRequestItem = ({ item }) => (
    <TouchableOpacity
      style={styles.requestCard}
      onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.requestHeader}>
        <Image
          source={{ uri: item.requester.profilePhotoUrl || 'https://via.placeholder.com/40' }}
          style={styles.requesterAvatar}
        />
        <View style={styles.requesterInfo}>
          <Text style={styles.requesterName}>
            {item.requester.firstName} {item.requester.lastName[0]}.
          </Text>
          <Text style={styles.requestTime}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      <Text style={styles.requestTitle}>{item.title}</Text>
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

      <TouchableOpacity
        style={styles.haveThisButton}
        onPress={() => navigation.navigate('CreateListing', { requestMatch: item })}
      >
        <Ionicons name="hand-right-outline" size={16} color={COLORS.primary} />
        <Text style={styles.haveThisText}>I Have This</Text>
      </TouchableOpacity>
    </TouchableOpacity>
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

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={activeTab === 'items' ? 'Search tools...' : 'Search wanted items...'}
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Distance Filter */}
        {activeTab === 'items' && (
          <View style={styles.filterRow}>
            {DISTANCE_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterPill,
                  distanceFilter === filter.key && styles.filterPillActive,
                ]}
                onPress={() => setDistanceFilter(filter.key)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    distanceFilter === filter.key && styles.filterPillTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {activeTab === 'items' ? (
        <FlatList
          key="items-grid"
          data={listings}
          renderItem={renderListingItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
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
                <Ionicons name="cube-outline" size={64} color={COLORS.gray[700]} />
                <Text style={styles.emptyTitle}>No items found</Text>
                <Text style={styles.emptySubtitle}>
                  {search ? 'Try a different search term' : 'Be the first to list an item!'}
                </Text>
              </View>
            )
          }
        />
      ) : (
        <FlatList
          key="requests-list"
          data={requests}
          renderItem={renderRequestItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.requestListContent}
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
                <Ionicons name="search-outline" size={64} color={COLORS.gray[700]} />
                <Text style={styles.emptyTitle}>No wanted posts</Text>
                <Text style={styles.emptySubtitle}>
                  {search ? 'Try a different search term' : 'No one is looking for anything yet'}
                </Text>
              </View>
            )
          }
        />
      )}
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
  searchContainer: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  filterRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  filterPillActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  filterPillTextActive: {
    color: COLORS.primary,
  },
  listContent: {
    padding: 8,
    flexGrow: 1,
  },
  requestListContent: {
    padding: 16,
    flexGrow: 1,
  },
  row: {
    justifyContent: 'space-between',
  },
  // Item card styles
  card: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  cardImage: {
    width: '100%',
    height: 120,
    backgroundColor: COLORS.gray[800],
  },
  cardContent: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardCondition: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  cardPricing: {
    marginBottom: 8,
  },
  freeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  priceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  distanceText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  cardOwner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.gray[700],
  },
  ownerName: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  star: {
    fontSize: 12,
    color: COLORS.warning,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
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
    alignItems: 'center',
    marginBottom: 12,
  },
  requesterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gray[700],
  },
  requesterInfo: {
    marginLeft: 12,
    flex: 1,
  },
  requesterName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  requestTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  requestDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  dateText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  haveThisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 6,
  },
  haveThisText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
