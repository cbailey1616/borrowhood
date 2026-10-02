import useReduceMotion from '../hooks/useReduceMotion';
import { listingIcon } from '../utils/listingPresentation';
import RequestTypeIcon from '../components/RequestTypeIcon';
import { listingAvailability } from '../utils/listingAvailability';
import ActionButton from '../components/ActionButton';
import { requestPresentation } from '../utils/requestPresentation';
import TownIdentityPrompt from '../components/TownIdentityPrompt';
import ListingOffer from '../components/ListingOffer';
import LayeredCard from '../components/LayeredCard';
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { FeedSeenContext } from '../hooks/useInboxBadges';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { randomUUID } from 'expo-crypto';
import { Image } from 'expo-image';
import FeedWoodlandBackdrop from '../components/FeedWoodlandBackdrop';
import FeedHeaderTextFade from '../components/FeedHeaderTextFade';
import BorrowhoodRefreshList from '../components/BorrowhoodRefreshList';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Animated,
  ActivityIndicator,
  AppState,
  InteractionManager,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import CategoryIcon from '../components/CategoryIcon';
import VerifiedBadge from '../components/VerifiedBadge';
import NeighborRankBadge from '../components/NeighborRankBadge';
import RankInfoSheet from '../components/RankInfoSheet';
import { memberReputation } from '../utils/reputation';
import { nextHomeAction } from '../utils/homeAction';
import { trackedExchanges } from '../utils/exchangeTracking';
import ExchangeOverviewLink from '../components/ExchangeOverviewLink';
import useSavedListings from '../hooks/useSavedListings';
import useFeedHeader from '../hooks/useFeedHeader';
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
import { CARD_SURFACE, COLORS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '../utils/config';
import { checkPremiumGate } from '../utils/premiumGate';
import { ENABLE_PAID_TIERS } from '../utils/config';


const FILTER_OPTIONS = [
  { key: 'all', label: 'All', icon: 'grid' },
  { key: 'listings', label: 'Borrow', icon: listingIcon() },
  { key: 'giveaway', label: 'Giveaways', icon: listingIcon({ listingType: 'giveaway' }) },
  { key: 'sell', label: 'For sale', icon: 'money-bag' },
  { key: 'requests', label: 'Wanted', icon: requestPresentation().icon },
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

// Older servers may still include the viewer's posts or unavailable items.
const visibleOnHome = (item, userId) => {
  const authorId = item.user?.id ?? item.owner?.id ?? item.requester?.id ?? item.ownerId ?? item.userId;
  return !(userId && authorId === userId) && (item.type !== 'listing' || listingAvailability(item).available);
};

export default function FeedScreen({ navigation, route }) {
  const reduceMotion = useReduceMotion();
  const markFeedSeen = useContext(FeedSeenContext);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const { user, refreshUser, isGracePeriodActive, feedWoodlandScene = 0 } = useAuth();
  const { showToast, showError } = useError();
  const saved = useSavedListings(navigation, user?.id, { showToast, showError });
  const [feed, setFeed] = useState([]);
  const [requestCards, setRequestCards] = useState([]);
  const { width, fontScale } = useWindowDimensions();
  const columns = width >= 768 && fontScale < 1.5 ? (width >= 1200 ? 3 : 2) : 1;
  const feedWidth = Math.min(width, columns > 1 ? 1440 : 660);
  const tileWidth = (feedWidth - SPACING.lg * 2 - SPACING.lg * (columns - 1)) / columns;
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const feedHeader = useFeedHeader({ pinned: searchFocused || reduceMotion, columns });
  const [activeFilters, setActiveFilters] = useState([]);
  const consumedBrowse = useRef(route?.params?.browseItems);
  const [neighborhood, setNeighborhood] = useState(route?.params?.neighborhoodItems || null);
  const consumedNeighborhood = useRef(null);
  const [visibilityFilters, setVisibilityFilters] = useState(route?.params?.neighborhoodItems ? ['neighborhood'] : []);
  const [categories, setCategories] = useState([]);
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [activeDisputes, setActiveDisputes] = useState([]);
  const [activeExchanges, setActiveExchanges] = useState([]);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedRank, setSelectedRank] = useState(null);
  const listRef = useRef(null);
  const [focusedItemId, setFocusedItemId] = useState(null);


  const [feedError, setFeedError] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const feedRequest = useRef(0);
  const feedInFlight = useRef(false);
  const previousSearch = useRef(search);
  const filtersInitialized = useRef(false);
  const feedSession = useRef(null);
  const impressions = useRef(new Set());
  // Explicit browsing opens the default All feed even if Home last showed Wanted.
  // Consume each request once; ordinary returns preserve feed order and position.
  useLayoutEffect(() => {
    const request = route?.params?.browseItems;
    if (!request || request === consumedBrowse.current) return;
    consumedBrowse.current = request;
    feedRequest.current += 1;
    setFeed([]); setRequestCards([]);
    setActiveFilters([]);
    setNeighborhood(null);
    setVisibilityFilters([]); setCategoryFilters([]);
    previousSearch.current = ''; setSearch('');
    setShowFiltersSheet(false); setActiveDropdown(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [route?.params?.browseItems]);

  useLayoutEffect(() => {
    const selection = route?.params?.neighborhoodItems;
    if (!selection?.id || selection.requestId === consumedNeighborhood.current) return;
    consumedNeighborhood.current = selection.requestId;
    feedRequest.current += 1;
    setFeed([]); setRequestCards([]);
    setNeighborhood(selection);
    setActiveFilters([]); setVisibilityFilters(['neighborhood']); setCategoryFilters([]);
    previousSearch.current = ''; setSearch('');
    setShowFiltersSheet(false); setActiveDropdown(null);
    navigation.setParams?.({ neighborhoodItems: undefined, browseItems: undefined });
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [route?.params?.neighborhoodItems, navigation]);

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
  const hasFilters = !!neighborhood || !!search.trim() || activeFilters.length > 0 || visibilityFilters.length > 0 || categoryFilters.length > 0;
  const extraFilterCount = visibilityFilters.length + categoryFilters.length;
  const fetchFeed = useCallback(async (pageNum = 1, append = false, clear = false, { resetScroll = true } = {}) => {
    if (append && feedInFlight.current) return;
    feedInFlight.current = true;
    const requestId = ++feedRequest.current;
    setIsFetching(true);
    setIsLoadingMore(append);
    try {
      if (pageNum === 1 || !feedSession.current) { feedSession.current = randomUUID(); impressions.current.clear(); }
      const params = { layout: 'sections', page: pageNum, limit: 20, session: feedSession.current };
      if (!clear && search.trim()) params.search = search.trim();
      if (!clear && activeFilters.length > 0) params.type = activeFilters.join(',');
      if (!clear && neighborhood) {
        params.communityId = neighborhood.id;
        if (!params.type) params.type = 'listings,giveaway,sell';
      }
      if (!clear && visibilityFilters.length > 0) params.visibility = visibilityFilters.join(',');
      if (!clear && categoryFilters.length > 0) params.categoryId = categoryFilters.join(',');

      let data, nextItems, resolvedPage = pageNum;
      let nextRequests = [];
      // Consume empty/hidden pages from older servers, with a bounded retry.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        data = await api.getFeed({ ...params, page: resolvedPage });
        if (requestId !== feedRequest.current) return;
        if (data.requests) nextRequests = data.requests;
        nextItems = (data.items || []).filter(item => visibleOnHome(item, user?.id));
        resolvedPage = Math.max(resolvedPage, Number(data.page) || resolvedPage);
        if (nextItems.length || !data.hasMore || attempt === 2) break;
        resolvedPage += 1;
      }

      if (!append) {
        // A fresh session replaces a paginated list. Reset its offset before
        // shortening it, except during native pull-to-refresh: the list is
        // already at the top and must finish its own settling animation.
        if (resetScroll) listRef.current?.scrollToOffset({ offset: 0, animated: false });
        setRequestCards(nextRequests.filter(item => visibleOnHome(item, user?.id)));
      }
      if (append) {
        setFeed(prev => [...prev, ...nextItems.filter(item => !prev.some(existing => existing.id === item.id && existing.type === item.type))]);
      } else {
        setFeed(nextItems);
      }
      setHasMore(!!data.hasMore);
      setFeedError(false);
      setPage(resolvedPage);
      if (pageNum === 1 && !params.search && !params.type && !params.visibility && !params.categoryId && !params.communityId &&
          navigation.isFocused?.() && (AppState.currentState == null || AppState.currentState === 'active')) {
        markFeedSeen(data.latestPostAt);
      }
    } catch (error) {
      if (requestId !== feedRequest.current) return;
      setFeedError(error.status === 409 ? 'refresh' : true);
      // Keep the current feed visible when a requested refresh fails.
    } finally {
      if (requestId !== feedRequest.current) return;
      feedInFlight.current = false;
      setIsFetching(false);
      setIsInitialLoad(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [search, activeFilters, visibilityFilters, categoryFilters, neighborhood, navigation, markFeedSeen, user?.id]);



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
    fetchActiveDisputes();
    fetchBannerData();
  }, []);

  useEffect(() => {
    // The mount effect owns the first request. Later filter changes must fetch
    // even if an older initial request is still pending or has been superseded.
    if (!filtersInitialized.current) { filtersInitialized.current = true; return; }
    fetchFeed(1, false);
  }, [activeFilters, visibilityFilters, categoryFilters, neighborhood]);

  useEffect(() => {
    if (previousSearch.current === search) return;
    previousSearch.current = search;
    const timer = setTimeout(() => fetchFeed(1, false), 350);
    return () => clearTimeout(timer);
  }, [search]);

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

  const fetchBannerData = useCallback(async () => {
    try {
      const data = await api.getTransactions();
      setActiveExchanges(data?.transactions || data || []);
    } catch (_) {
      // Retain the last confirmed action while offline.
    }
  }, [user?.id]);

  useEffect(() => {
    let pending;
    const unsubscribe = navigation.addListener('focus', () => {
      if (isInitialLoad) return;
      // Returning from a post keeps the loaded pages, ranking session, and
      // scroll position. Only the independent account/exchange notices refresh.
      pending?.cancel?.();
      pending = InteractionManager.runAfterInteractions(() => {
        fetchActiveDisputes();
        fetchBannerData();
      });
    });
    return () => { unsubscribe(); pending?.cancel?.(); };
  }, [navigation, isInitialLoad, fetchActiveDisputes, fetchBannerData]);

  useEffect(() => {
    const refreshVisibleStatus = () => {
      if (!navigation.isFocused?.()) return;
      fetchActiveDisputes();
      fetchBannerData();
    };
    // The Home dot announces new posts; they enter this feed on manual refresh.
    const received = Notifications.addNotificationReceivedListener(refreshVisibleStatus);
    let previousState = AppState.currentState;
    const resumed = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && previousState !== 'active') refreshVisibleStatus();
      previousState = nextState;
    });
    return () => { received.remove(); resumed.remove(); };
  }, [navigation, fetchBannerData, fetchActiveDisputes]);

  useEffect(() => navigation.addListener('tabPress', () => {
    if (!navigation.isFocused?.()) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
    fetchActiveDisputes();
    fetchBannerData();
  }), [navigation, fetchBannerData, fetchActiveDisputes, reduceMotion]);

  const onRefresh = () => {
    setIsRefreshing(true);
    saved.refresh();
    fetchFeed(1, false, false, { resetScroll: false });
    refreshUser(); // Refresh user data on manual pull-to-refresh
    fetchActiveDisputes();
    fetchBannerData();
  };

  const homeAction = nextHomeAction(activeExchanges, activeDisputes, user?.id);
  const exchanges = trackedExchanges(activeExchanges, user?.id, new Date(), activeDisputes);

  const onEndReached = () => {
    if (!feedInFlight.current && !feedError && hasMore) {
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
    setNeighborhood(null);
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
    ? 'All'
    : categoryFilters.length === 1
      ? categories.find(c => c.id === categoryFilters[0])?.name || 'Category'
      : `${categoryFilters.length} Categories`;

  const createActions = [
    {
      label: 'List an Item',
      testID: 'Feed.create.listing',
      icon: <Ionicons name="basket" size={22}  />,
      onPress: () => navigation.navigate('CreateListing'),
    },
    {
      label: 'Post in Wanted',
      testID: 'Feed.create.request',
      icon: <Ionicons name="request-note" size={22}  />,
      onPress: () => navigation.navigate('CreateRequest'),
    },
  ];

  const renderAuthor = (item, { compact = false, showTime = true } = {}) => {
    if (item.ownerMasked) return <TownIdentityPrompt compact onVerify={() => navigation.navigate('IdentityVerification', { source: 'town_browse' })} />;
    const author = item.user || {};
    const reputation = item.previewOnly ? null : memberReputation(author);
    const name = `${author.firstName || 'Neighbor'}${author.lastName ? ` ${author.lastName.charAt(0)}.` : ''}`;
    return (
      <View style={[styles.tileFooterRow, compact && styles.ribbonAuthor]}>
        <ShimmerImage source={author.profilePhotoUrl ? { uri: author.profilePhotoUrl } : null} placeholderIcon="person" style={styles.sellerAvatar} />
        <View style={styles.authorNameAndBadge}>
          <Text style={styles.tileFooterText} numberOfLines={1}>{name}</Text>
          {author.isVerified === true && <VerifiedBadge size={16} interactive />}
          <NeighborRankBadge rank={reputation?.rank} onPress={() => setSelectedRank(reputation)} />
        </View>
        {showTime && <Text maxFontSizeMultiplier={1.4} style={styles.tileTimeText}>{formatTimeAgo(item.createdAt)}</Text>}
      </View>
    );
  };

  // Keep the discussion entry attached to its post without fetching every
  // thread during scrolling. Opening it uses the existing permission checks.
  const renderPublicReplies = (item, { compact = false } = {}) => !item.ownerMasked && !item.previewOnly && (
    <HapticPressable
      testID={`Feed.replies.${item.type}.${item.id}`}
      accessibilityLabel={`Comments on ${item.title}`}
      onPress={() => navigation.navigate('ListingDiscussion', item.type === 'request'
        ? { requestId: item.id }
        : { listingId: item.id })}
      scaleDown={1}
      style={[styles.publicReplies, compact && styles.ribbonReplies]}
    >
      <Ionicons name="chatbubbles-outline" size={20} color={COLORS.primary} />
      <Text maxFontSizeMultiplier={1.4} style={[styles.publicRepliesText, compact && styles.ribbonRepliesText]}>
        {Number.isInteger(item.commentCount) ? `${item.commentCount} ${item.commentCount === 1 ? 'comment' : 'comments'}` : 'Comments'}
      </Text>
      {!compact && <Text maxFontSizeMultiplier={1.4} style={styles.publicRepliesAction}>View</Text>}
    </HapticPressable>
  );

  const renderListingItem = item => {
    return (
      <LayeredCard style={styles.tileShadow} radius={RADIUS.xl}>
        <View style={styles.tile}>
          <HapticPressable onPress={() => openFeedItem(item)} haptic={null} scaleDown={item.photoUrl ? 0.97 : 1} style={styles.tile} testID="FeedCard">
            <View style={styles.tilePhotoFrame}>
              <View style={styles.tileThumb}>
                <ShimmerImage category={item.category} title={item.title} source={item.photoUrl ? { uri: item.photoUrl } : null} placeholderIcon={listingIcon(item)} style={styles.tileThumbImage} sharedTransitionTag={`listing-photo-${item.id}`} />
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
                      ? <ActivityIndicator size="small" color={COLORS.spinner} />
                      : <Ionicons name={saved.status === 'error' ? 'refresh' : saved.savedIds.has(item.id) ? 'heart' : 'heart-outline'} size={24} illustrated={false} color={saved.status === 'ready' && saved.savedIds.has(item.id) ? COLORS.saved : COLORS.primary} />}
                  </HapticPressable>
                )}
              </View>
            </View>
            <View style={styles.tileContent}>
              <ListingOffer listing={item} />
              <Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text>
              {renderAuthor(item)}
            </View>
          </HapticPressable>
          {renderPublicReplies(item)}
        </View>
      </LayeredCard>
    );
  };

  const renderRibbonRequest = item => (
    <LayeredCard radius={RADIUS.xl} style={{ marginBottom: SPACING.sm }}>
      <View style={[styles.tile, styles.requestTile, { height: 152 * Math.max(1, fontScale || 1) }]} testID={`Feed.ribbon.card.${item.id}`}>
        <HapticPressable onPress={() => openFeedItem(item)} haptic={null} scaleDown={item.photoUrl ? 0.97 : 1}
          style={[styles.tile, styles.ribbonContent]} testID={`Feed.request.${item.id}`}>
          <View style={styles.ribbonCopy}>
            <View style={styles.ribbonLabel}>
              <RequestTypeIcon type={item.requestType} />
              <Text maxFontSizeMultiplier={1.4} style={styles.ribbonLabelText}>{requestPresentation(item.requestType).label}</Text>
              <Text maxFontSizeMultiplier={1.4} style={styles.tileTimeText}>{formatTimeAgo(item.createdAt)}</Text>
            </View>
            <Text maxFontSizeMultiplier={1.4} style={styles.ribbonTitle} numberOfLines={2}>{item.title}</Text>
          </View>
          {!!item.photoUrl && <ShimmerImage category={item.category} title={item.title} source={{ uri: item.photoUrl }} accessibilityLabel="Wanted item photo"
            contentFit="cover" style={styles.ribbonPhoto} />}
        </HapticPressable>
        <View style={styles.ribbonFooter}>
          <HapticPressable onPress={() => openFeedItem(item)} haptic={null} scaleDown={1}
            style={styles.ribbonAuthorButton} accessibilityLabel={`View wanted post: ${item.title}`}>
            {renderAuthor(item, { compact: true, showTime: false })}
          </HapticPressable>
          {renderPublicReplies(item, { compact: true })}
        </View>
      </View>
    </LayeredCard>
  );

  const renderRequestItem = item => (
    <LayeredCard style={styles.tileShadow} radius={RADIUS.xl}>
      <View style={[styles.tile, styles.requestTile]}>
        <HapticPressable onPress={() => openFeedItem(item)} haptic={null} scaleDown={item.photoUrl ? 0.97 : 1} style={styles.tile} testID={`Feed.request.${item.id}`}>
          <View style={styles.tileContent}>
            <View style={styles.requestLabel}>
              <View style={styles.requestIcon}><RequestTypeIcon type={item.requestType} size={28} /></View>
              <Text maxFontSizeMultiplier={1.4} style={styles.requestLabelText}>{requestPresentation(item.requestType).label}</Text>
            </View>
            <Text style={[styles.tileTitle, styles.requestTitle]} numberOfLines={2}>{item.title}</Text>
            {!!item.photoUrl && <ShimmerImage category={item.category} title={item.title} source={{ uri: item.photoUrl }} accessibilityLabel="Wanted item photo" contentFit="contain" style={{ width: '100%', height: 180, borderRadius: RADIUS.md, marginBottom: SPACING.md }} />}
            {!!item.description && <Text style={styles.tileDesc} numberOfLines={2}>{item.description}</Text>}
            {renderAuthor(item)}
          </View>
        </HapticPressable>
        {renderPublicReplies(item)}
      </View>
    </LayeredCard>
  );

  const renderBanners = () => homeAction || exchanges.length ? (
    <View>
      <ExchangeOverviewLink testID="Feed.exchanges.overview" count={exchanges.length || undefined}
        needsYou={exchanges.filter(exchange => exchange.section === 'needs-you').length}
        onPress={() => navigation.navigate('Exchanges')} />
      {!!homeAction && <LayeredCard style={{ marginBottom: SPACING.md }}>
        <HapticPressable pressedBackgroundColor={COLORS.cardHover} testID="Feed.exchanges" accessibilityRole="button"
          accessibilityLabel={`${homeAction.title}. ${homeAction.label}`}
          onPress={() => navigation.navigate(homeAction.destination.name, homeAction.destination.params)}
          style={styles.exchangeCard}>
          <Ionicons name={homeAction.icon} size={22}  color={COLORS.primary} />
          <View style={styles.exchangeContent}>
            <Text style={styles.exchangeSummary}>{homeAction.title}</Text>
            <Text maxFontSizeMultiplier={1.4} style={styles.exchangeActionText}>{homeAction.label}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
        </HapticPressable>
      </LayeredCard>}
    </View>
  ) : null;

  const carouselRequests = !search.trim() && activeFilters.length === 0
    ? [...requestCards, ...feed.filter(item => item.type === 'request')].filter((item,index,all) => all.findIndex(other => other.id === item.id) === index) : [];
  const availableFeed = feed.filter(item => item.type !== 'listing' || listingAvailability(item).available);
  const verticalFeed = carouselRequests.length ? availableFeed.filter(item => item.type !== 'request') : availableFeed;
  const displayFeed = [
    ...((homeAction || exchanges.length) && (feed.length || carouselRequests.length) ? [{ id:'banners',type:'feed-banners' }] : []),
    ...(carouselRequests.length ? [{ id:'request-carousel', type:'request-carousel' }] : []),
    ...(carouselRequests.length && verticalFeed.length ? [{ id:'available-heading',type:'listing-heading' }] : []), ...verticalFeed,
  ];
  const renderItem = ({ item, index }) => {
    if (item.type === 'request-carousel') return <View style={{ marginBottom: SPACING.lg }}>
      <View style={{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:SPACING.sm }}>
        <Text accessibilityRole="header" style={{ ...TYPOGRAPHY.title3,color:COLORS.primary,fontWeight:'600' }}>Neighbors are looking for</Text>
      </View>
      <FlatList horizontal testID="Feed.requests.carousel" data={carouselRequests} keyExtractor={request => request.id}
        showsHorizontalScrollIndicator={false} snapToInterval={Math.min(width-64,360)+12} decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={{ itemVisiblePercentThreshold:50,minimumViewTime:800 }}
        renderItem={({item:request}) => <View style={{ width:Math.min(width-64,360),marginRight:12 }}>{renderRibbonRequest(request)}</View>} />
    </View>;
    if (item.type === 'feed-banners') return renderBanners();
    if (item.type === 'listing-heading') return <View style={{ borderTopWidth:1,borderTopColor:COLORS.borderBrown,paddingTop:SPACING.lg,marginBottom:SPACING.md }}>
      <Text accessibilityRole="header" style={{ ...TYPOGRAPHY.title3,color:COLORS.primary,fontWeight:'600' }}>Available nearby</Text>
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
    <View style={[styles.container, { paddingBottom: tabBarHeight }]}>
      <View style={styles.feedViewport}>
        <Animated.View testID="Feed.header" onLayout={feedHeader.onLayout}
          style={[styles.feedHeader, { width: feedWidth, left: (width - feedWidth) / 2 }, feedHeader.style]}>
          <FeedWoodlandBackdrop width={feedWidth} sceneIndex={feedWoodlandScene} height={192 + insets.top} topOffset={-28} />
          <FeedHeaderTextFade width={feedWidth} topOffset={insets.top} />
          <NativeHeader
            includeTopInset={false}
            title="Borrowhood"
            style={[styles.feedHeaderSurface, { paddingTop: insets.top + SPACING.sm }, width < 375 && styles.feedHeaderSurfaceCompact]}
            titleStyle={[styles.feedTitle, width < 375 && styles.feedTitleCompact]}
            titleRowStyle={styles.feedTitleRow}
            leftElement={<Image source={require('../../assets/logo.png')} contentFit="contain" transition={0}
              style={styles.brandMark} accessible={false} />}
            rightElement={<HapticPressable scaleDown={0.97} onPress={() => setShowActionSheet(true)} haptic={null} testID="Feed.button.create" accessibilityLabel="Create a post" style={styles.addButton}>
              <Ionicons name="add" size={18} color={COLORS.surface} />
              <Text maxFontSizeMultiplier={1.4} style={styles.addButtonText}>Post</Text>
            </HapticPressable>}
          >
            {(feed.length > 0 || requestCards.length > 0 || hasFilters || feedError || !user?.city) && <>
              <View style={styles.searchRow}>
                <SearchBar value={search} onChangeText={setSearch} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} placeholder="What do you need?" onSubmitEditing={handleSearch} testID="Feed.searchBar" accessibilityLabel="Search items" style={styles.headerSearchBar} />
                <HapticPressable haptic="selection" style={[styles.filtersButton, extraFilterCount > 0 && styles.filtersButtonActive]} onPress={() => setShowFiltersSheet(true)} testID="Feed.filters" accessibilityRole="button" accessibilityLabel="Filter posts" accessibilityValue={{ text: extraFilterCount ? `${extraFilterCount} filters selected` : 'Everyone, all categories' }}>
                  <Ionicons name="filter" size={22} illustrated={false} color={extraFilterCount ? COLORS.surface : COLORS.primary} />
                </HapticPressable>
              </View>
              {!!neighborhood && <HapticPressable haptic="selection" style={styles.neighborhoodFilter} accessibilityRole="button" accessibilityLabel="Clear neighborhood filter"
                onPress={() => { setNeighborhood(null); setVisibilityFilters([]); }}>
                <Ionicons name="people-outline" size={18} color={COLORS.primary} />
                <Text maxFontSizeMultiplier={1.4} style={styles.neighborhoodFilterText} numberOfLines={1}>{neighborhood.name || 'Neighborhood'}</Text>
                <Ionicons name="close" size={18} color={COLORS.primary} />
              </HapticPressable>}
              <ScrollView horizontal style={[styles.typeRibbon, width < 375 && styles.typeRibbonCompact]} contentContainerStyle={styles.typeRibbonContent} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.typeTabs} testID="Feed.typeRibbon" accessibilityRole="tablist" accessibilityLabel="Post type">
                  {FILTER_OPTIONS.map(option => {
                    const selected = option.key === 'all' ? activeFilters.length === 0 : activeFilters.includes(option.key);
                    const label = option.key === 'all' && neighborhood ? 'All items' : option.label;
                    return <HapticPressable haptic="selection" key={option.key} testID={`Feed.type.${option.key}`} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => setActiveFilters(option.key === 'all' ? [] : [option.key])} style={[styles.typeTab, fontScale > 1.2 && { minWidth: 72 * fontScale }]}>
                      <Ionicons name={option.icon} size={22}  color={COLORS.primary} accessible={false} />
                      <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={[styles.typeTabText, width < 400 && styles.typeTabTextCompact, selected && styles.typeTabTextActive]}>{label}</Text>
                      {selected && <View accessible={false} style={styles.typeTabIndicator} />}
                    </HapticPressable>;
                  })}
                </View>
              </ScrollView>
            </>}
          </NativeHeader>
        </Animated.View>
        <BorrowhoodRefreshList
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50, minimumViewTime: 800 }}
          ref={listRef}
          testID="Feed.list"
          key={`feed-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: SPACING.lg, alignItems: 'flex-start' } : undefined}
          data={columns > 1 ? verticalFeed : displayFeed}
          renderItem={columns > 1 ? info => <View style={{ width: tileWidth }}>{renderItem(info)}</View> : renderItem}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={[styles.listContent, { maxWidth: feedWidth }]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          bounces
          removeClippedSubviews={false}
          refreshing={isRefreshing}
          progressViewOffset={feedHeader.height}
          indicatorTop={feedHeader.height}
          onRefresh={onRefresh}
          scrollY={feedHeader.scrollY}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <>
            <View style={{ height: feedHeader.height }} />
            {columns > 1 && <View style={{ paddingHorizontal: SPACING.lg }}>{displayFeed.filter(item => ['feed-banners', 'request-carousel', 'listing-heading'].includes(item.type)).map(item => <View key={item.id}>{renderItem({ item })}</View>)}</View>}
            </>
          }
          ListHeaderComponentStyle={{ marginHorizontal: -SPACING.lg }}
          onScroll={feedHeader.onScroll}
          scrollEventThrottle={16}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={COLORS.spinner} />
              </View>
            ) : hasMore && !isFetching ? (
              <View style={styles.feedEnd}>
                {feedError && <Text style={styles.feedEndText}>{feedError === 'refresh' ? 'Refresh to see the latest posts.' : 'Couldn’t load more posts.'}</Text>}
                <HapticPressable accessibilityRole="button" style={styles.backToTop}
                  onPress={() => feedError === 'refresh' ? fetchFeed(1, false) : fetchFeed(page + 1, true)}>
                  <Text style={styles.backToTopText}>{feedError === 'refresh' ? 'Refresh posts' : feedError ? 'Try again' : 'Load more posts'}</Text>
                </HapticPressable>
              </View>
            ) : !hasMore && (verticalFeed.length > 0 || carouselRequests.length > 0) ? (
              <View style={styles.feedEnd}>
                <Text style={styles.feedEndText}>You’re all caught up</Text>
                <HapticPressable accessibilityRole="button" accessibilityLabel="Back to top" style={styles.backToTop}
                  onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion })}>
                  <Ionicons name="arrow-up" size={18} color={COLORS.primary} />
                  <Text style={styles.backToTopText}>Back to top</Text>
                </HapticPressable>
              </View>
            ) : null
          }
          ListEmptyComponent={<View>{(columns === 1 || !displayFeed.some(item => item.type === 'feed-banners')) && renderBanners()}{isFetching && !isRefreshing ? <ActivityIndicator style={{ padding: 40 }} color={COLORS.spinner} accessibilityLabel="Loading items" /> : !feedError && !hasFilters && user?.city ? (
            <View style={styles.welcomeContainer}>
              <HeroIcon icon="home-outline" size={88} />
              <Text style={styles.emptyTitle}>What would you like to do?</Text>
              <Text style={styles.welcomeSubtitle}>No posts nearby yet. Start by sharing or asking.</Text>
              <View style={styles.welcomeActions}>
                <HapticPressable accessibilityRole="button" accessibilityLabel="List an item" style={styles.welcomeAction} onPress={() => navigation.navigate('CreateListing')}>
                  <Ionicons name="basket" size={22} color={COLORS.primary} />
                  <View style={{ flex: 1 }}><Text maxFontSizeMultiplier={1.4} style={styles.welcomeActionTitle}>List an item</Text><Text maxFontSizeMultiplier={1.4} style={styles.welcomeActionNote}>Share an item or service.</Text></View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
                </HapticPressable>
                <View style={styles.welcomeSeparator} />
                <HapticPressable accessibilityRole="button" accessibilityLabel="Post in Wanted" style={styles.welcomeAction} onPress={() => navigation.navigate('CreateRequest')}>
                  <RequestTypeIcon size={22} />
                  <View style={{ flex: 1 }}><Text maxFontSizeMultiplier={1.4} style={styles.welcomeActionTitle}>Post in Wanted</Text><Text maxFontSizeMultiplier={1.4} style={styles.welcomeActionNote}>Let neighbors know what you need.</Text></View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
                </HapticPressable>
              </View>
              <Text style={styles.welcomePrivacy}>You choose who sees each post.</Text>
            </View>
          ) :
            <View style={styles.emptyContainer}>
              <HeroIcon icon={feedError ? 'cloud-offline-outline' : hasFilters ? 'search-outline' : user?.city ? 'basket' : 'location-outline'} size={72} />
              <Text style={styles.emptyTitle}>{feedError ? 'Couldn’t load nearby items' : hasFilters ? 'No matching items yet' : user?.city ? 'Ask your town for what you need' : 'Choose your town'}</Text>
              <Text style={styles.emptySubtitle}>{feedError ? 'Check your connection and try again.' : hasFilters ? 'Try fewer filters, or ask your neighbors for what you need.' : user?.city ? 'Post what you’re looking for. Neighbors can offer to help.' : 'Add your town to discover items nearby.'}</Text>
              <HapticPressable scaleDown={0.97} style={styles.emptyButton} accessibilityRole="button" onPress={() => {
                if (feedError) return fetchFeed(1, false);
                if (!user?.city) return navigation.navigate('EditProfile');
                if (hasFilters) {
                  setSearch(''); setActiveFilters([]); setVisibilityFilters([]); setCategoryFilters([]); setNeighborhood(null);
                  return fetchFeed(1, false, true);
                }
                navigation.navigate('CreateRequest');
              }}>
                <Text maxFontSizeMultiplier={1.4} style={styles.emptyButtonText}>{feedError ? 'Try again' : !user?.city ? 'Choose town' : hasFilters ? 'Clear search and filters' : 'Ask my town'}</Text>
              </HapticPressable>
              {!feedError && user?.city && <ActionButton style={{ marginTop: SPACING.sm }} onPress={() => hasFilters ? navigation.navigate('CreateRequest', { initialTitle: search.trim() }) : navigation.navigate('Friends')}
                label={hasFilters ? 'Post in Wanted' : 'Invite a neighbor'} />}
            </View>
          }</View>}
        />
      </View>

      {selectedRank && <RankInfoSheet isVisible currentRank={selectedRank.rank} isNew={selectedRank.isNew}
        onClose={() => setSelectedRank(null)} />}

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
          { label: `Visibility · ${visibilityChipLabel}`, accessibilityLabel: 'Filter by visibility', icon: <Ionicons name="neighbors-manage-outline" size={26} />, onPress: () => setActiveDropdown('visibility') },
          ...(categories.length ? [{ label: `Category · ${categoryChipLabel}`, accessibilityLabel: 'Filter by category', icon: <Ionicons name="grid-outline" size={26} />, onPress: () => setActiveDropdown('category') }] : []),
          ...(extraFilterCount ? [{ label: 'Clear filters', onPress: () => { setVisibilityFilters([]); setCategoryFilters([]); setNeighborhood(null); } }] : []),
        ]}
      />

      <ActionSheet
        isVisible={activeDropdown === 'visibility'}
        onClose={() => setActiveDropdown(null)}
        title={
          visibilityFilters.length > 0
            ? <>{'Visibility  '}<Text onPress={() => { setVisibilityFilters([]); setNeighborhood(null); haptics.selection(); }} maxFontSizeMultiplier={1.4} style={{ ...TYPOGRAPHY.buttonCaption, color: COLORS.primary }}>Clear</Text></>
            : 'Visibility'
        }
        multiSelect
        actions={[
          {
            label: 'Everyone',
            icon: visibilityFilters.length === 0
              ? <Ionicons name="selection-check" size={26} color={COLORS.primary} />
              : <Ionicons name="selection-check-empty" size={26} illustrated={false} color={COLORS.textMuted} />,
            onPress: () => { setVisibilityFilters([]); setNeighborhood(null); },
          },
          ...VISIBILITY_OPTIONS.filter(o => o.key !== 'all').map(opt => ({
            label: opt.label,
            icon: visibilityFilters.includes(opt.key)
              ? <Ionicons name="selection-check" size={26} color={COLORS.primary} />
              : <Ionicons name="selection-check-empty" size={26} illustrated={false} color={COLORS.textMuted} />,
            onPress: opt.key === 'town'
              ? handleTownToggle
              : () => { setNeighborhood(null); toggleFilter(opt.key, visibilityKeys, setVisibilityFilters); },
          })),
        ]}
      />

      <ActionSheet
        isVisible={activeDropdown === 'category'}
        onClose={() => setActiveDropdown(null)}
        title={
          categoryFilters.length > 0
            ? <>{'Category  '}<Text onPress={() => { setCategoryFilters([]); haptics.selection(); }} maxFontSizeMultiplier={1.4} style={{ ...TYPOGRAPHY.buttonCaption, color: COLORS.primary }}>Clear</Text></>
            : 'Category'
        }
        multiSelect
        actions={[
          {
            label: 'All',
            icon: categoryFilters.length === 0
              ? <Ionicons name="selection-check" size={26} color={COLORS.primary} />
              : <Ionicons name="selection-check-empty" size={26} illustrated={false} color={COLORS.textMuted} />,
            onPress: () => setCategoryFilters([]),
          },
          ...categories.map(cat => ({
            label: cat.name,
            icon: categoryFilters.includes(cat.id)
              ? <Ionicons name="selection-check" size={26} color={COLORS.primary} />
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
              <Text style={styles.overlayTitle}>See What's Happening Across Town</Text>
              <Text style={styles.overlayText}>
                Verified members can see wanted posts and items explicitly shared in {user?.city || 'your town'}.
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
              <HapticPressable scaleDown={0.97}
                style={styles.overlayButton}
                onPress={() => {
                  setShowUpgradePrompt(false);
                  navigation.navigate('Subscription', { source: 'town_browse', totalSteps: 2 });
                }}
                haptic={null}
                testID="Feed.overlay.upgrade.button"
                accessibilityLabel="See verification options"
                accessibilityRole="button"
              >
                <Text maxFontSizeMultiplier={1.4} style={styles.overlayButtonText}>See verification options</Text>
              </HapticPressable>
              <HapticPressable
                style={styles.overlayDismiss}
                onPress={() => setShowUpgradePrompt(false)}
                haptic={null}
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
  ribbonContent: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.md },
  ribbonCopy: { flex: 1, gap: SPACING.sm },
  ribbonLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  ribbonLabelText: { ...TYPOGRAPHY.footnote, color: COLORS.primary, flex: 1, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
  ribbonTitle: { ...TYPOGRAPHY.headline, color: COLORS.text },
  ribbonPhoto: { width: 64, height: 64, borderRadius: RADIUS.sm },
  ribbonFooter: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 48, marginHorizontal: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator },
  ribbonAuthor: { flex: 1, minWidth: 0, marginTop: 0 },
  ribbonAuthorButton: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' },
  ribbonReplies: { marginHorizontal: 0, borderTopWidth: 0, paddingVertical: 0, minHeight: 48, gap: SPACING.xs },
  ribbonRepliesText: { flex: 0 },
  addButtonText: { ...TYPOGRAPHY.footnote, fontFamily: 'DMSans_500Medium', color: COLORS.surface, fontWeight: '500' },
  feedTitle: { ...TYPOGRAPHY.h1, lineHeight: 36, fontFamily: 'DMSans_700Bold', fontWeight: '700', letterSpacing: 0, color: COLORS.primaryDark },
  feedTitleCompact: { ...TYPOGRAPHY.title2, lineHeight: 32, fontFamily: 'DMSans_600SemiBold', fontWeight: '600' },
  feedTitleRow: { marginBottom: 44 },
  brandMark: { width: 36, height: 36, flexShrink: 0 },
  typeRibbon: { flexGrow: 0, flexShrink: 0 },
  typeRibbonCompact: { marginHorizontal: -SPACING.lg },
  typeRibbonContent: { flexGrow: 1 },
  typeTabs: { flex: 1, flexDirection: 'row', alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderGreen },
  typeTab: { flex: 1, minWidth: 44, minHeight: 64, paddingTop: 4, paddingBottom: SPACING.sm, gap: 4,
    alignItems: 'center', justifyContent: 'center' },
  typeTabIndicator: { position: 'absolute', bottom: 0, width: 28, height: 3, borderRadius: RADIUS.full, backgroundColor: COLORS.primary },
  typeTabText: { ...TYPOGRAPHY.footnote, fontSize: TYPOGRAPHY.footnote.fontSize, lineHeight: 20, fontWeight: '500', color: COLORS.textSecondary, fontFamily: 'DMSans_500Medium', },
  typeTabTextCompact: { ...TYPOGRAPHY.caption1, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
  typeTabTextActive: { fontFamily: 'DMSans_500Medium', color: COLORS.primaryDark, fontWeight: '500', },
  sellerAvatar: { width: 28, height: 28, borderRadius: RADIUS.full },
  requestIcon: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  requestTitle: { ...TYPOGRAPHY.title2, lineHeight: 29, fontWeight: '600', fontFamily: 'DMSans_600SemiBold', },
  availabilityText: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, marginLeft: 'auto' },
  publicReplies: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 44, marginHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator },
  publicRepliesText: { ...TYPOGRAPHY.footnote, fontWeight: '500', flex: 1, color: COLORS.primary, fontFamily: 'DMSans_500Medium', },
  publicRepliesAction: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
  container: {
    flex: 1,
    backgroundColor: FEED.bg,
  },
  feedViewport: { flex: 1, overflow: 'hidden' },
  feedHeader: { position: 'absolute', top: 0, zIndex: 1, backgroundColor: FEED.bg },
  feedHeaderSurface: { backgroundColor: 'transparent', paddingTop: SPACING.sm, paddingBottom: SPACING.lg },
  feedHeaderSurfaceCompact: { paddingHorizontal: SPACING.lg },
  skeletonContainer: {
    padding: SPACING.lg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.full,
    paddingRight: SPACING.xs, paddingVertical: 2, marginBottom: SPACING.md, ...SHADOWS.md,
  },
  headerSearchBar: {
    flex: 1, minWidth: 0, backgroundColor: 'transparent', borderWidth: 0, borderRadius: RADIUS.full,
  },
  filtersButton: { width: 44, height: 44, flexShrink: 0, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primaryMuted },
  neighborhoodFilter: { minHeight: 44, marginTop: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.full,
    alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.primaryMuted },
  neighborhoodFilterText: { ...TYPOGRAPHY.footnote, color: COLORS.primary, flexShrink: 1, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
  filtersButtonActive: { backgroundColor: COLORS.primary },
  addButton: {
    flexDirection: 'row', gap: SPACING.xs, paddingHorizontal: SPACING.md, minHeight: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.md,
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
    ...CARD_SURFACE,
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  overlayCardInner: {
    padding: 28,
  },
  overlayTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    textAlign: 'left',
    marginBottom: 10,
  },
  overlayText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
    textAlign: 'left',
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
  exchangeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    minHeight: 60,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primaryMuted,
  },
  exchangeContent: { flex: 1, minWidth: 0, gap: SPACING.xs },
  exchangeSummary: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.primaryDark,
    fontWeight: '500',
  },
  exchangeActionText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.primary,
    fontWeight: '500',
    fontFamily: 'DMSans_500Medium',
  },
  listContent: {
    paddingHorizontal: SPACING.lg, paddingTop: 0, paddingBottom: SPACING.md, width: '100%', maxWidth: 660, alignSelf: 'center',
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
    fontWeight: '500',
    color: COLORS.primary,
    flexShrink: 1,
    fontFamily: 'DMSans_500Medium',
  },
  tileRow: {
    flexDirection: 'column',
  },
  tilePhotoFrame: {
    paddingHorizontal: SPACING.sm, paddingTop: SPACING.sm,
  },
  tileThumb: {
    width: '100%', aspectRatio: 1.45, alignItems: 'center', justifyContent: 'center', position: 'relative', borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.surfaceElevated,
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
    backgroundColor: COLORS.photoOverlay,
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
  tileContent: {
    padding: SPACING.lg, paddingBottom: SPACING.sm,
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
  tileTypeLabelText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '500',
    letterSpacing: 0.5,
    fontFamily: 'DMSans_500Medium',
  },
  tileTimeText: {
    ...TYPOGRAPHY.caption1, color: COLORS.textMuted, marginLeft: 'auto',
  },
  tileTitle: {
    ...TYPOGRAPHY.headline, fontSize: TYPOGRAPHY.title3.fontSize, lineHeight: 26, color: COLORS.text, marginTop: SPACING.xs,
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
    fontWeight: '500',
    marginLeft: 'auto',
  },
  card: {
    ...CARD_SURFACE,
    marginBottom: SPACING.lg,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  cardGiveaway: {
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.tints.primary20,
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
    fontWeight: '500',
    color: COLORS.primary,
    fontFamily: 'DMSans_500Medium',
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
    ...CARD_SURFACE,
    marginBottom: SPACING.lg,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.honeyTint,
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
    ...TYPOGRAPHY.caption2,
  },
  requestBannerLabel: {
    ...TYPOGRAPHY.caption2,
    fontWeight: '500',
    color: COLORS.white,
    letterSpacing: 1,
    fontFamily: 'DMSans_500Medium',
  },
  requestBannerDate: {
    ...TYPOGRAPHY.caption2,
    fontWeight: '400',
    color: COLORS.photoBadgeSurface,
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
    ...TYPOGRAPHY.subheadline,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 2,
    fontFamily: 'DMSans_500Medium',
  },
  requestSubtitle: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    fontWeight: '500',
    fontFamily: 'DMSans_500Medium',
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
    backgroundColor: COLORS.leafTint,
    borderWidth: 1,
    borderColor: COLORS.leafBorder,
  },
  requestCTAText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.primary,
    fontFamily: 'DMSans_500Medium',
  },
  renewCTA: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: COLORS.tints.primary15,
    borderWidth: 1,
    borderColor: COLORS.tints.primary40,
  },
  renewCTAText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.primary,
    fontFamily: 'DMSans_500Medium',
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
    fontWeight: '400',
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
    fontWeight: '500',
    color: COLORS.primary,
    fontFamily: 'DMSans_500Medium',
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
    fontWeight: '400',
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
    fontWeight: '400',
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
    fontWeight: '400',
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
    fontWeight: '400',
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
    fontWeight: '400',
    color: COLORS.primary,
  },
  typeBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
  },
  borrowedBadge: {
    backgroundColor: 'transparent',
    borderColor: COLORS.tints.warning80,
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
    fontWeight: '500',
    color: COLORS.white,
    letterSpacing: 1,
    fontFamily: 'DMSans_500Medium',
  },
  cardBody: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
    backgroundColor: COLORS.primaryMuted,
  },
  cardTitle: {
    ...TYPOGRAPHY.h3,
    fontWeight: '600',
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
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  freeLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.primary,
    fontFamily: 'DMSans_500Medium',
  },
  priceLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.primary,
    fontFamily: 'DMSans_500Medium',
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
    fontWeight: '500',
    color: COLORS.primary,
    fontFamily: 'DMSans_500Medium',
  },
  verifyUnlockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.tints.warning30,
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
  feedEnd: { alignItems: 'center', gap: SPACING.sm, paddingBottom: SPACING.sm },
  feedEndText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  backToTop: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.borderBrown, borderRadius: RADIUS.full, backgroundColor: COLORS.card,
  },
  backToTopText: { ...TYPOGRAPHY.subheadline, color: COLORS.primary },
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
    fontWeight: '500',
    fontFamily: 'DMSans_500Medium',
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
    color: COLORS.white,
  },
  welcomeContainer: { alignItems: 'center', paddingTop: SPACING.xl, paddingBottom: SPACING.xxl },
  welcomeSubtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, paddingHorizontal: SPACING.lg, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
  welcomeActions: { ...CARD_SURFACE, alignSelf: 'stretch', marginTop: SPACING.xl, overflow: 'hidden' },
  welcomeAction: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, minHeight: 72 },
  welcomeSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.separator, marginLeft: SPACING.lg + 22 + SPACING.md },
  welcomeActionTitle: { ...TYPOGRAPHY.headline, color: COLORS.text },
  welcomeActionNote: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: SPACING.xs, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
  welcomePrivacy: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: SPACING.lg, textAlign: 'center' },
});
