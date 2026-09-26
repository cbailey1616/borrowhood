import NotificationIcon from '../components/NotificationIcon';
import { listingIcon } from '../utils/listingPresentation';
import ShimmerImage from '../components/ShimmerImage';
import { inboxActivity } from '../utils/inboxActivity';
import { publicReplyRoute, messagePresentation } from '../utils/conversationContext';
import { notificationDestination } from '../utils/notificationDestination';
import { readActivity } from '../utils/requestActivity';
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



const PAGE_SIZE = 50;
const HIDDEN_ACTIVITY_TYPES = new Set(['item_match', 'new_message', 'new_rating', 'rating_received', 'referral_reward', 'subscription_expired', 'verification_expiring']);
const visibleActivity = item => !HIDDEN_ACTIVITY_TYPES.has(item.type);

export default function InboxScreen({ navigation, route, onRead }) {
  const { user } = useAuth();
  const { showToast } = useError();
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
  const activityRecords = useRef([]);
  const accountId = useRef(user?.id);
  accountId.current = user?.id;
  const tabChosen = useRef(!!route?.params?.tab);
  const readingRef = useRef(false);

  useEffect(() => {
    requestVersion.current += 1;
    knownTransactions.current = [];
    activityRecords.current = [];
    pageCount.current = 1;
    unreadFilter.current = false;
    readingRef.current = false;
    setNotifications([]);
    setConversations([]);
    setUnseenActivityUnread(0);
    setUnreadOnly(false);
    setReading(false);
    setHasMore(false);
    setOptionsVisible(false);
    setIsLoading(true);
  }, [user?.id]);

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
    if (version !== requestVersion.current || accountId.current !== user?.id) return;

    if (exchangeResult.status === 'fulfilled') {
      knownTransactions.current = exchangeResult.value?.transactions || exchangeResult.value || [];
    }
    if (activityResult.status === 'fulfilled') {
      const responses = activityResult.value;
      const records = responses.flatMap(data => data?.notifications || []);
      const unique = [...new Map(records.map(item => [item.id, item])).values()];
      activityRecords.current = unique.filter(visibleActivity);
      const visible = inboxActivity(activityRecords.current, knownTransactions.current, user?.id);
      setNotifications(visible);
      // Server and list share activity filtering/grouping. Keep older unread
      // activity counted and reachable through Unread only and pagination.
      setUnseenActivityUnread(Math.max(0, (responses[0]?.unreadCount || 0) - unique.filter(n => !n.isRead).length));
      setHasMore((responses[responses.length - 1]?.notifications || []).length === PAGE_SIZE);
      pageCount.current = pages;
    }
    if (activityResult.status === 'rejected' && exchangeResult.status === 'fulfilled') {
      setNotifications(inboxActivity(activityRecords.current, knownTransactions.current, user?.id));
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
  const unreadMessages = conversations.filter(conversation => conversation.unreadCount > 0).length;

  const handleMarkAllRead = async () => {
    if (readingRef.current) return;
    const readerId = accountId.current;
    readingRef.current = true;
    setReading(true);
    try {
      const markMessagesRead = async () => {
        // Fetch all conversations, including any missing after a failed load.
        const latest = await api.getConversations();
        if (readerId !== accountId.current) return;
        const results = await Promise.allSettled((latest || [])
          .filter(item => item.unreadCount > 0)
          .map(item => api.markConversationRead(item.id)));
        if (results.some(result => result.status === 'rejected')) throw new Error('Message read failed');
      };
      if (activeTab === 1) await api.markAllNotificationsRead();
      else await markMessagesRead();
      if (readerId !== accountId.current) return;
      haptics.success();
      showToast(activeTab === 1 ? 'Activity marked as read.' : 'Messages marked as read.', 'success');
    } catch (e) {
      if (readerId !== accountId.current) return;
      haptics.error();
      showToast('Some items couldn’t be marked as read. Please try again.', 'error');
    } finally {
      if (readerId === accountId.current) {
        onRead?.();
        // Reconcile after the update so anything arriving meanwhile stays unread.
        await fetchData();
        if (readerId === accountId.current) {
          readingRef.current = false;
          setReading(false);
        }
      }
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
    const readerId = accountId.current;
    haptics.light();
    const destination = item.destination || notificationDestination(item);
    if (destination) nav.navigate(destination.name, destination.params);

    if (!item.isRead) {
      try {
        await readActivity(api, { ...item, id: item.readId || item.id });
        if (readerId !== accountId.current) return;
        requestVersion.current += 1;
        setIsRefreshing(false);
        setIsLoadingMore(false);
        const readIds = new Set(item.notificationIds || [item.id]);
        activityRecords.current = activityRecords.current.map(record =>
          (record.notificationIds || [record.id]).every(id => readIds.has(id)) ? { ...record, isRead: true } : record);
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
        accessibilityLabel={item.exchange ? [item.title, item.body].filter(Boolean).join('. ') : item.title}
        haptic={null}
      >
        <View style={styles.iconContainer}>
          {item.exchange ? (
            <ShimmerImage source={item.exchange.listing?.photoUrl ? { uri: item.exchange.listing.photoUrl } : null}
              placeholderIcon={listingIcon(item.exchange)}
              style={styles.notifAvatar} />
          ) : item.fromUser?.profilePhotoUrl ? (
            <Image
              source={{ uri: item.fromUser.profilePhotoUrl }}
              style={styles.notifAvatar}
            />
          ) : (
            <NotificationIcon notification={item} />
          )}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={[styles.name, !item.isRead && styles.nameUnread]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.time}>{getTimeAgo(item.createdAt)}</Text>
          </View>
          <Text style={[styles.lastMessage, item.queueListingId && {color:COLORS.primary,fontWeight:'400'}]} numberOfLines={3}>{item.body}</Text>
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
        onPress={() => item.kind === 'community' ? nav.navigate('CommunityChat', { communityId: item.communityId, communityName: item.name }) : nav.navigate('Chat', { conversationId: item.id })}
        haptic="light"
      >
        <View style={styles.avatarContainer}>
          <ShimmerImage placeholderIcon={item.kind === 'community' ? 'people' : 'person'}
            source={{ uri: item.photoUrl || item.otherUser?.profilePhotoUrl || null }}
            style={styles.avatar}
          />

        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:5}}>
              <Text style={[styles.name, {flex:undefined,flexShrink:1}, item.unreadCount > 0 && styles.nameUnread]} numberOfLines={1}>
                {item.kind === 'community' ? item.name : [item.otherUser?.firstName, item.otherUser?.lastName].filter(Boolean).join(' ')}
              </Text>
              {item.otherUser?.isVerified === true && <VerifiedBadge size={16} />}
            </View>
            <Text style={styles.time}>{getTimeAgo(item.lastMessageAt)}</Text>
          </View>
          <Text
            style={[styles.lastMessage, item.unreadCount > 0 && styles.lastMessageUnread]}
            numberOfLines={1}
          >
            {messagePresentation(item.lastMessage).text || (item.lastMessage ? 'Shared a post' : 'No messages yet')}
          </Text>
        </View>
        {item.unreadCount > 0 && <View style={styles.unreadDot} accessibilityLabel="Unread conversation" />}
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
            {reading ? <ActivityIndicator color={COLORS.spinner} size="small" />
              : <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.primary} />}
          </HapticPressable>
        </View>
      }>
        <SegmentedControl
          testID="Inbox.segment"
          variant="underline"
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
              tintColor={COLORS.spinner}
              colors={[COLORS.spinner]}
            />
          }
          ListHeaderComponent={
            <>
              {(loadError.activity || loadError.exchanges) && renderRetry(loadError.activity && loadError.exchanges ? 'Couldn’t refresh activity and exchanges.' : loadError.activity ? 'Couldn’t refresh activity.' : 'Couldn’t refresh exchanges.')}
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
              <Text style={styles.emptyTitle}>{loadError.activity ? 'Activity is unavailable' : unreadOnly ? 'No unread activity' : 'All caught up!'}</Text>
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
              tintColor={COLORS.spinner}
              colors={[COLORS.spinner]}
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
    fontWeight: '400',
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
    borderRadius: 26,
    backgroundColor: COLORS.surfaceElevated,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '400',
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
    fontWeight: '400',
    color: COLORS.text,
    flex: 1,
  },
  nameUnread: {
    fontFamily: 'DMSans_500Medium',
    fontWeight: '500',
  },
  time: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
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
    fontFamily: 'DMSans_500Medium',
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
