import { useState, useCallback } from 'react';
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
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '../components/Icon';
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
import AnimatedCard from '../components/AnimatedCard';
import SegmentedControl from '../components/SegmentedControl';
import NativeHeader from '../components/NativeHeader';
import { SkeletonListItem } from '../components/SkeletonLoader';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { exchangeAction } from '../utils/chatExchange';
import { useAuth } from '../context/AuthContext';
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
  join_approved: 'people',
  item_match: 'sparkles',
  new_request: 'search',
  new_message: 'chatbubble',
  friend_request: 'person-add',
  friend_accepted: 'people',
  referral_joined: 'gift',
  referral_reward: 'trophy',
  payment_failed: 'card',
};

export default function InboxScreen({ navigation, badgeCounts, onRead }) {
  const { user } = useAuth();
  const [activeBorrows, setActiveBorrows] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notifsDenied, setNotifsDenied] = useState(false);


  const checkNotifPermission = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const { status } = await Notifications.getPermissionsAsync();
    setNotifsDenied(status !== 'granted');
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [notifData, convData, transactions] = await Promise.all([
        api.getNotifications(),
        api.getConversations(),
        api.getTransactions(),
      ]);
      setNotifications((notifData?.notifications || []).filter(n => !n.disputeId && !n.type?.startsWith('dispute') && !['new_message', 'referral_reward', 'subscription_expired', 'verification_expiring'].includes(n.type)));
      setConversations(convData || []);
      setActiveBorrows((transactions || []).filter(t => ['pending', 'approved', 'paid', 'picked_up', 'return_pending'].includes(t.status)));
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        fetchData();
        checkNotifPermission();
        if (onRead) onRead();
        // Clear iOS badge when viewing activity
        Notifications.setBadgeCountAsync(0).catch(() => {});
        Notifications.dismissAllNotificationsAsync().catch(() => {});
      });
      const timer = setInterval(fetchData, 10000);
      return () => { task.cancel(); clearInterval(timer); };
    }, [fetchData, checkNotifPermission, onRead])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      haptics.success();
      if (onRead) onRead();
    } catch (e) {
      haptics.error();
    }
  };

  const getTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(date).toLocaleDateString();
  };

  // Navigate to parent stack for detail screens
  const nav = navigation.getParent() || navigation;

  const handleNotificationPress = async (item) => {
    haptics.light();

    if (!item.isRead) {
      try {
        await api.markNotificationRead(item.id);
        setNotifications(prev =>
          prev.map(n => n.id === item.id ? { ...n, isRead: true } : n)
        );
        onRead?.();
      } catch (e) {}
    }

    if (item.type === 'new_message') {
      if (item.conversationId) {
        nav.navigate('Chat', { conversationId: item.conversationId });
      } else {
        // Fallback for notifications without conversationId - switch to Messages tab
        setActiveTab(0);
      }
      return;
    } else if (item.type === 'friend_request' || item.type === 'friend_accepted') {
      nav.navigate('Friends');
    } else if (item.type === 'new_request' && item.requestId) {
      nav.navigate('RequestDetail', { id: item.requestId });
    } else if (item.type === 'join_request') {
      nav.navigate('CommunityMembers');
    } else if (item.type === 'join_approved') {
      nav.navigate('MyCommunity');
    } else if (item.type === 'request_comment' && item.requestId) {
      nav.navigate('RequestDetail', { id: item.requestId });
    } else if (['listing_comment', 'discussion_reply'].includes(item.type) && item.listingId) {
      nav.navigate('ListingDiscussion', { listingId: item.listingId });
    } else if (['new_rating', 'rating_received'].includes(item.type) && !item.transactionId) {
      nav.navigate('UserProfile', { id: user?.id });
    } else if (item.disputeId) {
      return;
    } else if (item.transactionId) {
      nav.navigate('TransactionDetail', { id: item.transactionId });
    } else if (item.listingId) {
      nav.navigate('ListingDetail', { id: item.listingId });
    } else if (item.type === 'item_match' && item.requestId) {
      nav.navigate('RequestDetail', { id: item.requestId });
    } else if (item.type === 'payment_failed') {
      nav.navigate('SetupPayout');
    } else if (['borrow_request', 'request_approved', 'request_declined', 'pickup_confirmed',
      'return_confirmed', 'payment_confirmed', 'dispute_opened', 'dispute_resolved'].includes(item.type)) {
      navigation.navigate('MyItems');
    }
  };

  const renderNotification = ({ item, index }) => (
    <AnimatedCard index={index}>
      <HapticPressable
        style={[styles.card, !item.isRead && styles.cardUnread]}
        onPress={() => handleNotificationPress(item)}
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
              name={NOTIFICATION_ICONS[item.type] || 'notifications'}
              size={20}
              color={!item.isRead ? COLORS.primary : COLORS.gray[400]}
            />
          )}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={[styles.name, !item.isRead && styles.nameUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.time}>{getTimeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.lastMessage} numberOfLines={2}>{item.body}</Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </HapticPressable>
    </AnimatedCard>
  );

  const renderConversation = ({ item, index }) => (
    <AnimatedCard index={index}>
      <HapticPressable
        style={styles.card}
        onPress={() => nav.navigate('Chat', { conversationId: item.id })}
        haptic="light"
      >
        <View style={styles.avatarContainer}>
          <Image
            source={{ uri: item.otherUser?.profilePhotoUrl || 'https://via.placeholder.com/50' }}
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
            <Text style={[styles.name, item.unreadCount > 0 && styles.nameUnread]} numberOfLines={1}>
              {item.otherUser?.firstName} {item.otherUser?.lastName}
            </Text>
            <Text style={styles.time}>{getTimeAgo(item.lastMessageAt)}</Text>
          </View>
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
    </AnimatedCard>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <NativeHeader title="Inbox" />
        <View style={styles.skeletonContainer}>
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NativeHeader title="Inbox">
        <SegmentedControl
          testID="Inbox.segment"
          segments={[
            `Messages${badgeCounts?.messages > 0 ? ` (${badgeCounts.messages})` : ''}`,
            `Activity${badgeCounts?.notifications > 0 ? ` (${badgeCounts.notifications})` : ''}`,
          ]}
          selectedIndex={activeTab}
          onIndexChange={setActiveTab}
          style={styles.segmented}
        />
      </NativeHeader>

      {activeTab === 1 ? (
        <FlatList
          data={notifications}
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
              {unreadCount > 0 && (
                <View style={styles.markAllBar}>
                  <Text style={styles.markAllLabel}>{unreadCount} unread</Text>
                  <HapticPressable onPress={handleMarkAllRead} haptic="light">
                    <Text style={styles.markAllBtn}>Mark all read</Text>
                  </HapticPressable>
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <HeroIcon icon="notifications" size={80} />
              <Text style={styles.emptyTitle}>{loadError ? 'Couldn’t load activity' : 'All caught up!'}</Text>
              <Text style={styles.emptySubtitle}>
                {loadError ? 'Check your connection and pull down to retry.' : 'Requests, replies and pickup updates will appear here.'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={conversations}
          ListHeaderComponent={<View style={{ gap: SPACING.sm, marginBottom: SPACING.md }}>
            <HapticPressable accessibilityRole="button" onPress={() => navigation.navigate('TransactionHistory')} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: COLORS.primary }}>History</Text></HapticPressable>
            {activeBorrows.length > 0 && <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>Borrowing & lending</Text>}
            {activeBorrows.map(t => {
              const other = t.isBorrower ? t.lender : t.borrower;
              const existing = conversations.find(c => c.otherUser?.id === other?.id);
              return <HapticPressable key={t.id} accessibilityRole="button" style={{ padding: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryMuted }}
                onPress={() => other?.id ? navigation.navigate('Chat', { conversationId: existing?.id, recipientId: other.id, recipient: other, listingId: t.listing?.id, listing: t.listing }) : navigation.navigate('TransactionDetail', { id: t.id })}>
                <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>{t.listing?.title || 'Borrowing & lending'}</Text>
                <Text style={{ color: COLORS.textSecondary }}>{t.isBorrower ? 'Borrowing from' : 'Lending to'} {other?.firstName || 'your neighbor'}</Text>
                <Text style={{ color: COLORS.primary, marginTop: 6 }}>{exchangeAction(t, user?.id).label}</Text>
              </HapticPressable>;
            })}
          </View>}
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
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <HeroIcon icon="chatbubble" size={80} />
              <Text style={styles.emptyTitle}>{loadError ? 'Couldn’t load messages' : 'No messages yet'}</Text>
              <Text style={styles.emptySubtitle}>
                {loadError ? 'Check your connection and pull down to retry.' : 'Message a neighbor from an item or exchange to get started.'}
              </Text>
            </View>
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
  skeletonContainer: {
    padding: SPACING.lg,
  },
  segmented: {
    marginTop: SPACING.sm,
  },
  markAllBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  markAllLabel: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  markAllBtn: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.primary,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  cardUnread: {
    backgroundColor: COLORS.primaryMuted,
    borderColor: COLORS.borderGreenStrong,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
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
