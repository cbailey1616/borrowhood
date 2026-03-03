import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  ActivityIndicator,
  InteractionManager,
  Platform,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { Ionicons } from '../components/Icon';
import UserBadges from '../components/UserBadges';
import HapticPressable from '../components/HapticPressable';
import SearchBar from '../components/SearchBar';
import AnimatedCard from '../components/AnimatedCard';
import ActionSheet from '../components/ActionSheet';
import NativeHeader from '../components/NativeHeader';
import { SkeletonCard } from '../components/SkeletonLoader';
import ShimmerImage from '../components/ShimmerImage';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '../utils/config';
import { checkPremiumGate } from '../utils/premiumGate';
import { ENABLE_PAID_TIERS } from '../utils/config';

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
  const { user, refreshUser } = useAuth();
  const [feed, setFeed] = useState([]);
  const [community, setCommunity] = useState(null);
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
  const [selectedRequest, setSelectedRequest] = useState(null);

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
    // Fetch community info for banner
    const loadCommunity = async () => {
      try {
        const communities = await api.getCommunities({ member: 'true' });
        if (communities?.length > 0) setCommunity(communities[0]);
      } catch (e) {}
    };
    loadCommunity();
  }, []);

  useEffect(() => {
    if (!isInitialLoad) {
      fetchFeed(1, false);
    }
  }, [activeFilters, visibilityFilters, categoryFilters]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!isInitialLoad) {
        // Delay feed fetch until modal dismiss animation completes
        // to avoid blocking the JS thread during transitions
        InteractionManager.runAfterInteractions(() => {
          setIsRefreshing(true);
          fetchFeed(1, false);
          // Note: refreshUser() removed from here — it triggers a global re-render
          // of every screen via AuthContext, which freezes the UI during transitions.
          // User data is refreshed on pull-to-refresh instead.
        });
      }
    });
    return unsubscribe;
  }, [navigation, isInitialLoad, fetchFeed]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchFeed(1, false);
    refreshUser(); // Refresh user data on manual pull-to-refresh
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

  const handleRenewRequest = useCallback(async (requestId) => {
    try {
      await api.renewRequest(requestId);
      haptics.success();
      fetchFeed(1, false);
    } catch (error) {
      haptics.error();
    }
  }, [fetchFeed]);

  const handleTownToggle = () => {
    // TODO: Restore subscription gate when re-enabling paid tiers (ENABLE_PAID_TIERS)
    if (ENABLE_PAID_TIERS && user?.subscriptionTier !== 'plus' && !user?.isVerified) {
      setActiveDropdown(null);
      // Delay so the ActionSheet portal closes before the overlay renders
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
      <View style={styles.card}>
        <HapticPressable
          onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
          haptic="light"
          scaleDown={0.98}
        >
          <View style={styles.cardHeader}>
            {item.ownerMasked ? (
              <View style={styles.userInfo}>
                <View style={[styles.avatar, styles.maskedAvatar]}>
                  <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
                </View>
                <View style={styles.userMeta}>
                  <Text style={styles.userName}>Verified Lender</Text>
                  <Text style={styles.timeAgo}>{formatTimeAgo(item.createdAt)}</Text>
                </View>
              </View>
            ) : (
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
                      {item.user.firstName} {item.user.lastName ? `${item.user.lastName.charAt(0)}.` : ''}
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
            )}
            <View style={[styles.typeBadge, !item.isAvailable && styles.borrowedBadge]}>
              <Ionicons name={item.isAvailable !== false ? "cube-outline" : "time-outline"} size={12} color={item.isAvailable !== false ? COLORS.primary : COLORS.warning} />
              <Text style={[styles.typeBadgeText, !item.isAvailable && styles.borrowedBadgeText]}>
                {item.isAvailable !== false ? 'Available' : 'Borrowed'}
              </Text>
            </View>
          </View>

          {item.photoUrl && (
            <ShimmerImage
              source={{ uri: item.photoUrl }}
              style={styles.listingImage}
              sharedTransitionTag={`listing-photo-${item.id}`}
            />
          )}

          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <View style={styles.listingMeta}>
              {item.condition && (
                <View style={styles.conditionBadge}>
                  <Text style={styles.conditionText}>{CONDITION_LABELS[item.condition]}</Text>
                </View>
              )}
              {item.isFree ? (
                <Text style={styles.freeLabel}>Free to borrow</Text>
              ) : (
                <Text style={styles.priceLabel}>${item.pricePerDay}/day</Text>
              )}
            </View>
          </View>

          {item.ownerMasked ? (
            <HapticPressable
              style={styles.verifyUnlockBanner}
              onPress={() => {
                const gate = checkPremiumGate(user, 'town_browse');
                if (!gate.passed) {
                  navigation.navigate(gate.screen, gate.params);
                } else {
                  navigation.navigate('IdentityVerification', { source: 'town_browse' });
                }
              }}
              haptic="light"
              scaleDown={1}
            >
              <Ionicons name="lock-closed" size={14} color={COLORS.warning} />
              <Text style={styles.verifyUnlockText}>Verify to unlock town access</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
            </HapticPressable>
          ) : (
            <View style={styles.cardActions}>
              <HapticPressable
                style={styles.actionButton}
                onPress={() => navigation.navigate('ListingDiscussion', { listingId: item.id, listing: item })}
                haptic="light"
                scaleDown={1}
              >
                <Ionicons name="chatbubbles-outline" size={18} color={COLORS.greenTextMuted} />
                <Text style={styles.actionText}>Discuss</Text>
              </HapticPressable>
              {item.owner?.id !== user?.id && (
                <>
                  <View style={styles.actionDivider} />
                  <HapticPressable
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('Chat', { recipientId: item.user.id, listingId: item.id, listing: item })}
                    haptic="light"
                    scaleDown={1}
                  >
                    <Ionicons name="mail-outline" size={18} color={COLORS.greenText} />
                    <Text style={styles.actionText}>Message</Text>
                  </HapticPressable>
                </>
              )}
            </View>
          )}
        </HapticPressable>
      </View>
    </AnimatedCard>
  );

  const renderRequestItem = (item, index) => {
    const neededByDate = item.neededUntil
      ? new Date(item.neededUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : null;

    return (
      <AnimatedCard index={index}>
        <HapticPressable
          onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
          haptic="light"
          scaleDown={0.98}
          style={styles.requestCard}
        >
          {/* Red urgency banner */}
          <LinearGradient
            colors={item.isExpired ? [COLORS.gray[500], COLORS.gray[400]] : ['#C0392B', '#E74C3C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.requestBannerGradient}
          >
            <View style={styles.requestBannerLeft}>
              <Text style={styles.requestBannerEmoji}>📢</Text>
              <Text style={styles.requestBannerLabel}>{item.isExpired ? 'EXPIRED' : 'WANTED'}</Text>
            </View>
            <Text style={styles.requestBannerDate}>
              {item.isExpired ? 'Request expired' : neededByDate ? `Needed by ${neededByDate}` : 'Open request'}
            </Text>
          </LinearGradient>

          {/* Card content */}
          <View style={styles.requestContent}>
            <View style={styles.requestContentRow}>
              <HapticPressable
                onPress={() => navigation.navigate('UserProfile', { id: item.user.id })}
                haptic="light"
                scaleDown={1}
              >
                {item.user.profilePhotoUrl ? (
                  <Image source={{ uri: item.user.profilePhotoUrl }} style={styles.requestAvatar} />
                ) : (
                  <View style={[styles.requestAvatar, styles.requestAvatarPlaceholder]}>
                    <Ionicons name="person" size={16} color={COLORS.gray[400]} />
                  </View>
                )}
              </HapticPressable>
              <View style={styles.requestContentMeta}>
                <Text style={styles.requestTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.requestSubtitle}>
                  {item.user.firstName} {item.user.lastName ? `${item.user.lastName.charAt(0)}.` : ''} · {formatTimeAgo(item.createdAt)}
                </Text>
              </View>
              {item.user.id === user?.id ? (
                item.isExpired ? (
                  <HapticPressable
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleRenewRequest(item.id);
                    }}
                    haptic="medium"
                    style={styles.renewCTA}
                  >
                    <Text style={styles.renewCTAText}>Renew</Text>
                  </HapticPressable>
                ) : null
              ) : (
                <HapticPressable
                  onPress={() => setSelectedRequest(item)}
                  haptic="medium"
                  style={styles.requestCTA}
                >
                  <Text style={styles.requestCTAText}>I Have This</Text>
                </HapticPressable>
              )}
            </View>
            {item.description ? (
              <Text style={styles.requestSnippet} numberOfLines={2}>{item.description}</Text>
            ) : null}
          </View>
        </HapticPressable>
      </AnimatedCard>
    );
  };

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
        title=""
        scrollY={scrollY}
      >
        <View style={styles.searchRow}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search..."
            onSubmitEditing={handleSearch}
            testID="Feed.searchBar"
            accessibilityLabel="Search items"
            style={styles.headerSearchBar}
            dark
          />
          <HapticPressable onPress={() => setShowActionSheet(true)} haptic="light" testID="Feed.button.create" accessibilityLabel="Create new listing" accessibilityRole="button" style={styles.addButton}>
            <Ionicons name="add" size={22} color="#fff" />
          </HapticPressable>
        </View>

        <View style={styles.filterChipsRow}>
          <View>
            <HapticPressable
              style={[styles.dropdownChip, activeFilters.length > 0 && styles.dropdownChipActive]}
              onPress={() => setActiveDropdown('type')}
              haptic="light"
              testID="Feed.chip.allTypes"
              accessibilityLabel="Filter by type"
              accessibilityRole="button"
            >
              <Text style={[styles.dropdownChipText, activeFilters.length > 0 && styles.dropdownChipTextActive]}>
                {typeChipLabel}
              </Text>
              <Ionicons name="chevron-down" size={14} color={activeFilters.length > 0 ? '#fff' : 'rgba(255,255,255,0.6)'} />
            </HapticPressable>
            {activeFilters.length > 0 && <View style={styles.filterDot} />}
          </View>

          <View>
            <HapticPressable
              style={[styles.dropdownChip, visibilityFilters.length > 0 && styles.dropdownChipActive]}
              onPress={() => setActiveDropdown('visibility')}
              haptic="light"
              testID="Feed.chip.visibility"
              accessibilityLabel="Filter by visibility"
              accessibilityRole="button"
            >
              <Text style={[styles.dropdownChipText, visibilityFilters.length > 0 && styles.dropdownChipTextActive]}>
                {visibilityChipLabel}
              </Text>
              <Ionicons name="chevron-down" size={14} color={visibilityFilters.length > 0 ? '#fff' : 'rgba(255,255,255,0.6)'} />
            </HapticPressable>
            {visibilityFilters.length > 0 && <View style={styles.filterDot} />}
          </View>

          {categories.length > 0 && (
            <View>
              <HapticPressable
                style={[styles.dropdownChip, categoryFilters.length > 0 && styles.dropdownChipActive]}
                onPress={() => setActiveDropdown('category')}
                haptic="light"
                testID="Feed.chip.category"
                accessibilityLabel="Filter by category"
                accessibilityRole="button"
              >
                <Text style={[styles.dropdownChipText, categoryFilters.length > 0 && styles.dropdownChipTextActive]}>
                  {categoryChipLabel}
                </Text>
                <Ionicons name="chevron-down" size={14} color={categoryFilters.length > 0 ? '#fff' : 'rgba(255,255,255,0.6)'} />
              </HapticPressable>
              {categoryFilters.length > 0 && <View style={styles.filterDot} />}
            </View>
          )}
        </View>
      </NativeHeader>

      <AnimatedFlatList
        data={feed}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.listContent}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <>
            {community && (
              <HapticPressable
                style={styles.communityBanner}
                onPress={() => navigation.navigate('MyCommunity')}
                haptic="light"
                scaleDown={0.98}
              >
                <View style={styles.communityBannerInner}>
                  <View style={styles.communityIconWrap}>
                    <Ionicons name="home" size={22} color={COLORS.greenText} />
                  </View>
                  <View style={styles.communityBannerContent}>
                    <Text style={styles.communityBannerTitle}>{community.name} is growing!</Text>
                    <Text style={styles.communityBannerStats}>
                      {community.memberCount || 0} neighbors · {community.listingCount || 0} tools shared
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.greenTextMuted} />
                </View>
              </HapticPressable>
            )}
          </>
        }
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
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cube-outline" size={28} color={COLORS.primary} style={{ position: 'absolute', top: 14, left: 16 }} />
              <Ionicons name="arrow-forward-outline" size={20} color={COLORS.primary} style={{ position: 'absolute', bottom: 18, right: 14, opacity: 0.6 }} />
              <Ionicons name="person-outline" size={24} color={COLORS.primary} style={{ position: 'absolute', bottom: 14, left: 20, opacity: 0.8 }} />
            </View>
            <Text style={styles.emptyTitle}>Your hood is quiet</Text>
            <Text style={styles.emptySubtitle}>
              Be the first to list a tool or post a request in your neighborhood!
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
        title={
          activeFilters.length > 0
            ? <>{'Type  '}<Text onPress={() => { setActiveFilters([]); haptics.light(); }} style={{ fontWeight: '400', color: COLORS.primary }}>Clear</Text></>
            : 'Type'
        }
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
        title={
          visibilityFilters.length > 0
            ? <>{'Visibility  '}<Text onPress={() => { setVisibilityFilters([]); haptics.light(); }} style={{ fontWeight: '400', color: COLORS.primary }}>Clear</Text></>
            : 'Visibility'
        }
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
            label: opt.label,
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
        title={
          categoryFilters.length > 0
            ? <>{'Category  '}<Text onPress={() => { setCategoryFilters([]); haptics.light(); }} style={{ fontWeight: '400', color: COLORS.primary }}>Clear</Text></>
            : 'Category'
        }
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

      <ActionSheet
        isVisible={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title="I Have This"
        actions={[
          {
            label: 'Message Them',
            icon: <Ionicons name="chatbubble-outline" size={20} color={COLORS.text} />,
            onPress: () => {
              const req = selectedRequest;
              setSelectedRequest(null);
              navigation.navigate('Chat', { recipientId: req.user.id });
            },
          },
          {
            label: 'Post My Item',
            icon: <Ionicons name="add-circle-outline" size={20} color={COLORS.text} />,
            onPress: () => {
              const req = selectedRequest;
              setSelectedRequest(null);
              navigation.navigate('CreateListing', { requestMatch: req });
            },
          },
        ]}
      />

      {/* TODO: Restore upgrade overlay when re-enabling paid tiers (ENABLE_PAID_TIERS) */}
      {ENABLE_PAID_TIERS && showUpgradePrompt && (
        <View style={styles.overlay} testID="Feed.overlay.upgrade" accessibilityLabel="Upgrade to Plus overlay">
          <View style={styles.overlayCard}>
            <View style={styles.overlayCardInner}>
              <View style={styles.overlayIconContainer}>
                <Ionicons name="star" size={32} color={COLORS.primary} />
              </View>
              <Text style={styles.overlayTitle}>See What's Happening Across Town</Text>
              <Text style={styles.overlayText}>
                Verified members can browse items from everyone in {user?.city || 'your town'}.
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
                  navigation.navigate('Subscription', { source: 'town_browse', totalSteps: 2 });
                }}
                haptic="medium"
                testID="Feed.overlay.upgrade.button"
                accessibilityLabel="Verify and unlock"
                accessibilityRole="button"
              >
                <Text style={styles.overlayButtonText}>Verify & Unlock — $1.99</Text>
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  headerSearchBar: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersSection: {
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  filterChipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  dropdownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  dropdownChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dropdownChipText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },
  dropdownChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  filterDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
    borderWidth: 1.5,
    borderColor: COLORS.background,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(44, 24, 16, 0.85)',
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
  communityBanner: {
    backgroundColor: COLORS.greenBg,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1.5,
    borderColor: COLORS.greenBorder,
  },
  communityBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  communityIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.greenSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityBannerContent: {
    flex: 1,
  },
  communityBannerTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.greenText,
  },
  communityBannerStats: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.greenTextMuted,
    marginTop: 2,
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
    backgroundColor: COLORS.greenBg,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.greenSurface,
    borderWidth: 2,
    borderColor: COLORS.greenBorder,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  maskedAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary + '20',
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
    color: COLORS.greenText,
  },
  timeAgo: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.greenTextMuted,
    marginTop: 2,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'transparent',
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 1,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.greenBorder,
  },
  requestCard: {
    marginBottom: SPACING.lg,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(192, 57, 43, 0.18)',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(192, 57, 43, 0.06)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  requestBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  requestBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  requestBannerEmoji: {
    fontSize: 10,
  },
  requestBannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  requestBannerDate: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  requestContent: {
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  requestContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  requestAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.gray[200],
  },
  requestAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestContentMeta: {
    flex: 1,
  },
  requestTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  requestSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  requestSnippet: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: SPACING.sm,
  },
  requestCTA: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(45, 90, 39, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(45, 90, 39, 0.25)',
  },
  requestCTAText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  renewCTA: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '15',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  renewCTAText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  typeBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.greenText,
  },
  borrowedBadge: {
    backgroundColor: 'transparent',
    borderColor: COLORS.warning + '80',
  },
  borrowedBadgeText: {
    color: COLORS.warning,
  },
  listingImage: {
    width: '100%',
    height: 220,
    backgroundColor: COLORS.separator,
  },
  cardBody: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.greenSeparator,
    backgroundColor: COLORS.greenBg,
  },
  cardTitle: {
    ...TYPOGRAPHY.h3,
    fontWeight: '700',
    color: COLORS.greenText,
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
    backgroundColor: COLORS.greenSurface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.greenBorder,
  },
  conditionText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.greenTextMuted,
  },
  freeLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.greenText,
  },
  priceLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.greenText,
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
    backgroundColor: COLORS.greenSurface,
    paddingVertical: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.greenSeparator,
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
    backgroundColor: COLORS.greenSeparator,
  },
  actionText: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.greenText,
  },
  verifyUnlockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.warning + '30',
    gap: SPACING.sm,
  },
  verifyUnlockText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    flex: 1,
  },
  loadingMore: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
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
