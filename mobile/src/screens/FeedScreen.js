import { listingAvailability } from '../utils/listingAvailability';
import { requestPresentation } from '../utils/requestPresentation';
import TownIdentityPrompt from '../components/TownIdentityPrompt';
import ListingPrice from '../components/ListingPrice';
import LayeredCard from '../components/LayeredCard';
import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { FeedSeenContext } from '../hooks/useInboxBadges';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { isSaleListing, isTransferListing } from '../utils/directFee';
import { randomUUID } from 'expo-crypto';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  AppState,
  InteractionManager,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import CategoryIcon from '../components/CategoryIcon';
import VerifiedBadge from '../components/VerifiedBadge';
import useSavedListings from '../hooks/useSavedListings';
import { useError } from '../context/ErrorContext';
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
import SearchBar from '../components/SearchBar';
import ActionSheet from '../components/ActionSheet';
import NativeHeader from '../components/NativeHeader';
import { SkeletonCard } from '../components/SkeletonLoader';
import ShimmerImage from '../components/ShimmerImage';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '../utils/config';
import { checkPremiumGate } from '../utils/premiumGate';
import { ENABLE_PAID_TIERS } from '../utils/config';


const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'listings', label: 'Borrow' },
  { key: 'giveaway', label: 'Giveaways' },
  { key: 'sell', label: 'For sale' },
  { key: 'requests', label: 'Requests' },
];

const VISIBILITY_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'close_friends', label: 'Friends' },
  { key: 'neighborhood', label: 'Neighborhood' },
  { key: 'town', label: 'Town' },
];

// Feed surfaces follow the shared app theme.
const FEED = {
  bg: COLORS.background, card: COLORS.card, cardBorder: COLORS.borderLight,
  body: COLORS.textSecondary, meta: COLORS.textMuted,
  thread: COLORS.gray[50], threadDeep: COLORS.surfaceElevated,
};

