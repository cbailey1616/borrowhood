import { useState, useEffect, useCallback, useRef } from 'react';
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
  TextInput,
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
  const [hasNeighborhood, setHasNeighborhood] = useState(true); // assume yes until checked
  const [activeDisputes, setActiveDisputes] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [dueSoonItems, setDueSoonItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dismissedBanners, setDismissedBanners] = useState({});
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestDiscussions, setRequestDiscussions] = useState({});
  const [listingDiscussions, setListingDiscussions] = useState({});
  const [threadInputs, setThreadInputs] = useState({});
  const [submittingThread, setSubmittingThread] = useState(null);
  const [expandedThreads, setExpandedThreads] = useState({});
  const [threadReplies, setThreadReplies] = useState({});
  const [replyingTo, setReplyingTo] = useState({});
  const [collapsedThreads, setCollapsedThreads] = useState({});
  const listRef = useRef(null);
  const [focusedItemId, setFocusedItemId] = useState(null);

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

  // Fetch discussion previews for all feed items
  useEffect(() => {
    const requestItems = feed.filter(item => item.type === 'request' && !requestDiscussions[item.id]);
    requestItems.forEach(async (item) => {
      try {
        const data = await api.getRequestDiscussions(item.id, { limit: 2 });
        setRequestDiscussions(prev => ({
          ...prev,
          [item.id]: { posts: data.posts || [], total: data.total || 0 },
        }));
      } catch (error) {}
    });

    const listingItems = feed.filter(item => item.type === 'listing' && !listingDiscussions[item.id]);
    listingItems.forEach(async (item) => {
      try {
        const data = await api.getDiscussions(item.id, { limit: 2 });
        setListingDiscussions(prev => ({
          ...prev,
          [item.id]: { posts: data.posts || [], total: data.total || 0 },
        }));
      } catch (error) {}
    });
  }, [feed]);

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
    const unsubscribe = navigation.addListener('focus', () => {
      if (!isInitialLoad) {
        // Delay feed fetch until modal dismiss animation completes
        // to avoid blocking the JS thread during transitions
        InteractionManager.runAfterInteractions(() => {
          setIsRefreshing(true);
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
      const pending = txList.filter(t => t.status === 'pending' && t.ownerId === user?.id);
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

  const onRefresh = () => {
    setIsRefreshing(true);
    setRequestDiscussions({});
    setListingDiscussions({});
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
      color: COLORS.info || '#5BA4CF',
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
    !hasNeighborhood && !dismissedBanners.join && {
      key: 'join',
      icon: 'location',
      color: COLORS.primary,
      title: 'Join a nearby neighborhood',
      subtitle: 'See items and requests from your neighbors',
      onPress: () => navigation.navigate('JoinCommunity'),
    },
  ].filter(Boolean);

  const PEEK_HEIGHT = 8;

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
      <HapticPressable
        style={styles.card}
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
              <View style={styles.userInfo}>
                <HapticPressable
                  onPress={() => navigation.navigate('UserProfile', { id: item.user.id })}
                  haptic="light"
                >
                  {item.user.profilePhotoUrl ? (
                    <Image source={{ uri: item.user.profilePhotoUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Ionicons name="person" size={20} color={COLORS.gray[400]} />
                    </View>
                  )}
                </HapticPressable>
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
              </View>
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

          {item.ownerMasked && (
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
          )}
        {/* Inline thread */}
        {!item.ownerMasked && renderInlineThread(item.id, listingDiscussions[item.id], false)}
      </HapticPressable>
    </AnimatedCard>
  );

  const handleThreadSubmit = async (itemId, isRequest = false) => {
    const text = (threadInputs[itemId] || '').trim();
    if (!text) return;

    setSubmittingThread(itemId);
    try {
      const parentId = replyingTo[itemId]?.id || undefined;
      const result = isRequest
        ? await api.createRequestDiscussionPost(itemId, { content: text, parentId })
        : await api.createDiscussionPost(itemId, { content: text, parentId });

      const newPost = {
        id: result.id,
        content: result.content,
        replyCount: 0,
        createdAt: result.createdAt,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePhotoUrl: user.profilePhotoUrl,
        },
        isOwn: true,
      };

      const setDiscussions = isRequest ? setRequestDiscussions : setListingDiscussions;

      if (parentId) {
        setThreadReplies(prev => ({
          ...prev,
          [parentId]: [...(prev[parentId] || []), newPost],
        }));
        setDiscussions(prev => ({
          ...prev,
          [itemId]: {
            ...prev[itemId],
            posts: (prev[itemId]?.posts || []).map(p =>
              p.id === parentId ? { ...p, replyCount: (p.replyCount || 0) + 1 } : p
            ),
          },
        }));
        setExpandedThreads(prev => ({ ...prev, [parentId]: true }));
      } else {
        setDiscussions(prev => ({
          ...prev,
          [itemId]: {
            posts: [newPost, ...(prev[itemId]?.posts || [])],
            total: (prev[itemId]?.total || 0) + 1,
          },
        }));
      }

      haptics.success();
      setThreadInputs(prev => ({ ...prev, [itemId]: '' }));
      setReplyingTo(prev => ({ ...prev, [itemId]: null }));
    } catch (error) {
      console.error('Thread submit error:', error);
      haptics.error();
    } finally {
      setSubmittingThread(null);
    }
  };

  const fetchThreadReplies = async (itemId, postId, isRequest = false) => {
    try {
      const data = isRequest
        ? await api.getRequestDiscussionReplies(itemId, postId)
        : await api.getDiscussionReplies(itemId, postId);
      setThreadReplies(prev => ({ ...prev, [postId]: data.replies || [] }));
    } catch (error) {
      console.error('Failed to fetch replies:', error);
    }
  };

  const toggleThreadExpand = async (itemId, postId, isRequest = false) => {
    const isExpanding = !expandedThreads[postId];
    setExpandedThreads(prev => ({ ...prev, [postId]: isExpanding }));
    if (isExpanding && !threadReplies[postId]) {
      await fetchThreadReplies(itemId, postId, isRequest);
    }
  };

  const renderInlineThread = (itemId, thread, isRequest) => {
    const posts = thread?.posts || [];
    const inputValue = threadInputs[itemId] || '';
    const isSubmitting = submittingThread === itemId;
    const currentReply = replyingTo[itemId];
    const isCollapsed = collapsedThreads[itemId] !== false;
    const feedItem = feed.find(f => f.id === itemId);
    const navParams = isRequest
      ? { requestId: itemId, request: feedItem }
      : { listingId: itemId, listing: feedItem };

    return (
      <View style={styles.threadContainer}>
        <HapticPressable
          haptic="light"
          onPress={() => setCollapsedThreads(prev => ({ ...prev, [itemId]: !prev[itemId] }))}
          style={[styles.threadHeader, !isCollapsed && styles.threadHeaderExpanded]}
        >
          <Ionicons name="chatbubbles-outline" size={14} color={COLORS.textSecondary} />
          <Text style={[styles.threadHeaderText, { flex: 1 }]}>
            {thread?.total > 0 ? `${thread.total} ${thread.total === 1 ? 'comment' : 'comments'}` : 'No comments yet'}
          </Text>
          <Ionicons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={14} color={COLORS.textMuted} />
        </HapticPressable>

        {isCollapsed ? null : (<>

        {posts.map((post) => (
          <View key={post.id} style={styles.threadPost}>
            <View style={styles.threadPostRow}>
              {post.user.profilePhotoUrl ? (
                <Image source={{ uri: post.user.profilePhotoUrl }} style={styles.requestThreadAvatar} />
              ) : (
                <View style={[styles.requestThreadAvatar, styles.requestAvatarPlaceholder]}>
                  <Ionicons name="person" size={10} color={COLORS.gray[400]} />
                </View>
              )}
              <View style={styles.requestThreadBody}>
                <Text style={styles.requestThreadAuthor}>
                  {post.user.firstName} {post.user.lastName}
                </Text>
                <Text style={styles.requestThreadText}>{post.content}</Text>
                <View style={styles.threadPostActions}>
                  <HapticPressable
                    haptic="light"
                    onPress={() => setReplyingTo(prev => ({ ...prev, [itemId]: post }))}
                    style={styles.threadReplyBtn}
                  >
                    <Text style={styles.threadReplyBtnText}>Reply</Text>
                  </HapticPressable>
                  {post.replyCount > 0 && (
                    <HapticPressable
                      haptic="light"
                      onPress={() => toggleThreadExpand(itemId, post.id, isRequest)}
                      style={styles.threadReplyBtn}
                    >
                      <Text style={[styles.threadReplyBtnText, { color: COLORS.primary }]}>
                        {expandedThreads[post.id] ? 'Hide' : 'View'} {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
                      </Text>
                    </HapticPressable>
                  )}
                </View>
              </View>
            </View>

            {expandedThreads[post.id] && (threadReplies[post.id] || []).map((reply) => (
              <View key={reply.id} style={styles.threadReply}>
                {reply.user.profilePhotoUrl ? (
                  <Image source={{ uri: reply.user.profilePhotoUrl }} style={styles.threadReplyAvatar} />
                ) : (
                  <View style={[styles.threadReplyAvatar, styles.requestAvatarPlaceholder]}>
                    <Ionicons name="person" size={8} color={COLORS.gray[400]} />
                  </View>
                )}
                <View style={styles.threadReplyBody}>
                  <Text style={styles.threadReplyAuthor}>
                    {reply.user.firstName} {reply.user.lastName}
                  </Text>
                  <Text style={styles.threadReplyText}>{reply.content}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        {thread?.total > 2 && (
          <HapticPressable
            onPress={() => navigation.navigate('ListingDiscussion', navParams)}
            haptic="light"
            style={styles.threadViewAll}
          >
            <Text style={styles.requestThreadLinkText}>View all {thread.total} comments</Text>
          </HapticPressable>
        )}

        {currentReply && (
          <View style={styles.threadReplyingBar}>
            <Text style={styles.threadReplyingText}>
              Replying to {currentReply.user.firstName}
            </Text>
            <HapticPressable
              haptic="light"
              onPress={() => setReplyingTo(prev => ({ ...prev, [itemId]: null }))}
            >
              <Ionicons name="close" size={16} color={COLORS.textSecondary} />
            </HapticPressable>
          </View>
        )}

        <View style={styles.threadInputRow}>
          <TextInput
            style={styles.threadInput}
            value={inputValue}
            onChangeText={(text) => setThreadInputs(prev => ({ ...prev, [itemId]: text }))}
            placeholder={currentReply ? 'Write a reply...' : 'Write a comment...'}
            placeholderTextColor={COLORS.textMuted}
            maxLength={2000}
            onFocus={() => {
              setFocusedItemId(itemId);
              const index = feed.findIndex(f => f.id === itemId);
              if (index >= 0 && listRef.current) {
                setTimeout(() => {
                  listRef.current.scrollToIndex({ index, viewPosition: 0, animated: true });
                }, 300);
              }
            }}
            onBlur={() => setFocusedItemId(null)}
          />
          <HapticPressable
            haptic="medium"
            style={[styles.threadSendBtn, (!inputValue.trim() || isSubmitting) && styles.threadSendBtnDisabled]}
            onPress={() => handleThreadSubmit(itemId, isRequest)}
            disabled={!inputValue.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={14} color="#fff" />
            )}
          </HapticPressable>
        </View>

        {feedItem && feedItem.user?.id !== user?.id && (
          <HapticPressable
            haptic="light"
            style={styles.threadDmButton}
            onPress={() => navigation.navigate('Chat', {
              recipientId: feedItem.user.id,
              ...(isRequest
                ? {}
                : { listingId: itemId, listing: feedItem }),
            })}
          >
            <Ionicons name="mail-outline" size={14} color={COLORS.primary} />
            <Text style={styles.threadDmText}>
              {isRequest
                ? `Message ${feedItem.user.firstName} privately`
                : `Message ${feedItem.user.firstName} about this item`}
            </Text>
          </HapticPressable>
        )}
        </>)}
      </View>
    );
  };

  const renderRequestItem = (item, index) => {
    const neededByDate = item.neededUntil
      ? new Date(item.neededUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : null;
    const thread = requestDiscussions[item.id];

    return (
      <AnimatedCard index={index}>
        <View style={styles.requestCard}>
          {/* Tap header area to go to detail */}
          <HapticPressable
            onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
            haptic="light"
            scaleDown={1}
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
                ) : null}
              </View>
              {item.description ? (
                <Text style={styles.requestSnippet} numberOfLines={2}>{item.description}</Text>
              ) : null}
            </View>
          </HapticPressable>

          {/* Embedded thread */}
          {renderInlineThread(item.id, thread, true)}
        </View>
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
        ref={listRef}
        data={feed}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.listContent}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          banners.length > 0 ? (
            <View style={[styles.bannerDeck, { marginBottom: SPACING.lg, height: 60 + (banners.length - 1) * PEEK_HEIGHT }]}>
              {banners.map((b, i) => {
                const isTop = i === 0;
                return (
                  <View
                    key={b.key}
                    style={[
                      styles.bannerCard,
                      {
                        top: i * PEEK_HEIGHT,
                        zIndex: banners.length - i,
                        borderColor: b.color,
                        opacity: isTop ? 1 : 0.95,
                        transform: [{ scale: 1 - i * 0.02 }],
                      },
                    ]}
                  >
                    <HapticPressable
                      style={styles.bannerCardInner}
                      onPress={b.onPress}
                      haptic="light"
                      scaleDown={0.98}
                    >
                      <View style={[styles.bannerIcon, { backgroundColor: b.color + '15' }]}>
                        <Ionicons name={b.icon} size={20} color={b.color} />
                      </View>
                      <View style={styles.bannerContent}>
                        <Text style={styles.bannerTitle}>{b.title}</Text>
                        {isTop && <Text style={styles.bannerSubtitle}>{b.subtitle}</Text>}
                      </View>
                    </HapticPressable>
                    {isTop && (
                      <HapticPressable
                        style={styles.bannerDismissBtn}
                        onPress={() => dismissBanner(b.key)}
                        haptic="light"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={16} color={COLORS.textMuted} />
                      </HapticPressable>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null
        }
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
  bannerDeck: {
    position: 'relative',
  },
  bannerCard: {
    position: 'absolute',
    left: 0,
    right: 0,
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
    padding: SPACING.lg,
    paddingBottom: 160,
  },
  card: {
    marginBottom: SPACING.lg,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
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
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.card,
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
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.md,
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
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
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
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
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
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.xl,
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
