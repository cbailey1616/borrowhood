import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TextInput,
  Image,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import AnimatedCard from '../components/AnimatedCard';
import { haptics } from '../utils/haptics';

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

  const renderListingItem = ({ item, index }) => (
    <AnimatedCard index={index} style={styles.cardAnimated}>
      <HapticPressable
        style={styles.card}
        onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
        haptic="light"
      >
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={32} color={COLORS.gray[500]} />
          </View>
        )}
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
            {item.owner.profilePhotoUrl ? (
              <Image source={{ uri: item.owner.profilePhotoUrl }} style={styles.ownerAvatar} />
            ) : (
              <View style={[styles.ownerAvatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={12} color={COLORS.gray[400]} />
              </View>
            )}
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
      </HapticPressable>
    </AnimatedCard>
  );

  const renderRequestItem = ({ item, index }) => (
    <AnimatedCard index={index}>
      <BlurCard style={styles.requestCardOuter}>
        <HapticPressable
          style={styles.requestCard}
          onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
          haptic="light"
        >
          <View style={styles.requestHeader}>
            {item.requester.profilePhotoUrl ? (
              <Image source={{ uri: item.requester.profilePhotoUrl }} style={styles.requesterAvatar} />
            ) : (
              <View style={[styles.requesterAvatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={20} color={COLORS.gray[400]} />
              </View>
            )}
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

          <HapticPressable
            style={styles.haveThisButton}
            onPress={() => {
              haptics.medium();
              navigation.navigate('CreateListing', { requestMatch: item });
            }}
            haptic={null}
          >
            <Ionicons name="hand-right-outline" size={16} color={COLORS.primary} />
            <Text style={styles.haveThisText}>I Have This</Text>
          </HapticPressable>
        </HapticPressable>
      </BlurCard>
    </AnimatedCard>
  );

  const data = activeTab === 'items' ? listings : requests;

  return (
    <View style={styles.container}>
      {/* Tab Switcher */}
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

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={activeTab === 'items' ? 'Search items...' : 'Search wanted items...'}
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <HapticPressable onPress={() => { setSearch(''); }} haptic="light">
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </HapticPressable>
          )}
        </View>

        {/* Distance Filter */}
        {activeTab === 'items' && (
          <View style={styles.filterRow}>
            {DISTANCE_FILTERS.map((filter) => (
              <HapticPressable
                key={filter.key}
                style={[
                  styles.filterPill,
                  distanceFilter === filter.key && styles.filterPillActive,
                ]}
                onPress={() => {
                  setDistanceFilter(filter.key);
                  haptics.selection();
                }}
                haptic={null}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    distanceFilter === filter.key && styles.filterPillTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </HapticPressable>
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
  searchContainer: {
    padding: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  filterRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: SPACING.sm,
  },
  filterPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  filterPillText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  filterPillTextActive: {
    color: COLORS.primary,
  },
  listContent: {
    padding: SPACING.sm,
    flexGrow: 1,
  },
  requestListContent: {
    padding: SPACING.lg,
    flexGrow: 1,
  },
  row: {
    justifyContent: 'space-between',
  },
  // Item card styles
  cardAnimated: {
    width: '48%',
    marginBottom: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.separator,
  },
  cardImage: {
    width: '100%',
    height: 120,
    backgroundColor: COLORS.separator,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    padding: SPACING.md,
  },
  cardTitle: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  cardCondition: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  cardPricing: {
    marginBottom: SPACING.sm,
  },
  freeLabel: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.primary,
  },
  priceLabel: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.primary,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  distanceText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  cardOwner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  ownerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.gray[700],
  },
  ownerName: {
    flex: 1,
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  star: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.warning,
  },
  ratingText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  // Request card styles
  requestCardOuter: {
    marginBottom: SPACING.md,
  },
  requestCard: {
    padding: SPACING.lg,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  requesterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gray[700],
  },
  requesterInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  requesterName: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.text,
  },
  requestTime: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  requestTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  requestDescription: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.md,
  },
  dateText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  haveThisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: SPACING.xs + 2,
  },
  haveThisText: {
    ...TYPOGRAPHY.bodySmall,
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
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
});
