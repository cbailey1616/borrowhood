import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import UserBadges from '../components/UserBadges';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, SHADOWS } from '../utils/config';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'listings', label: 'Items' },
  { key: 'requests', label: 'Wanted' },
];

const VISIBILITY_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'close_friends', label: 'My Friends' },
  { key: 'neighborhood', label: 'My Neighborhood' },
  { key: 'town', label: 'My Town' },
];

export default function FeedScreen({ navigation }) {
  const [feed, setFeed] = useState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);

  const fetchFeed = useCallback(async (pageNum = 1, append = false) => {
    try {
      const params = { page: pageNum, limit: 20 };
      if (search) params.search = search;
      if (activeFilter !== 'all') params.type = activeFilter;
      if (visibilityFilter !== 'all') params.visibility = visibilityFilter;

      const data = await api.getFeed(params);

      if (append) {
        setFeed(prev => [...prev, ...data.items]);
      } else {
        setFeed(data.items || []);
      }
      setHasMore(data.hasMore);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch feed:', error);
    } finally {
      setIsInitialLoad(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [search, activeFilter, visibilityFilter]);

  // Initial load only
  useEffect(() => {
    fetchFeed();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when filters change
  useEffect(() => {
    if (!isInitialLoad) {
      fetchFeed(1, false);
    }
  }, [activeFilter, visibilityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh on screen focus (but not on initial mount)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!isInitialLoad) {
        setIsRefreshing(true);
        fetchFeed(1, false);
      }
    });
    return unsubscribe;
  }, [navigation, isInitialLoad]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchFeed(1, false);
  };

  const onEndReached = () => {
    if (!isLoadingMore && hasMore) {
      setIsLoadingMore(true);
      fetchFeed(page + 1, true);
    }
  };

  const handleSearch = () => {
    fetchFeed(1, false);
  };

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
  };

  const handleVisibilityChange = (visibility) => {
    setVisibilityFilter(visibility);
    setIsLoading(true);
  };

  useEffect(() => {
    fetchFeed(1, false);
  }, [activeFilter, visibilityFilter]);

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderListingItem = (item) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => navigation.navigate('UserProfile', { id: item.user.id })}
        >
          <Image
            source={{ uri: item.user.profilePhotoUrl || 'https://via.placeholder.com/40' }}
            style={styles.avatar}
          />
          <View style={styles.userMeta}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>
                {item.user.firstName} {item.user.lastName}
              </Text>
              <UserBadges
                isVerified={item.user.isVerified}
                totalTransactions={item.user.totalTransactions || 0}
                size="small"
                compact
              />
            </View>
            <Text style={styles.timeAgo}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.typeBadge}>
          <Ionicons name="cube-outline" size={12} color={COLORS.primary} />
          <Text style={styles.typeBadgeText}>New Item</Text>
        </View>
      </View>

      {item.photoUrl && (
        <Image
          source={{ uri: item.photoUrl }}
          style={styles.listingImage}
        />
      )}

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.title}</Text>

        <View style={styles.listingMeta}>
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>{CONDITION_LABELS[item.condition]}</Text>
          </View>
          {item.isFree ? (
            <Text style={styles.freeLabel}>Free to borrow</Text>
          ) : (
            <Text style={styles.priceLabel}>${item.pricePerDay}/day</Text>
          )}
        </View>

        {item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('ListingDiscussion', {
            listingId: item.id,
            listing: item,
          })}
        >
          <Ionicons name="chatbubbles-outline" size={18} color={COLORS.textSecondary} />
          <Text style={[styles.actionText, { color: COLORS.textSecondary }]}>Discuss</Text>
        </TouchableOpacity>
        <View style={styles.actionDivider} />
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Chat', {
            recipientId: item.user.id,
            listingId: item.id,
            listing: item,
          })}
        >
          <Ionicons name="mail-outline" size={18} color={COLORS.primary} />
          <Text style={styles.actionText}>Message</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderRequestItem = (item) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => navigation.navigate('UserProfile', { id: item.user.id })}
        >
          <Image
            source={{ uri: item.user.profilePhotoUrl || 'https://via.placeholder.com/40' }}
            style={styles.avatar}
          />
          <View style={styles.userMeta}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>
                {item.user.firstName} {item.user.lastName}
              </Text>
              <UserBadges
                isVerified={item.user.isVerified}
                totalTransactions={item.user.totalTransactions || 0}
                size="small"
                compact
              />
            </View>
            <Text style={styles.timeAgo}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
        </TouchableOpacity>
        <View style={[styles.typeBadge, styles.requestBadge]}>
          <Ionicons name="search-outline" size={12} color={COLORS.secondary} />
          <Text style={[styles.typeBadgeText, { color: COLORS.secondary }]}>Looking For</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.title}</Text>

        {item.description && (
          <Text style={styles.description} numberOfLines={3}>
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
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('CreateListing', { requestMatch: item })}
        >
          <Ionicons name="hand-right-outline" size={18} color={COLORS.secondary} />
          <Text style={[styles.actionText, { color: COLORS.secondary }]}>I Have This</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Chat', { recipientId: item.user.id })}
        >
          <Ionicons name="chatbubble-outline" size={18} color={COLORS.textSecondary} />
          <Text style={[styles.actionText, { color: COLORS.textSecondary }]}>Message</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => {
    if (item.type === 'listing') {
      return renderListingItem(item);
    }
    return renderRequestItem(item);
  };

  if (isInitialLoad) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Action Buttons Row */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.dropdownBtn, (activeFilter !== 'all' || visibilityFilter !== 'all') && styles.dropdownBtnActive]}
          onPress={() => setShowTypeMenu(true)}
        >
          <Ionicons name="funnel-outline" size={16} color={(activeFilter !== 'all' || visibilityFilter !== 'all') ? COLORS.primary : COLORS.textSecondary} />
          <Text style={[styles.dropdownBtnText, (activeFilter !== 'all' || visibilityFilter !== 'all') && styles.dropdownBtnTextActive]}>
            Filter
          </Text>
          <Ionicons name="chevron-down" size={16} color={(activeFilter !== 'all' || visibilityFilter !== 'all') ? COLORS.primary : COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowActionMenu(true)}
        >
          <Text style={styles.actionBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setIsLoading(true); fetchFeed(1, false); }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={feed}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isLoadingMore && (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="construct-outline" size={64} color={COLORS.gray[700]} />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySubtitle}>
              Be the first to list an item or post a request!
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('CreateListing')}
            >
              <Text style={styles.emptyButtonText}>List an Item</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Filter Menu Overlay */}
      {showTypeMenu && (
        <TouchableOpacity
          style={styles.filterOverlay}
          activeOpacity={1}
          onPress={() => setShowTypeMenu(false)}
        >
          <View style={styles.filterMenu}>
            <Text style={styles.filterMenuTitle}>Type</Text>
            {FILTER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.filterMenuItem,
                  activeFilter === option.key && styles.filterMenuItemActive,
                ]}
                onPress={() => {
                  handleFilterChange(option.key);
                }}
              >
                <View style={styles.menuItemRowSpaced}>
                  <Text style={[
                    styles.filterMenuItemText,
                    activeFilter === option.key && styles.filterMenuItemTextActive,
                  ]}>
                    {option.label}
                  </Text>
                  {activeFilter === option.key && (
                    <Ionicons name="checkmark" size={20} color={COLORS.primary} />
                  )}
                </View>
              </TouchableOpacity>
            ))}

            <Text style={[styles.filterMenuTitle, { marginTop: 8 }]}>Visibility</Text>
            {VISIBILITY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.filterMenuItem,
                  visibilityFilter === option.key && styles.filterMenuItemActive,
                ]}
                onPress={() => {
                  handleVisibilityChange(option.key);
                }}
              >
                <View style={styles.menuItemRowSpaced}>
                  <Text style={[
                    styles.filterMenuItemText,
                    visibilityFilter === option.key && styles.filterMenuItemTextActive,
                  ]}>
                    {option.label}
                  </Text>
                  {visibilityFilter === option.key && (
                    <Ionicons name="checkmark" size={20} color={COLORS.primary} />
                  )}
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.filterDoneButton}
              onPress={() => setShowTypeMenu(false)}
            >
              <Text style={styles.filterDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Action Menu Overlay */}
      {showActionMenu && (
        <TouchableOpacity
          style={styles.filterOverlay}
          activeOpacity={1}
          onPress={() => setShowActionMenu(false)}
        >
          <View style={styles.filterMenu}>
            <Text style={styles.filterMenuTitle}>Create</Text>
            <TouchableOpacity
              style={styles.filterMenuItem}
              onPress={() => {
                setShowActionMenu(false);
                navigation.navigate('CreateListing');
              }}
            >
              <View style={styles.menuItemRow}>
                <Ionicons name="cube-outline" size={20} color={COLORS.primary} />
                <Text style={styles.filterMenuItemText}>List an Item</Text>
              </View>
              <Text style={styles.menuItemDesc}>Share something you own</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterMenuItem}
              onPress={() => {
                setShowActionMenu(false);
                navigation.navigate('CreateRequest');
              }}
            >
              <View style={styles.menuItemRow}>
                <Ionicons name="create-outline" size={20} color={COLORS.secondary} />
                <Text style={styles.filterMenuItemText}>Request an Item</Text>
              </View>
              <Text style={styles.menuItemDesc}>Ask neighbors for something</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  dropdownBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
  },
  dropdownBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  dropdownBtnActive: {
    backgroundColor: COLORS.primaryMuted,
  },
  filterIconContainer: {
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  dropdownBtnTextActive: {
    color: COLORS.primary,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    ...SHADOWS.md,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  searchSection: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: 15,
    color: COLORS.text,
  },
  filterOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  filterMenu: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.xl,
    width: '100%',
    maxWidth: 320,
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  filterMenuTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  filterMenuItem: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
  },
  filterMenuItemActive: {
    backgroundColor: COLORS.primaryMuted,
  },
  filterMenuItemText: {
    fontSize: 16,
    color: COLORS.text,
  },
  filterMenuItemTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  menuItemRowSpaced: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuItemDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginLeft: 32,
  },
  filterDoneButton: {
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  filterDoneButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray[700],
    borderWidth: 2,
    borderColor: COLORS.surfaceElevated,
  },
  userMeta: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  timeAgo: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  requestBadge: {
    backgroundColor: COLORS.secondaryMuted,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  listingImage: {
    width: '100%',
    height: 220,
    backgroundColor: COLORS.gray[800],
  },
  cardBody: {
    padding: SPACING.lg,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    letterSpacing: -0.3,
  },
  listingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  conditionBadge: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  freeLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  priceLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  dateText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    paddingVertical: SPACING.xs,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  actionDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.gray[700],
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  loadingMore: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    ...SHADOWS.md,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