export default function FeedScreen({ navigation }) {
  const markFeedSeen = useContext(FeedSeenContext);
  const insets = useSafeAreaInsets();
  const { user, refreshUser, isGracePeriodActive } = useAuth();
  const { showToast, showError } = useError();
  const saved = useSavedListings(navigation, user?.id, { showToast, showError });
  const [feed, setFeed] = useState([]);
  const [requestCards, setRequestCards] = useState([]);
  const { width } = useWindowDimensions();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [visibilityFilters, setVisibilityFilters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [hasNeighborhood, setHasNeighborhood] = useState(true); // assume yes until checked
  const [activeDisputes, setActiveDisputes] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [dueSoonItems, setDueSoonItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dismissedBanners, setDismissedBanners] = useState({});
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const listRef = useRef(null);
  const [focusedItemId, setFocusedItemId] = useState(null);


  const [feedError, setFeedError] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const feedRequest = useRef(0);
  const feedSession = useRef(null);
  const impressions = useRef(new Set());
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const events = viewableItems.filter(({ item, isViewable }) => {
      const key = `${item.type}:${item.id}`;
      if (!['listing', 'request'].includes(item.type) || !isViewable || impressions.current.has(key)) return false;
      impressions.current.add(key); return true;
    }).map(({ item }) => ({ id: item.id, type: item.type, event: 'seen' }));
    if (events.length) api.recordFeedEvents(events.slice(0, 30)).catch(() => {});
  }).current;
  const openFeedItem = item => {
    api.recordFeedEvents([{ id: item.id, type: item.type, event: 'click' }]).catch(() => {});
    navigation.navigate(item.type === 'request' ? 'RequestDetail' : 'ListingDetail', { id: item.id });
  };
  const hasFilters = !!search.trim() || activeFilters.length > 0 || visibilityFilters.length > 0 || categoryFilters.length > 0;
  const extraFilterCount = visibilityFilters.length + categoryFilters.length;
  const fetchFeed = useCallback(async (pageNum = 1, append = false, clear = false) => {
    const requestId = ++feedRequest.current;
    setFeedError(false);
    setIsFetching(true);
    try {
      if (pageNum === 1 || !feedSession.current) { feedSession.current = randomUUID(); impressions.current.clear(); }
      const params = { layout: 'sections', page: pageNum, limit: 20, session: feedSession.current };
      if (!clear && search.trim()) params.search = search.trim();
      if (!clear && activeFilters.length > 0) params.type = activeFilters.join(',');
      if (!clear && visibilityFilters.length > 0) params.visibility = visibilityFilters.join(',');
      if (!clear && categoryFilters.length > 0) params.categoryId = categoryFilters.join(',');

      const data = await api.getFeed(params);
      if (requestId !== feedRequest.current) return;

      if (!append) setRequestCards(data.requests || []);
      if (append) {
        setFeed(prev => [...prev, ...data.items.filter(item => !prev.some(existing => existing.id === item.id && existing.type === item.type))]);
      } else {
        setFeed(data.items || []);
      }
      setHasMore(data.hasMore);
      setPage(pageNum);
      if (pageNum === 1 && !params.search && !params.type && !params.visibility && !params.categoryId &&
          navigation.isFocused?.() && (AppState.currentState == null || AppState.currentState === 'active')) {
        markFeedSeen(data.latestPostAt);
      }
    } catch (error) {
      if (requestId !== feedRequest.current) return;
      setFeedError(true);
      // Keep the current feed visible when a background refresh fails.
    } finally {
      if (requestId !== feedRequest.current) return;
      setIsFetching(false);
      setIsInitialLoad(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [search, activeFilters, visibilityFilters, categoryFilters, navigation, markFeedSeen]);



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
    checkNeighborhood();
    fetchActiveDisputes();
    fetchBannerData();
  }, []);

  useEffect(() => {
    if (!isInitialLoad) {
      fetchFeed(1, false);
    }
  }, [activeFilters, visibilityFilters, categoryFilters]);

  useEffect(() => {
    const timer = setTimeout(() => fetchFeed(1, false), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!isInitialLoad) {
        // Delay feed fetch until modal dismiss animation completes
        // to avoid blocking the JS thread during transitions
        InteractionManager.runAfterInteractions(() => {
          fetchFeed(1, false);
          checkNeighborhood();
          fetchActiveDisputes();
          fetchBannerData();
        });
      }
    });
    return unsubscribe;
  }, [navigation, isInitialLoad, fetchFeed]);


  const fetchActiveDisputes = useCallback(async () => {
    try {
      const data = await api.getDisputes();
      const disputes = data?.disputes || data || [];
      const active = disputes.filter(d =>
        ['awaitingResponse', 'counterPending', 'underReview'].includes(d.status)
      );
      setActiveDisputes(active);
    } catch (e) {
      // Keep current state on error
    }
  }, []);

  const checkNeighborhood = useCallback(async () => {
    try {
      const communities = await api.getCommunities({ member: 'true' });
      const list = communities?.communities || communities || [];
      setHasNeighborhood(Array.isArray(list) && list.length > 0);
    } catch (e) {
      // Keep current state on error
    }
  }, []);

  const fetchBannerData = useCallback(async () => {
    try {
      const [txData, notifData] = await Promise.all([
        api.getTransactions({ status: 'all', limit: 50 }).catch(() => null),
        api.getNotifications({ limit: 1 }).catch(() => null),
      ]);

      // Pending borrow requests (someone wants to borrow your item)
      const txList = txData?.transactions || txData || [];
      const pending = txList.filter(t => t.status === 'pending' && (t.lender?.id === user?.id || t.ownerId === user?.id));
      setPendingRequests(pending);

      // Items you've borrowed that are due back within 2 days
      const now = new Date();
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      const dueSoon = txList.filter(t => {
        if (t.status !== 'active' || t.borrowerId !== user?.id) return false;
        const returnDate = t.returnDate || t.endDate;
        if (!returnDate) return false;
        const due = new Date(returnDate);
        return due - now < twoDays && due - now > -twoDays; // within 2 days before or after
      });
      setDueSoonItems(dueSoon);

      // Unread notification count
      setUnreadCount(notifData?.unreadCount || 0);
    } catch (e) {
      // Keep current state
    }
  }, [user?.id]);

  useEffect(() => {
    const refreshVisibleFeed = () => {
      if (!navigation.isFocused?.()) return;
      fetchFeed(1, false);
      fetchBannerData();
    };
    const received = Notifications.addNotificationReceivedListener(notification => {
      if (['new_request', 'item_match'].includes(notification.request?.content?.data?.type)) refreshVisibleFeed();
    });
    let previousState = AppState.currentState;
    const resumed = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && previousState !== 'active') refreshVisibleFeed();
      previousState = nextState;
    });
    return () => { received.remove(); resumed.remove(); };
  }, [navigation, fetchFeed, fetchBannerData]);

  useEffect(() => navigation.addListener('tabPress', () => {
    if (!navigation.isFocused?.()) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    fetchFeed(1, false);
  }), [navigation, fetchFeed]);

  const onRefresh = () => {
    setIsRefreshing(true);
    saved.refresh();
    fetchFeed(1, false);
    refreshUser(); // Refresh user data on manual pull-to-refresh
    checkNeighborhood();
    fetchActiveDisputes();
    fetchBannerData();
  };

  const dismissBanner = (key) => {
    setDismissedBanners(prev => ({ ...prev, [key]: true }));
    haptics.medium();
  };

  const banners = [
    activeDisputes.length > 0 && !dismissedBanners.disputes && {
      key: 'disputes',
      icon: 'alert-circle',
      color: COLORS.danger,
      title: `${activeDisputes.length} active dispute${activeDisputes.length !== 1 ? 's' : ''}`,
      subtitle: 'Tap to review and respond',
      onPress: () => activeDisputes.length === 1
        ? navigation.navigate('DisputeDetail', { id: activeDisputes[0].id })
        : navigation.navigate('MyItems'),
    },
    pendingRequests.length > 0 && !dismissedBanners.pending && {
      key: 'pending',
      icon: 'hand-left',
      color: COLORS.warning,
      title: `${pendingRequests.length} pending borrow request${pendingRequests.length !== 1 ? 's' : ''}`,
      subtitle: 'Someone wants to borrow your item',
      onPress: () => navigation.navigate('MyItems'),
    },
    dueSoonItems.length > 0 && !dismissedBanners.dueSoon && {
      key: 'dueSoon',
      icon: 'time',
      color: COLORS.info || COLORS.info,
      title: `${dueSoonItems.length} item${dueSoonItems.length !== 1 ? 's' : ''} due back soon`,
      subtitle: "Don't forget to return on time",
      onPress: () => navigation.navigate('MyItems'),
    },
    unreadCount > 0 && !dismissedBanners.unread && {
      key: 'unread',
      icon: 'notifications',
      color: COLORS.primary,
      title: `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`,
      subtitle: 'Tap to catch up',
      onPress: () => navigation.navigate('Activity'),
    },
    !user?.city && !dismissedBanners.location && {
      key: 'location',
      icon: 'navigate',
      color: COLORS.warning,
      title: 'Add your location to see items near you',
      subtitle: 'Go to Settings to set your city',
      onPress: () => navigation.navigate('EditProfile'),
    },
    !hasNeighborhood && feed.length > 0 && !dismissedBanners.join && {
      key: 'join',
      icon: 'location',
      color: COLORS.primary,
      title: 'Join a nearby neighborhood',
      subtitle: 'See items and requests from your neighbors',
      onPress: () => navigation.navigate('JoinCommunity'),
    },
  ].filter(Boolean);

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

  const visibilityKeys = VISIBILITY_OPTIONS.filter(o => o.key !== 'all').map(o => o.key);

  const visibilityChipLabel = visibilityFilters.length === 0
    ? 'Everyone'
    : visibilityFilters.length === 1
      ? VISIBILITY_OPTIONS.find(o => o.key === visibilityFilters[0])?.label
      : `${visibilityFilters.length} Areas`;

  const categoryChipLabel = categoryFilters.length === 0
    ? 'Categories'
    : categoryFilters.length === 1
      ? categories.find(c => c.id === categoryFilters[0])?.name || 'Category'
      : `${categoryFilters.length} Categories`;

  const createActions = [
    {
      label: 'List an Item',
      testID: 'Feed.create.listing',
      icon: <Ionicons name="basket" size={32} illustrated />,
      onPress: () => navigation.navigate('CreateListing'),
    },
    {
      label: 'Ask for something',
      testID: 'Feed.create.request',
      icon: <Ionicons name="request-note" size={32} illustrated />,
      onPress: () => navigation.navigate('CreateRequest'),
    },
  ];

  const renderAuthor = item => {
    if (item.ownerMasked) return <TownIdentityPrompt compact onVerify={() => navigation.navigate('IdentityVerification', { source: 'town_browse' })} />;
    const author = item.user || {};
    const name = `${author.firstName || 'Neighbor'}${author.lastName ? ` ${author.lastName.charAt(0)}.` : ''}`;
    return (
      <View style={styles.tileFooterRow}>
        <ShimmerImage source={author.profilePhotoUrl ? { uri: author.profilePhotoUrl } : null} placeholderIcon="person" style={styles.sellerAvatar} />
        <View style={styles.authorNameAndBadge}>
          <Text style={styles.tileFooterText} numberOfLines={1}>{name}</Text>
          {author.isVerified === true && <VerifiedBadge size={16} interactive />}
        </View>
        <Text style={styles.tileTimeText}>{formatTimeAgo(item.createdAt)}</Text>
      </View>
    );
  };

  // Keep the discussion entry attached to its post without fetching every
  // thread during scrolling. Opening it uses the existing permission checks.
  const renderPublicReplies = item => !item.ownerMasked && !item.previewOnly && (
    <HapticPressable
      testID={`Feed.replies.${item.type}.${item.id}`}
      accessibilityLabel={`Comments on ${item.title}`}
      onPress={() => navigation.navigate('ListingDiscussion', item.type === 'request'
        ? { requestId: item.id }
        : { listingId: item.id })}
      scaleDown={0.99}
      style={styles.publicReplies}
    >
      <Ionicons name="chatbubbles-outline" size={20} color={COLORS.primary} />
      <Text style={styles.publicRepliesText}>Comments</Text>
      <Text style={styles.publicRepliesAction}>View</Text>
    </HapticPressable>
  );

  const renderListingItem = item => {
    const transfer = isTransferListing(item);
    const typeLabel = listingAvailability(item).label;

    return (
      <LayeredCard style={styles.tileShadow} radius={RADIUS.xl}>
        <View style={styles.tile}>
          <HapticPressable onPress={() => openFeedItem(item)} haptic="light" scaleDown={0.99} style={styles.tile} testID="FeedCard">
            <View style={styles.tileThumb}>
              <ShimmerImage source={item.photoUrl ? { uri: item.photoUrl } : null} style={styles.tileThumbImage} sharedTransitionTag={`listing-photo-${item.id}`} />
              {!item.ownerMasked && (
                <HapticPressable
                  testID={`Feed.save.${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={saved.status === 'error' ? `Retry saved status for ${item.title}` : saved.status === 'loading' ? `Checking saved status for ${item.title}` : `${saved.savedIds.has(item.id) ? 'Unsave' : 'Save'} ${item.title}`}
                  accessibilityState={{ selected: saved.status === 'ready' && saved.savedIds.has(item.id), disabled: saved.status === 'loading' || saved.pendingIds.has(item.id), busy: saved.status === 'loading' || saved.pendingIds.has(item.id) }}
                  disabled={saved.status === 'loading' || saved.pendingIds.has(item.id)}
                  onPress={event => { event?.stopPropagation?.(); saved.toggle(item.id); }}
                  style={styles.tileSaveButton}
                >
                  {saved.status === 'loading' || saved.pendingIds.has(item.id)
                    ? <ActivityIndicator size="small" color={COLORS.primary} />
                    : <Ionicons name={saved.status === 'error' ? 'refresh' : saved.savedIds.has(item.id) ? 'heart' : 'heart-outline'} size={24} illustrated={false} color={saved.status === 'ready' && saved.savedIds.has(item.id) ? COLORS.saved : COLORS.primary} />}
                </HapticPressable>
              )}
            </View>
            <View style={styles.tileContent}>
              <View style={styles.tileTopRow}>
                <View style={styles.tileTypePill}>
                  <Ionicons name={isSaleListing(item) ? 'pricetag' : transfer ? 'gift' : 'basket'} size={18} illustrated />
                  <Text style={styles.tilePillText}>{typeLabel}</Text>
                </View>
              </View>
              <ListingPrice listing={item} compact />
              <Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text>
              {renderAuthor(item)}
            </View>
          </HapticPressable>
          {renderPublicReplies(item)}
        </View>
      </LayeredCard>
    );
  };

  const renderRequestItem = (item, compact = false) => (
    <LayeredCard style={styles.tileShadow} radius={RADIUS.xl}>
      <View style={[styles.tile, styles.requestTile]}>
        <HapticPressable onPress={() => openFeedItem(item)} haptic="light" scaleDown={0.99} style={styles.tile} testID={`Feed.request.${item.id}`}>
          <View style={styles.tileContent}>
            <View style={styles.requestLabel}>
              <View style={styles.requestIcon}><Ionicons name={requestPresentation(item.requestType).icon} size={28} illustrated /></View>
              <Text style={styles.requestLabelText}>{requestPresentation(item.requestType).label}</Text>
            </View>
            <Text style={[styles.tileTitle, styles.requestTitle]} numberOfLines={2}>{item.title}</Text>
            {!!item.photoUrl && <ShimmerImage source={{ uri: item.photoUrl }} accessibilityLabel="Requested item photo" contentFit="contain" style={{ width: '100%', height: compact ? 96 : 180, borderRadius: RADIUS.md, marginBottom: SPACING.md }} />}
            {!!item.description && <Text style={styles.tileDesc} numberOfLines={2}>{item.description}</Text>}
            {renderAuthor(item)}
          </View>
        </HapticPressable>
        {renderPublicReplies(item)}
      </View>
    </LayeredCard>
  );

  const renderBanners = () => {
    const banner = banners[0];
    if (!banner) return null;
    return (
      <View style={[styles.bannerCard, { borderColor: banner.color }]}>
        <HapticPressable
          style={styles.bannerCardInner}
          onPress={banner.onPress}
          haptic="light"
          scaleDown={0.98}
        >
          <View style={[styles.bannerIcon, { backgroundColor: banner.color + '15' }]}>
            <Ionicons name={banner.icon} size={20} color={banner.color} />
          </View>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            <Text style={styles.bannerSubtitle}>{banner.subtitle}</Text>
          </View>
        </HapticPressable>
        <HapticPressable
          style={styles.bannerDismissBtn}
          onPress={() => dismissBanner(banner.key)}
          haptic="light"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={COLORS.textMuted} />
        </HapticPressable>
      </View>
    );
  };

  const carouselRequests = !search.trim() && activeFilters.length === 0
    ? [...requestCards, ...feed.filter(item => item.type === 'request')].filter((item,index,all) => all.findIndex(other => other.id === item.id) === index) : [];
  const verticalFeed = carouselRequests.length ? feed.filter(item => item.type !== 'request') : feed;
  const displayFeed = [
    ...(carouselRequests.length ? [{ id:'request-carousel', type:'request-carousel' }] : []),
    ...(banners.length && (feed.length || carouselRequests.length) ? [{ id:'banners',type:'feed-banners' }] : []),
    ...(carouselRequests.length && verticalFeed.length ? [{ id:'available-heading',type:'listing-heading' }] : []), ...verticalFeed,
  ];
  const renderItem = ({ item, index }) => {
    if (item.type === 'request-carousel') return <View style={{ marginBottom: SPACING.lg }}>
      <View style={{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:SPACING.sm }}>
        <Text style={{ ...TYPOGRAPHY.title3,color:COLORS.primary,fontWeight:'700' }}>Neighbors need</Text>
        <HapticPressable accessibilityRole="button" accessibilityLabel="See all requests" onPress={() => setActiveFilters(['requests'])} style={{ minHeight:44,justifyContent:'center' }}>
          <Text style={{ color:COLORS.primary }}>See all</Text>
        </HapticPressable>
      </View>
      <FlatList horizontal testID="Feed.requests.carousel" data={carouselRequests} keyExtractor={request => request.id}
        showsHorizontalScrollIndicator={false} snapToInterval={Math.min(width-64,360)+12} decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={{ itemVisiblePercentThreshold:50,minimumViewTime:800 }}
        renderItem={({item:request}) => <View style={{ width:Math.min(width-64,360),marginRight:12 }}>{renderRequestItem(request, true)}</View>} />
    </View>;
    if (item.type === 'feed-banners') return renderBanners();
    if (item.type === 'listing-heading') return <View style={{ borderTopWidth:1,borderTopColor:COLORS.borderBrown,paddingTop:SPACING.lg,marginBottom:SPACING.md }}>
      <Text accessibilityRole="header" style={{ ...TYPOGRAPHY.title3,color:COLORS.primary,fontWeight:'700' }}>Available nearby</Text>
    </View>;
    if (item.type === 'listing') {
      return renderListingItem(item, index);
    }
    return renderRequestItem(item, index);
  };

  if (isInitialLoad) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonContainer}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50, minimumViewTime: 800 }}
        ref={listRef}
        testID="Feed.list"
        data={displayFeed}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        bounces
        style={{ backgroundColor: FEED.bg }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <NativeHeader
            includeTopInset={false}
            title="Borrowhood"
            titleStyle={styles.feedTitle}
            rightElement={<HapticPressable onPress={() => setShowActionSheet(true)} haptic="light" testID="Feed.button.create" accessibilityLabel="Create a post" style={styles.addButton}>
              <Ionicons name="add" size={20} color={COLORS.surface} />
              <Text style={styles.addButtonText}>Post</Text>
            </HapticPressable>}
          >
            {(isFetching || feed.length > 0 || requestCards.length > 0 || hasFilters || feedError || !user?.city) && <>
              <View style={styles.searchRow}>
                <SearchBar value={search} onChangeText={setSearch} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} placeholder="What do you need?" onSubmitEditing={handleSearch} testID="Feed.searchBar" accessibilityLabel="Search items" style={styles.headerSearchBar} />
                <HapticPressable style={[styles.filtersButton, extraFilterCount > 0 && styles.filtersButtonActive]} onPress={() => setShowFiltersSheet(true)} testID="Feed.filters" accessibilityRole="button" accessibilityLabel="Filter posts" accessibilityValue={{ text: extraFilterCount ? `${extraFilterCount} filters selected` : 'Everyone, all categories' }}>
                  <Ionicons name="filter" size={22} illustrated={false} color={extraFilterCount ? COLORS.surface : COLORS.primary} />
                </HapticPressable>
              </View>
              <ScrollView horizontal style={styles.typeRibbon} contentContainerStyle={styles.typeRibbonContent} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.typeTabs} testID="Feed.typeRibbon" accessibilityRole="tablist" accessibilityLabel="Post type">
                  {FILTER_OPTIONS.map(option => {
                    const selected = option.key === 'all' ? activeFilters.length === 0 : activeFilters.includes(option.key);
                    return <HapticPressable key={option.key} testID={`Feed.type.${option.key}`} accessibilityRole="tab" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => setActiveFilters(option.key === 'all' ? [] : [option.key])} style={[styles.typeTab, selected && styles.typeTabActive]}>
                      <Text numberOfLines={1} style={[styles.typeTabText, selected && styles.typeTabTextActive]}>{option.label}</Text>
                    </HapticPressable>;
                  })}
                </View>
              </ScrollView>
            </>}
          </NativeHeader>
        }
        ListHeaderComponentStyle={{ marginHorizontal: -SPACING.lg }}
        stickyHeaderIndices={[0]}
        stickyHeaderHiddenOnScroll={!searchFocused}
        scrollEventThrottle={16}
        ListFooterComponent={
          isLoadingMore && (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          )
        }
        ListEmptyComponent={<View>{renderBanners()}{isFetching ? <ActivityIndicator style={{ padding: 40 }} color={COLORS.primary} accessibilityLabel="Loading items" /> : !feedError && !hasFilters && user?.city ? (
          <View style={styles.welcomeContainer}>
            <HeroIcon icon="home-outline" size={88} />
            <Text style={styles.emptyTitle}>What would you like to do?</Text>
            <Text style={styles.welcomeSubtitle}>No posts nearby yet. Start by sharing or asking.</Text>
            <View style={styles.welcomeActions}>
              <HapticPressable accessibilityRole="button" accessibilityLabel="List an item" style={styles.welcomeAction} onPress={() => navigation.navigate('CreateListing')}>
                <View style={styles.welcomeActionIcon}><Ionicons name="basket" size={36} color={COLORS.primary} /></View>
                <View style={{ flex: 1 }}><Text style={styles.welcomeActionTitle}>List an item</Text><Text style={styles.welcomeActionNote}>Share an item or service.</Text></View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
              </HapticPressable>
              <HapticPressable accessibilityRole="button" accessibilityLabel="Ask for something" style={[styles.welcomeAction, styles.welcomeRequest]} onPress={() => navigation.navigate('CreateRequest')}>
                <View style={styles.welcomeActionIcon}><Ionicons name="create-outline" size={36} color={COLORS.primary} /></View>
                <View style={{ flex: 1 }}><Text style={styles.welcomeActionTitle}>Ask for something</Text><Text style={styles.welcomeActionNote}>Let neighbors know what you need.</Text></View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
              </HapticPressable>
            </View>
            <Text style={styles.welcomePrivacy}>You choose who sees each post.</Text>
          </View>
        ) :
          <View style={styles.emptyContainer}>
            <HeroIcon icon={feedError ? 'cloud-offline-outline' : hasFilters ? 'search-outline' : user?.city ? 'basket' : 'location-outline'} size={72} />
            <Text style={styles.emptyTitle}>{feedError ? 'Couldn’t load nearby items' : hasFilters ? 'No matching items yet' : user?.city ? 'Ask your town for what you need' : 'Choose your town'}</Text>
            <Text style={styles.emptySubtitle}>{feedError ? 'Check your connection and try again.' : hasFilters ? 'Try fewer filters, or ask your neighbors for what you need.' : user?.city ? 'Post a request. Owners can privately offer an item without exposing their belongings.' : 'Add your town to discover items nearby.'}</Text>
            <HapticPressable style={styles.emptyButton} accessibilityRole="button" onPress={() => {
              if (feedError) return fetchFeed(1, false);
              if (!user?.city) return navigation.navigate('EditProfile');
              if (hasFilters) {
                setSearch(''); setActiveFilters([]); setVisibilityFilters([]); setCategoryFilters([]);
                return fetchFeed(1, false, true);
              }
              navigation.navigate('CreateRequest');
            }}>
              <Text style={styles.emptyButtonText}>{feedError ? 'Try again' : !user?.city ? 'Choose town' : hasFilters ? 'Clear search and filters' : 'Ask my town'}</Text>
            </HapticPressable>
            {!feedError && user?.city && <HapticPressable accessibilityRole="button" style={{ minHeight: 48, padding: 14, justifyContent: 'center' }} onPress={() => hasFilters ? navigation.navigate('CreateRequest', { initialTitle: search.trim() }) : navigation.navigate('Friends')}>
              <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: '600' }}>{hasFilters ? 'Request an item' : 'Invite a neighbor'}</Text>
            </HapticPressable>}
          </View>
        }</View>}
      />

      <ActionSheet
        isVisible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        title="Create"
        actions={createActions}
      />


      <ActionSheet
        isVisible={showFiltersSheet}
        onClose={() => setShowFiltersSheet(false)}
        title="Filter posts"
        actions={[
          { label: `Visibility · ${visibilityChipLabel}`, accessibilityLabel: 'Filter by visibility', icon: <Ionicons name="people-outline" size={22} />, onPress: () => setActiveDropdown('visibility') },
          ...(categories.length ? [{ label: `Category · ${categoryChipLabel}`, accessibilityLabel: 'Filter by category', icon: <Ionicons name="pricetag-outline" size={22} />, onPress: () => setActiveDropdown('category') }] : []),
          ...(extraFilterCount ? [{ label: 'Clear filters', onPress: () => { setVisibilityFilters([]); setCategoryFilters([]); } }] : []),
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
              : <CategoryIcon icon={cat.icon || 'pricetag-outline'} size={26} />,
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
        title="I Can Help"
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
            label: 'Offer an item',
            icon: <Ionicons name="add-circle-outline" size={20} color={COLORS.text} />,
            onPress: () => {
              const req = selectedRequest;
              setSelectedRequest(null);
              navigation.navigate('OfferItem', { request: req });
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
                Verified members can see requests and items explicitly shared in {user?.city || 'your town'}.
              </Text>
              <View style={styles.upgradeFeatures}>
                <View style={styles.upgradeFeature}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
                  <Text style={styles.upgradeFeatureText}>Everything in Free</Text>
                </View>
                <View style={styles.upgradeFeature}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
                  <Text style={styles.upgradeFeatureText}>Ask your town without sharing your inventory</Text>
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
  addButtonText: { ...TYPOGRAPHY.footnote, color: COLORS.surface, fontWeight: '700' },
  feedTitle: { fontSize: 28, lineHeight: 36 },
  typeRibbon: { flexGrow: 0, flexShrink: 0 },
  typeRibbonContent: { flexGrow: 1 },
  typeTabs: { flexGrow: 1, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.separator },
  typeTab: { minHeight: 44, minWidth: 44, flexShrink: 0, paddingHorizontal: SPACING.xs, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  typeTabActive: { borderBottomColor: COLORS.primary },
  typeTabText: { ...TYPOGRAPHY.footnote, fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  typeTabTextActive: { color: COLORS.primary },
  sellerAvatar: { width: 28, height: 28, borderRadius: RADIUS.full },
  requestIcon: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  requestTitle: { fontSize: 22, lineHeight: 29 },
  availabilityText: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, marginLeft: 'auto' },
  publicReplies: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 44, marginHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator },
  publicRepliesText: { ...TYPOGRAPHY.footnote, fontWeight: '600', flex: 1, color: COLORS.primary },
  publicRepliesAction: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  container: {
    flex: 1,
    backgroundColor: FEED.bg,
  },
  skeletonContainer: {
    padding: SPACING.lg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  headerSearchBar: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 0, borderRadius: RADIUS.md,
  },
  filtersButton: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  filtersButtonActive: { backgroundColor: COLORS.primary },
  addButton: {
    flexDirection: 'row', gap: SPACING.xs, paddingHorizontal: SPACING.md, minHeight: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  filtersSection: {
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
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
  bannerCard: {
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    height: 60,
  },
  bannerCardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    paddingRight: 36,
    gap: SPACING.md,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.text,
  },
  bannerSubtitle: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  bannerDismissBtn: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: SPACING.lg, paddingTop: 0, paddingBottom: 120, width: '100%', maxWidth: 660, alignSelf: 'center',
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  tileShadow: {
    marginBottom: SPACING.xxl,
  },
  tile: {
    borderRadius: RADIUS.xl, overflow: 'hidden', borderWidth: 0, backgroundColor: FEED.card,
  },
  requestTile: {
    backgroundColor: FEED.card,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  requestTopRow: {
    flexWrap: 'wrap',
    columnGap: SPACING.md,
    rowGap: SPACING.xs,
  },
  requestLabel: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  requestLabelText: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
    flexShrink: 1,
  },
  tileRow: {
    flexDirection: 'column',
  },
  tileThumb: {
    alignSelf: 'stretch', margin: SPACING.sm, marginBottom: 0, aspectRatio: 1.45, alignItems: 'center', justifyContent: 'center', position: 'relative', borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.surfaceElevated,
  },
  tileThumbImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  tileSaveButton: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm, width: 44, height: 44, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, ...SHADOWS.sm,
  },
  tileLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tilePricePill: {
    position: 'absolute',
    bottom: SPACING.sm,
    left: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  tilePillText: {
    ...TYPOGRAPHY.caption1, fontWeight: '600', color: COLORS.primary,
  },
  tileContent: {
    padding: SPACING.lg, paddingBottom: SPACING.sm,
  },
  tileTopRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  tileTypeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tilePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  tileTypePill: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, backgroundColor: COLORS.primaryMuted, borderRadius: RADIUS.full,
  },
  tileTypeLabelText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tileTimeText: {
    ...TYPOGRAPHY.caption1, color: COLORS.textMuted, marginLeft: 'auto',
  },
  tileTitle: {
    ...TYPOGRAPHY.headline, fontSize: 20, lineHeight: 26, color: COLORS.text, marginTop: SPACING.xs,
  },
  tileDesc: {
    ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 22,
  },
  tileFooterRow: {
    marginTop: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 32,
  },
  authorNameAndBadge: {
    flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 2,
  },
  tileFooterText: {
    ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flexShrink: 1,
  },
  tilePrice: {
    ...TYPOGRAPHY.headline,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  card: {
    marginBottom: SPACING.lg,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderGreen,
    ...SHADOWS.md,
  },
  cardGiveaway: {
    borderColor: COLORS.borderBrown,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.primaryMuted,
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
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 2,
    borderColor: COLORS.borderGreen,
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
    color: COLORS.primary,
  },
  timeAgo: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
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
    borderColor: COLORS.borderGreen,
  },
  requestCard: {
    marginBottom: SPACING.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(212, 160, 60, 0.08)',
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
    borderTopLeftRadius: 12.5,
    borderTopRightRadius: 12.5,
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
  requestThreadDivider: {
    height: 1,
    backgroundColor: COLORS.separator,
    marginBottom: SPACING.md,
  },
  requestThreadAvatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: COLORS.gray[700],
  },
  requestThreadBody: {
    flex: 1,
  },
  requestThreadAuthor: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '700',
    color: COLORS.text,
  },
  requestThreadText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: 2,
  },
  requestThreadLinkText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.primary,
  },
  threadContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingTop: SPACING.sm,
    backgroundColor: FEED.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: FEED.cardBorder,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  requestThread: {
    backgroundColor: COLORS.requestSurface,
    borderTopColor: COLORS.borderGreen,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  threadHeaderExpanded: {
    marginBottom: SPACING.md,
  },
  threadHeaderText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  threadPost: {
    marginBottom: SPACING.sm,
    backgroundColor: FEED.thread,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  threadPostRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  threadPostActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  threadReplyBtn: {
    paddingVertical: 2,
  },
  threadReplyBtnText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  threadReply: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginLeft: 36,
    marginTop: SPACING.sm,
    backgroundColor: FEED.threadDeep,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  threadReplyAvatar: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: COLORS.gray[700],
  },
  threadReplyBody: {
    flex: 1,
  },
  threadReplyAuthor: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '700',
    color: COLORS.text,
  },
  threadReplyText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  threadViewAll: {
    marginBottom: SPACING.md,
  },
  threadReplyingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryMuted,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  threadReplyingText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.primary,
  },
  threadInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  threadInput: {
    flex: 1,
    backgroundColor: FEED.thread,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: FEED.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.caption1,
    color: COLORS.text,
  },
  threadSendBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadSendBtnDisabled: {
    backgroundColor: COLORS.gray[700],
  },
  threadDmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  threadDmText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.primary,
  },
  typeBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
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
  ribbon: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  ribbonGiveaway: {
    backgroundColor: COLORS.accent,
  },
  ribbonFreeBorrow: {
    backgroundColor: COLORS.primary,
  },
  ribbonPaid: {
    backgroundColor: COLORS.primary,
  },
  ribbonText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  cardBody: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
    backgroundColor: COLORS.primaryMuted,
  },
  cardTitle: {
    ...TYPOGRAPHY.h3,
    fontWeight: '700',
    color: COLORS.primary,
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
    borderWidth: 1,
    borderColor: COLORS.borderGreen,
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
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
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
    backgroundColor: COLORS.separator,
  },
  actionText: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.primary,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    textAlign: 'center',
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
  welcomeContainer: { alignItems: 'center', paddingTop: SPACING.xl, paddingBottom: SPACING.xxl },
  welcomeSubtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, paddingHorizontal: SPACING.lg },
  welcomeActions: { alignSelf: 'stretch', marginTop: SPACING.xl, gap: SPACING.md },
  welcomeAction: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary + '80', borderRadius: RADIUS.lg, minHeight: 92 },
  welcomeRequest: { backgroundColor: COLORS.requestSurface },
  welcomeActionIcon: { width: 44, alignItems: 'center' },
  welcomeActionTitle: { ...TYPOGRAPHY.headline, color: COLORS.text },
  welcomeActionNote: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: SPACING.xs },
  welcomePrivacy: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: SPACING.lg, textAlign: 'center' },
});
