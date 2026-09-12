import ShimmerImage from '../components/ShimmerImage';
import { isTransferListing, isSaleListing } from '../utils/directFee';
import { publicReplyRoute } from '../utils/conversationContext';
import { borrowGuidance } from '../utils/borrowStatus';
import { notificationDestination } from '../utils/notificationDestination';
import { groupPendingExchanges, groupRequestNotifications, readActivity } from '../utils/requestActivity';
import VerifiedBadge from '../components/VerifiedBadge';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  InteractionManager,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '../components/Icon';
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
import LayeredCard from '../components/LayeredCard';
import SegmentedControl from '../components/SegmentedControl';
import NativeHeader from '../components/NativeHeader';
import ActionButton from '../components/ActionButton';
import ActionSheet from '../components/ActionSheet';
import { SkeletonListItem } from '../components/SkeletonLoader';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const NOTIFICATION_ICONS = {
  borrow_request: 'hand-left',
  request_approved: 'checkmark-circle',
  request_declined: 'close-circle',
  payment_confirmed: 'card',
  pickup_confirmed: 'cube',
  return_confirmed: 'checkbox',
  return_reminder: 'alarm',
  dispute_opened: 'warning',
  dispute_filed_against_you: 'alert-circle',
  dispute_counter_received: 'swap-horizontal',
  dispute_response_received: 'chatbubble-ellipses',
  dispute_ready_for_review: 'eye',
  dispute_under_review: 'time',
  dispute_resolved: 'checkmark-done',
  new_rating: 'star',
  rating_received: 'star',
  rank_up: 'trophy',
  rank_down: 'ribbon',
  rank_ready: 'ribbon',
  join_approved: 'people',
  request_offer: 'cube',
  new_request: 'search',
  new_message: 'chatbubble',
  friend_request: 'person-add',
  friend_accepted: 'people',
  referral_joined: 'gift',
  referral_reward: 'trophy',
  payment_failed: 'card',
};

const PAGE_SIZE = 50;
const HIDDEN_ACTIVITY_TYPES = new Set(['item_match', 'new_message', 'new_rating', 'rating_received', 'referral_reward', 'subscription_expired', 'verification_expiring']);
const visibleActivity = item => !item.disputeId && !item.type?.startsWith('dispute') && !HIDDEN_ACTIVITY_TYPES.has(item.type);

