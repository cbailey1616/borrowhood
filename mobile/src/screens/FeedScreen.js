import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { Ionicons } from '../components/Icon';
import UserBadges from '../components/UserBadges';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import SearchBar from '../components/SearchBar';
import AnimatedCard from '../components/AnimatedCard';
import ActionSheet from '../components/ActionSheet';
import NativeHeader from '../components/NativeHeader';
import { SkeletonCard } from '../components/SkeletonLoader';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '../utils/config';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

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
  const [activeFilters, setActiveFilters] = useState([]);
  const [visibilityFilters, setVisibilityFilters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const fetchFeed = useCallback(async (pageNum = 1, append = false) => {
    try {
      const params = { page: pageNum, limit: 20 };
      if (search) params.search = search;
      if (activeFilters.length > 0) params.type = activeFilters.join(',');
      if (visibilityFilters.length > 0) params.visibility = visibilityFilters.join(',');
      if (categoryFilters.length > 0) params.categoryId = categoryFilters.join(',');

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
  }, [search, activeFilters, visibilityFilters, categoryFilters]);

  useEffect(() => {
    fetchFeed();
    // Fetch categories
    const loadCategories = async () => {
      try {
        const cats = await api.getCategories();
        setCategories(cats || []);
      } catch (e) {
        console.log('Failed to fetch categories:', e);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    if (!isInitialLoad) {
      fetchFeed(1, false);
    }
  }, [activeFilters, visibilityFilters, categoryFilters]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!isInitialLoad) {
        setIsRefreshing(true);
        fetchFeed(1, false);
      }
    });
    return unsubscribe;
  }, [navigation, isInitialLoad]);

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

  const handleClearSearch = useCallback(() => {
    setSearch('');
    fetchFeed(1, false);
  }, []);

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

  const handleTownToggle = async () => {
    try {
      const result = await api.checkSubscriptionAccess('town');
      if (!result.canAccess) {
        setActiveDropdown(null);
        // Delay so the ActionSheet portal closes before the overlay renders
        setTimeout(() => setShowUpgradePrompt(true), 350);
        return;
      }
    } catch {
      setActiveDropdown(null);
      setTimeout(() => setShowUpgradePrompt(true), 350);
      return;
    }
    toggleFilter('town', visibilityKeys, setVisibilityFilters);
  };

  const toggleFilter = (key, allKeys, setFilters) => {
    setFilters(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      }
      const next = [...prev, key];
      if (allKeys.every(k => next.includes(k))) return [];
      return next;
    });
  };

  const typeKeys = FILTER_OPTIONS.filter(o => o.key !== 'all').map(o => o.key);
  const visibilityKeys = VISIBILITY_OPTIONS.filter(o => o.key !== 'all').map(o => o.key);

  const typeChipLabel = activeFilters.length === 0
    ? 'All Types'
    : activeFilters.length === 1
      ? FILTER_OPTIONS.find(o => o.key === activeFilters[0])?.label
      : `${activeFilters.length} Types`;

  const visibilityChipLabel = visibilityFilters.length === 0
    ? 'Everyone'
    : visibilityFilters.length === 1
      ? VISIBILITY_OPTIONS.find(o => o.key === visibilityFilters[0])?.label
      : `${visibilityFilters.length} Areas`;

  const categoryChipLabel = categoryFilters.length === 0
    ? 'All Categories'
    : categoryFilters.length === 1
      ? categories.find(c => c.id === categoryFilters[0])?.name || 'Category'
      : `${categoryFilters.length} Categories`;

  const createActions = [
    {
      label: 'List an Item',
      icon: <Ionicons name="cube-outline" size={20} color={COLORS.primary} />,
      onPress: () => navigation.navigate('CreateListing'),
    },
    {
      label: 'Request an Item',
      icon: <Ionicons name="create-outline" size={20} color={COLORS.secondary} />,
      onPress: () => navigation.navigate('CreateRequest'),
    },
  ];

  const renderListingItem = (item, index) => (
    <AnimatedCard index={index}>
      <BlurCard style={styles.card}>
        <HapticPressable
          onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
          haptic="light"
          scaleDown={0.98}
        >
          <View style={styles.cardHeader}>
            <HapticPressable
              style={styles.userInfo}
              onPress={() => navigation.navigate('UserProfile', { id: item.user.id })}
              haptic="light"
              scaleDown={1}
            >
              {item.user.profilePhotoUrl ? (
                <Image source={{ uri: item.user.profilePhotoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={20} color={COLORS.gray[400]} />
                </View>
              )}
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
            </HapticPressable>
            <View style={styles.typeBadge}>
              <Ionicons name="cube-outline" size={12} color={COLORS.primary} />
              <Text style={styles.typeBadgeText}>New Item</Text>
            </View>
          </View>

          {item.photoUrl && (
            <Image source={{ uri: item.photoUrl }} style={styles.listingImage} />
          )}

          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <View style={styles.listingMeta}>
              <View style={styles.conditionBadge}>
                <Text style={styles.conditionText}>{CONDITION_LABELS[item.condition]}</Text>
              </View>
              {item.category && (
                <View style={styles.conditionBadge}>
                  <Text style={styles.conditionText}>{item.category}</Text>
                </View>
              )}
              {item.isFree ? (
                <Text style={styles.freeLabel}>Free to borrow</Text>
              ) : (
                <Text style={styles.priceLabel}>${item.pricePerDay}/day</Text>
              )}
            </View>
            {item.description && (
              <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
            )}
          </View>

          <View style={styles.cardActions}>
            <HapticPressable
              style={styles.actionButton}
              onPress={() => navigation.navigate('ListingDiscussion', { listingId: item.id, listing: item })}
              haptic="light"
              scaleDown={1}
            >
              <Ionicons name="chatbubbles-outline" size={18} color={COLORS.textSecondary} />
              <Text style={[styles.actionText, { color: COLORS.textSecondary }]}>Discuss</Text>
            </HapticPressable>
            <View style={styles.actionDivider} />
            <HapticPressable
              style={styles.actionButton}
              onPress={() => navigation.navigate('Chat', { recipientId: item.user.id, listingId: item.id, listing: item })}
              haptic="light"
              scaleDown={1}
            >
              <Ionicons name="mail-outline" size={18} color={COLORS.primary} />
              <Text style={styles.actionText}>Message</Text>
            </HapticPressable>
          </View>
        </HapticPressable>
      </BlurCard>
    </AnimatedCard>
  );

  const renderRequestItem = (item, index) => (
    <AnimatedCard index={index}>
      <BlurCard style={[styles.card, styles.requestCard]}>
        <HapticPressable
          onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
          haptic="light"
          scaleDown={0.98}
        >
          <View style={styles.cardHeader}>
            <HapticPressable
              style={styles.userInfo}
              onPress={() => navigation.navigate('UserProfile', { id: item.user.id })}
              haptic="light"
              scaleDown={1}
            >
              {item.user.profilePhotoUrl ? (
                <Image source={{ uri: item.user.profilePhotoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={20} color={COLORS.gray[400]} />
                </View>
              )}
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
            </HapticPressable>
            <View style={[styles.typeBadge, styles.requestBadge]}>
              <Ionicons name="search-outline" size={12} color={COLORS.secondary} />
              <Text style={[styles.typeBadgeText, { color: COLORS.secondary }]}>Looking For</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.description && (
              <Text style={styles.description} numberOfLines={3}>{item.description}</Text>
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

          <View style={[styles.cardActions, styles.requestActions]}>
            <HapticPressable
              style={styles.actionButton}
              onPress={() => navigation.navigate('CreateListing', { requestMatch: item })}
              haptic="light"
              scaleDown={1}
            >
              <Ionicons name="hand-right-outline" size={18} color={COLORS.secondary} />
              <Text style={[styles.actionText, { color: COLORS.secondary }]}>I Have This</Text>
            </HapticPressable>
            <HapticPressable
              style={styles.actionButton}
              onPress={() => navigation.navigate('Chat', { recipientId: item.user.id })}
              haptic="light"
              scaleDown={1}
            >
              <Ionicons name="chatbubble-outline" size={18} color={COLORS.textSecondary} />
              <Text style={[styles.actionText, { color: COLORS.textSecondary }]}>Message</Text>
            </HapticPressable>
          </View>
        </HapticPressable>
      </BlurCard>
    </AnimatedCard>
  );

  const renderItem = ({ item, index }) => {
    if (item.type === 'listing') {
      return renderListingItem(item, index);
    }
    return renderRequestItem(item, index);
  };

  if (isInitialLoad) {
    return (
      <View style={styles.container}>
        <NativeHeader title="Feed" scrollY={scrollY} />
        <View style={styles.skeletonContainer}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NativeHeader
        title="Feed"
        scrollY={scrollY}
        rightElement={
          <HapticPressable onPress={() => setShowActionSheet(true)} haptic="light">
            <Ionicons name="add-circle" size={28} color={COLORS.primary} />
          </HapticPressable>
        }
      />

      <View style={styles.filtersSection}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search..."
          onSubmitEditing={handleSearch}
        />

        <View style={styles.filterChipsRow}>
          <HapticPressable
            style={[styles.dropdownChip, activeFilters.length > 0 && styles.dropdownChipActive]}
            onPress={() => setActiveDropdown('type')}
            haptic="light"
          >
            <Text style={[styles.dropdownChipText, activeFilters.length > 0 && styles.dropdownChipTextActive]}>
              {typeChipLabel}
            </Text>
            <Ionicons name="chevron-down" size={14} color={activeFilters.length > 0 ? '#fff' : COLORS.textSecondary} />
          </HapticPressable>

          <HapticPressable
            style={[styles.dropdownChip, visibilityFilters.length > 0 && styles.dropdownChipActive]}
            onPress={() => setActiveDropdown('visibility')}
            haptic="light"
          >
            <Text style={[styles.dropdownChipText, visibilityFilters.length > 0 && styles.dropdownChipTextActive]}>
              {visibilityChipLabel}
            </Text>
            <Ionicons name="chevron-down" size={14} color={visibilityFilters.length > 0 ? '#fff' : COLORS.textSecondary} />
          </HapticPressable>

          {categories.length > 0 && (
            <HapticPressable
              style={[styles.dropdownChip, categoryFilters.length > 0 && styles.dropdownChipActive]}
              onPress={() => setActiveDropdown('category')}
              haptic="light"
            >
              <Text style={[styles.dropdownChipText, categoryFilters.length > 0 && styles.dropdownChipTextActive]}>
                {categoryChipLabel}
              </Text>
              <Ionicons name="chevron-down" size={14} color={categoryFilters.length > 0 ? '#fff' : COLORS.textSecondary} />
            </HapticPressable>
          )}
        </View>
      </View>

      <AnimatedFlatList
        data={feed}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.listContent}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
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
            <HapticPressable
              style={styles.emptyButton}
              onPress={() => navigation.navigate('CreateListing')}
              haptic="medium"
            >
              <Text style={styles.emptyButtonText}>List an Item</Text>
            </HapticPressable>
          </View>
        }
      />

      <ActionSheet
        isVisible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        title="Create"
        actions={createActions}
      />

      <ActionSheet
        isVisible={activeDropdown === 'type'}
        onClose={() => setActiveDropdown(null)}
        title="Type"
        multiSelect
        actions={[
          {
            label: 'All',
            icon: activeFilters.length === 0
              ? <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
              : <Ionicons name="ellipse-outline" size={20} color={COLORS.textMuted} />,
            onPress: () => setActiveFilters([]),
          },
          ...FILTER_OPTIONS.filter(o => o.key !== 'all').map(opt => ({
            label: opt.label,
            icon: activeFilters.includes(opt.key)
              ? <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
              : <Ionicons name="ellipse-outline" size={20} color={COLORS.textMuted} />,
            onPress: () => toggleFilter(opt.key, typeKeys, setActiveFilters),
          })),
        ]}
      />

      <ActionSheet
        isVisible={activeDropdown === 'visibility'}
        onClose={() => setActiveDropdown(null)}
        title="Visibility"
        multiSelect
        actions={[
          {
            label: 'Everyone',
            icon: visibilityFilters.length === 0
              ? <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
              : <Ionicons name="ellipse-outline" size={20} color={COLORS.textMuted} />,
            onPress: () => setVisibilityFilters([]),
          },
          ...VISIBILITY_OPTIONS.filter(o => o.key !== 'all').map(opt => ({
            label: opt.key === 'town' ? `${opt.label} ★` : opt.label,
            icon: visibilityFilters.includes(opt.key)
              ? <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
              : <Ionicons name="ellipse-outline" size={20} color={COLORS.textMuted} />,
            onPress: opt.key === 'town'
              ? handleTownToggle
              : () => toggleFilter(opt.key, visibilityKeys, setVisibilityFilters),
          })),
        ]}
      />

      <ActionSheet
        isVisible={activeDropdown === 'category'}
        onClose={() => setActiveDropdown(null)}
        title="Category"
        multiSelect
        actions={[
          {
            label: 'All Categories',
            icon: categoryFilters.length === 0
              ? <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
              : <Ionicons name="ellipse-outline" size={20} color={COLORS.textMuted} />,
            onPress: () => setCategoryFilters([]),
          },
          ...categories.map(cat => ({
            label: cat.name,
            icon: categoryFilters.includes(cat.id)
              ? <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
              : <Ionicons name={cat.icon || 'pricetag-outline'} size={20} color={COLORS.textMuted} />,
            onPress: () => {
              const allCatIds = categories.map(c => c.id);
              toggleFilter(cat.id, allCatIds, setCategoryFilters);
            },
          })),
        ]}
      />

      {showUpgradePrompt && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <View style={styles.overlayCardInner}>
              <View style={styles.overlayIconContainer}>
                <Ionicons name="star" size={32} color={COLORS.primary} />
              </View>
              <Text style={styles.overlayTitle}>Upgrade to Plus</Text>
              <Text style={styles.overlayText}>
                Get more from Borrowhood with Plus. Browse items from your whole town and discover what's available nearby.
              </Text>
              <View style={styles.upgradeFeatures}>
                <View style={styles.upgradeFeature}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
                  <Text style={styles.upgradeFeatureText}>Everything in Free</Text>
                </View>
                <View style={styles.upgradeFeature}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
                  <Text style={styles.upgradeFeatureText}>Borrow from anyone in town</Text>
                </View>
                <View style={styles.upgradeFeature}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
                  <Text style={styles.upgradeFeatureText}>Charge rental fees</Text>
                </View>
              </View>
              <HapticPressable
                style={styles.overlayButton}
                onPress={() => {
                  setShowUpgradePrompt(false);
                  navigation.navigate('Subscription');
                }}
                haptic="medium"
              >
                <Text style={styles.overlayButtonText}>Get Plus - $1/mo</Text>
              </HapticPressable>
              <HapticPressable
                style={styles.overlayDismiss}
                onPress={() => setShowUpgradePrompt(false)}
                haptic="light"
              >
                <Text style={styles.overlayDismissText}>Not Now</Text>
              </HapticPressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  skeletonContainer: {
    padding: SPACING.lg,
  },
  filtersSection: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  dropdownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
  },
  dropdownChipActive: {
    backgroundColor: COLORS.primary,
  },
  dropdownChipText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  dropdownChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: SPACING.xl,
    zIndex: 1000,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  overlayCardInner: {
    padding: 28,
  },
  overlayIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.secondary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  overlayTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  overlayText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  overlayButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  overlayButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.background,
  },
  overlayDismiss: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: SPACING.sm,
  },
  overlayDismissText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
  },
  upgradeFeatures: {
    gap: 10,
    marginBottom: SPACING.xl,
  },
  upgradeFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upgradeFeatureText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.text,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  card: {
    marginBottom: SPACING.lg,
    borderRadius: RADIUS.xl,
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
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
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
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.text,
  },
  timeAgo: {
    ...TYPOGRAPHY.caption1,
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
  requestCard: {
    backgroundColor: COLORS.secondary + '12',
    borderWidth: 1,
    borderColor: COLORS.secondary + '25',
  },
  requestBadge: {
    backgroundColor: COLORS.secondaryMuted,
  },
  typeBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
  },
  listingImage: {
    width: '100%',
    height: 220,
    backgroundColor: COLORS.separator,
  },
  cardBody: {
    padding: SPACING.lg,
  },
  cardTitle: {
    ...TYPOGRAPHY.h3,
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
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  freeLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.primary,
  },
  priceLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.primary,
  },
  description: {
    ...TYPOGRAPHY.footnote,
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
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    paddingVertical: SPACING.xs,
  },
  requestActions: {
    backgroundColor: COLORS.secondary + '10',
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
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: COLORS.separator,
  },
  actionText: {
    ...TYPOGRAPHY.subheadline,
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
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
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
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
});