export default function InboxScreen({ navigation, route, onRead }) {
  const { user } = useAuth();
  const { showToast } = useError();
  const [activeBorrows, setActiveBorrows] = useState([]);
  const [activeTab, setActiveTab] = useState(route?.params?.tab === 'messages' ? 0 : 1);
  const [notifications, setNotifications] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [reading, setReading] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [notifsDenied, setNotifsDenied] = useState(false);
  const [unseenActivityUnread, setUnseenActivityUnread] = useState(0);
  const requestVersion = useRef(0);
  const pageCount = useRef(1);
  const unreadFilter = useRef(false);
  const knownTransactions = useRef([]);
  const tabChosen = useRef(!!route?.params?.tab);
  const readingRef = useRef(false);

  useEffect(() => {
    const tab = route?.params?.tab;
    if (!['messages', 'activity'].includes(tab)) return;
    tabChosen.current = true;
    setActiveTab(tab === 'messages' ? 0 : 1);
    navigation.setParams?.({ tab: undefined });
  }, [route?.params?.tab, navigation]);

  const checkNotifPermission = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setNotifsDenied(status !== 'granted');
    } catch (_) {}
  }, []);

  const fetchData = useCallback(async ({ more = false } = {}) => {
    const version = ++requestVersion.current;
    const pages = pageCount.current + (more ? 1 : 0);
    const [activityResult, conversationResult, exchangeResult] = await Promise.allSettled([
      Promise.all(Array.from({ length: pages }, (_, index) => api.getNotifications({
        page: index + 1, limit: PAGE_SIZE, ...(unreadFilter.current ? { unreadOnly: 'true' } : {}),
      }))),
      api.getConversations(),
      api.getTransactions(),
    ]);
    if (version !== requestVersion.current) return;

    if (exchangeResult.status === 'fulfilled') {
      knownTransactions.current = exchangeResult.value || [];
      setActiveBorrows(groupPendingExchanges(knownTransactions.current.filter(t => ['pending', 'approved', 'paid', 'picked_up', 'return_pending'].includes(t.status)), user?.id));
    }
    if (activityResult.status === 'fulfilled') {
      const responses = activityResult.value;
      const records = responses.flatMap(data => data?.notifications || []);
      const unique = [...new Map(records.map(item => [item.id, item])).values()];
      const visible = groupRequestNotifications(unique.filter(visibleActivity), knownTransactions.current, user?.id);
      setNotifications(visible);
      // Server and list share activity filtering/grouping. Keep older unread
      // activity counted and reachable through Unread only and pagination.
      setUnseenActivityUnread(Math.max(0, (responses[0]?.unreadCount || 0) - unique.filter(n => !n.isRead).length));
      setHasMore((responses[responses.length - 1]?.notifications || []).length === PAGE_SIZE);
      pageCount.current = pages;
    }
    if (conversationResult.status === 'fulfilled') setConversations(conversationResult.value || []);
    if (!tabChosen.current && activityResult.status === 'fulfilled' && conversationResult.status === 'fulfilled') {
      const activityUnread = activityResult.value[0]?.unreadCount || 0;
      const messageUnread = (conversationResult.value || []).some(item => item.unreadCount > 0);
      setActiveTab(!activityUnread && messageUnread ? 0 : 1);
      tabChosen.current = true;
    }
    setLoadError({
      activity: activityResult.status === 'rejected',
      messages: conversationResult.status === 'rejected',
      exchanges: exchangeResult.status === 'rejected',
    });
    setIsLoading(false);
    setIsRefreshing(false);
    setIsLoadingMore(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        fetchData();
        checkNotifPermission();
        onRead?.();
      });
      const timer = setInterval(fetchData, 10000);
      return () => { task.cancel(); clearInterval(timer); requestVersion.current += 1; tabChosen.current = false; };
    }, [fetchData, checkNotifPermission, onRead])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const selectUnreadOnly = (value) => {
    if (value === unreadFilter.current) return;
    unreadFilter.current = value;
    pageCount.current = 1;
    setUnreadOnly(unreadFilter.current);
    setHasMore(false);
    setIsRefreshing(true);
    fetchData();
  };

  const loadOlder = () => {
    if (isLoadingMore || isRefreshing) return;
    setIsLoadingMore(true);
    fetchData({ more: true });
  };

  const unreadCount = unseenActivityUnread + notifications.filter(n => !n.isRead).length;
  const unreadMessages = conversations.reduce((count, conversation) => count + (conversation.unreadCount || 0), 0);

  const handleMarkAllRead = async () => {
    if (readingRef.current) return;
    readingRef.current = true;
    setReading(true);
    try {
      const markMessagesRead = async () => {
        // Fetch all conversations, including any missing after a failed load.
        const latest = await api.getConversations();
        const results = await Promise.allSettled((latest || [])
          .filter(item => item.unreadCount > 0)
          .map(item => api.markConversationRead(item.id)));
        if (results.some(result => result.status === 'rejected')) throw new Error('Message read failed');
      };
      const results = await Promise.allSettled([api.markAllNotificationsRead(), markMessagesRead()]);
      if (results.some(result => result.status === 'rejected')) throw new Error('Inbox read failed');
      haptics.success();
      showToast('Marked activity and messages as read.', 'success');
    } catch (e) {
      haptics.error();
      showToast('Some items couldn’t be marked as read. Please try again.', 'error');
    } finally {
      onRead?.();
      // Reconcile after the update so anything arriving meanwhile stays unread.
      await fetchData();
      readingRef.current = false;
      setReading(false);
    }
  };

  const getTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(date).toLocaleDateString();
  };

  // Navigate to parent stack for detail screens
  const nav = navigation.getParent() || navigation;

  const handleNotificationPress = async (item) => {
    haptics.light();
    const destination = notificationDestination(item);
    if (destination) nav.navigate(destination.name, destination.params);

    if (!item.isRead) {
      try {
        await readActivity(api, item);
        requestVersion.current += 1;
        setIsRefreshing(false);
        setIsLoadingMore(false);
        const readIds = new Set(item.notificationIds || [item.id]);
        setNotifications(prev => prev.map(n => n.id === item.id && (n.notificationIds || [n.id]).every(id => readIds.has(id)) ? { ...n, isRead: true } : n));
        onRead?.();
      } catch (_) {}
    }
  };

  const renderNotification = ({ item, index }) => (
    <LayeredCard style={styles.cardDepth}>
      <HapticPressable
        style={[styles.card, !item.isRead && styles.cardUnread]}
        onPress={() => handleNotificationPress(item)}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        haptic={null}
      >
        <View style={[styles.iconContainer, !item.isRead && styles.iconContainerUnread]}>
          {item.fromUser?.profilePhotoUrl ? (
            <Image
              source={{ uri: item.fromUser.profilePhotoUrl }}
              style={styles.notifAvatar}
            />
          ) : (
            <Ionicons
              name={item.queueListingId ? 'people' : NOTIFICATION_ICONS[item.type] || 'notifications'}
              size={20}
              color={!item.isRead ? COLORS.primary : COLORS.gray[400]}
            />
          )}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={[styles.name, !item.isRead && styles.nameUnread]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.time}>{getTimeAgo(item.createdAt)}</Text>
          </View>
          <Text style={[styles.lastMessage, item.queueListingId && {color:COLORS.primary,fontWeight:'600'}]} numberOfLines={3}>{item.body}</Text>
          {!!publicReplyRoute(item) && <Text style={styles.listingText}>Comment on a post</Text>}
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </HapticPressable>
    </LayeredCard>
  );

  const renderConversation = ({ item, index }) => (
    <LayeredCard style={styles.cardDepth}>
      <HapticPressable
        style={styles.card}
        onPress={() => nav.navigate('Chat', { conversationId: item.id })}
        haptic="light"
      >
        <View style={styles.avatarContainer}>
          <ShimmerImage placeholderIcon="person"
            source={{ uri: item.otherUser?.profilePhotoUrl || null }}
            style={styles.avatar}
          />
          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {item.unreadCount > 9 ? '9+' : item.unreadCount}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:5}}>
              <Text style={[styles.name, {flex:undefined,flexShrink:1}, item.unreadCount > 0 && styles.nameUnread]} numberOfLines={1}>
                {item.otherUser?.firstName} {item.otherUser?.lastName}
              </Text>
              {item.otherUser?.isVerified === true && <VerifiedBadge size={16} />}
            </View>
            <Text style={styles.time}>{getTimeAgo(item.lastMessageAt)}</Text>
          </View>
          <Text style={styles.listingText}>Private conversation</Text>
          {item.listing && (
            <View style={styles.listingRow}>
              <Ionicons name="cube-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.listingText} numberOfLines={1}>{item.listing.title}</Text>
            </View>
          )}
          <Text
            style={[styles.lastMessage, item.unreadCount > 0 && styles.lastMessageUnread]}
            numberOfLines={1}
          >
            {item.lastMessage || 'No messages yet'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </HapticPressable>
    </LayeredCard>
  );

  const renderRetry = message => (
    <View style={styles.retryNotice} accessibilityLiveRegion="polite">
      <Text style={styles.retryText}>{message}</Text>
      <HapticPressable accessibilityRole="button" accessibilityLabel="Retry loading inbox" onPress={onRefresh} style={styles.textButton} disabled={isRefreshing}>
        <Text style={styles.markAllBtn}>{isRefreshing ? 'Retrying…' : 'Retry'}</Text>
      </HapticPressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <NativeHeader title="Inbox" rightElement={
        <View style={styles.headerActions}>
          {unreadOnly && <HapticPressable style={styles.activeFilter}
            accessibilityLabel="Show all inbox items" onPress={() => selectUnreadOnly(false)}>
            <Text style={styles.activeFilterLabel}>Unread only</Text>
            <Ionicons name="close" size={14} color={COLORS.primary} />
          </HapticPressable>}
          <HapticPressable style={styles.optionsButton} accessibilityLabel="Inbox options"
            accessibilityHint="Filter unread items or mark the inbox as read."
            accessibilityState={{ disabled: isLoading || reading, expanded: optionsVisible, busy: reading }}
            disabled={isLoading || reading} onPress={() => setOptionsVisible(true)}>
            {reading ? <ActivityIndicator color={COLORS.primary} size="small" />
              : <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.primary} />}
          </HapticPressable>
        </View>
      }>
        <SegmentedControl
          testID="Inbox.segment"
          segments={[
            `Activity${unreadCount > 0 ? ` (${unreadCount})` : ''}`,
            `Messages${unreadMessages > 0 ? ` (${unreadMessages})` : ''}`,
          ]}
          selectedIndex={activeTab === 1 ? 0 : 1}
          onIndexChange={index => { tabChosen.current = true; setActiveTab(index === 0 ? 1 : 0); }}
          style={styles.segmented}
        />
      </NativeHeader>

      {isLoading ? (
        <View style={styles.skeletonContainer}>
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </View>
      ) : activeTab === 1 ? (
        <FlatList
          data={unreadOnly ? notifications.filter(item => !item.isRead) : notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            <>
              {(loadError.activity || loadError.exchanges) && renderRetry(loadError.activity && loadError.exchanges ? 'Couldn’t refresh activity and exchanges.' : loadError.activity ? 'Couldn’t refresh activity.' : 'Couldn’t refresh exchanges.')}
              {!unreadOnly && activeBorrows.length > 0 && <View style={{ gap: SPACING.sm, marginBottom: SPACING.lg }}>
                <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>Active exchanges</Text>
                {activeBorrows.map(transaction => {
                  const other = transaction.isBorrower ? transaction.lender : transaction.borrower;
                  const guidance = borrowGuidance({ ...transaction, isGiveaway: isTransferListing(transaction) });
                  return <HapticPressable key={transaction.id} accessibilityRole="button" accessibilityLabel={transaction.queueListingId ? `See queue for ${transaction.listing?.title || 'item'}, ${transaction.requestCount} waiting` : `View exchange for ${transaction.listing?.title || 'item'}`}
                    onPress={() => {
                      if (!transaction.queueListingId) { nav.navigate('TransactionDetail', { id: transaction.id }); return; }
                      const alert = notifications.find(item => item.queueListingId === transaction.queueListingId);
                      if (alert) handleNotificationPress(alert);
                      else nav.navigate('RequestQueue', { listingId: transaction.queueListingId });
                    }}
                    style={{ padding: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryMuted, flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                    <Ionicons name={isSaleListing(transaction) ? 'pricetag' : isTransferListing(transaction) ? 'gift' : 'basket'} size={32} illustrated />
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>{transaction.listing?.title || 'Shared item'}</Text>
                      {transaction.queueListingId ? <Text style={{color:COLORS.textSecondary}}>{transaction.requestCount} {transaction.requestCount === 1 ? 'person waiting' : 'people waiting'}</Text> : <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
                        <Text style={{ color: COLORS.textSecondary,flexShrink:1 }}>With {other?.firstName || 'your neighbor'}</Text>
                        {other?.isVerified === true && <VerifiedBadge size={16} />}
                      </View>}
                      <Text style={{ ...TYPOGRAPHY.footnote, color: COLORS.primary, marginTop: 4 }}>{transaction.queueListingId ? 'See queue' : guidance.title}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                  </HapticPressable>;
                })}
              </View>}
              {notifsDenied && (
                <HapticPressable
                  style={styles.notifBannerInline}
                  onPress={() => Linking.openSettings()}
                  haptic="light"
                >
                  <Ionicons name="notifications-off-outline" size={18} color={COLORS.warning} />
                  <Text style={styles.notifBannerInlineText}>
                    Notifications are off — tap to enable
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </HapticPressable>
              )}
            </>
          }
          ListFooterComponent={hasMore ? (
            <HapticPressable onPress={loadOlder} disabled={isLoadingMore || isRefreshing} style={styles.olderButton} accessibilityRole="button">
              <Text style={styles.markAllBtn}>{isLoadingMore ? 'Loading…' : 'Show older updates'}</Text>
            </HapticPressable>
          ) : null}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <HeroIcon icon="notifications" size={80} />
              <Text style={styles.emptyTitle}>{loadError.activity ? 'Activity is unavailable' : unreadOnly ? 'No unread activity' : activeBorrows.length ? 'No new updates' : 'All caught up!'}</Text>
              {unreadOnly && !loadError.activity ? (
                <ActionButton label="Show all" onPress={() => selectUnreadOnly(false)} style={styles.showAllButton} />
              ) : <Text style={styles.emptySubtitle}>
                {loadError.activity ? 'Check your connection, then tap Retry.' : 'Requests, replies and pickup updates will appear here.'}
              </Text>}
            </View>
          }
        />
      ) : (
        <FlatList
          data={unreadOnly ? conversations.filter(item => item.unreadCount > 0) : conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={loadError.messages ? renderRetry('Couldn’t refresh messages.') : null}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <HeroIcon icon="chatbubble" size={80} />
              <Text style={styles.emptyTitle}>{loadError.messages ? 'Messages are unavailable' : unreadOnly ? 'No unread messages' : 'No messages yet'}</Text>
              {unreadOnly && !loadError.messages ? (
                <ActionButton label="Show all" onPress={() => selectUnreadOnly(false)} style={styles.showAllButton} />
              ) : <Text style={styles.emptySubtitle}>
                {loadError.messages ? 'Check your connection, then tap Retry.' : 'Message a neighbor from an item or exchange to get started.'}
              </Text>}
            </View>
          }
        />
      )}
      <ActionSheet isVisible={optionsVisible} onClose={() => setOptionsVisible(false)} title="Inbox options" variant="options"
        actions={[
          { label: 'Unread only', selected: unreadOnly, icon: <Ionicons name="mail-unread" size={24} color={COLORS.primary} />, onPress: () => {
            setOptionsVisible(false);
            selectUnreadOnly(!unreadOnly);
          } },
          { label: 'Mark all as read', icon: <Ionicons name="messages-read" size={24} color={COLORS.primary} />, onPress: () => {
            setOptionsVisible(false);
            handleMarkAllRead();
          } },
        ]}
      />
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
  segmented: {
    marginTop: SPACING.sm,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  optionsButton: {
    width: 44, height: 44, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.borderGreenStrong, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  activeFilter: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    paddingHorizontal: SPACING.sm, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.borderGreenStrong, backgroundColor: COLORS.primaryMuted,
  },
  activeFilterLabel: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  showAllButton: { marginTop: SPACING.lg, minWidth: 120, maxWidth: '100%' },
  textButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, flexShrink: 1 },
  retryNotice: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm, marginBottom: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceElevated },
  retryText: { ...TYPOGRAPHY.footnote, flex: 1, color: COLORS.textSecondary },
  olderButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, marginVertical: SPACING.sm },
  markAllBtn: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
    flexGrow: 1,
  },
  cardDepth: { marginBottom: SPACING.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  cardUnread: {
    backgroundColor: COLORS.requestSurface,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.gray[700],
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerUnread: {
    backgroundColor: COLORS.primary + '20',
  },
  notifAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  nameUnread: {
    fontWeight: '700',
  },
  time: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  listingText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  lastMessage: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  lastMessageUnread: {
    color: COLORS.text,
    fontWeight: '500',
  },
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
  },
  emptySubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  notifBannerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningMuted,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  notifBannerInlineText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.text,
    flex: 1,
  },
});
