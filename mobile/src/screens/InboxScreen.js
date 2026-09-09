import ShimmerImage from '../components/ShimmerImage';
import { isTransferListing, isSaleListing } from '../utils/directFee';
import { publicReplyRoute } from '../utils/conversationContext';
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
import LayeredCard from '../components/LayeredCard';
import SegmentedControl from '../components/SegmentedControl';
import NativeHeader from '../components/NativeHeader';
import { SkeletonListItem } from '../components/SkeletonLoader';
import { haptics } from '../utils/haptics';
import api from '../services/api';
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

    const publicRoute = publicReplyRoute(item);
    if (publicRoute) { nav.navigate('ListingDiscussion', publicRoute); return; }
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
      if (item.communityId) nav.navigate('CommunityMembers', { id: item.communityId });
      else nav.navigate('MyCommunity');
    } else if (item.type === 'join_approved') {
      nav.navigate('MyCommunity');
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
    <LayeredCard style={styles.cardDepth} stacked={false}>
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
          {!!publicReplyRoute(item) && <Text style={styles.listingText}>Comment on a post</Text>}
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </HapticPressable>
    </LayeredCard>
  );

  const renderConversation = ({ item, index }) => (
    <LayeredCard style={styles.cardDepth} stacked={false}>
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
            <Text style={[styles.name, item.unreadCount > 0 && styles.nameUnread]} numberOfLines={1}>
              {item.otherUser?.firstName} {item.otherUser?.lastName}
            </Text>
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
              {activeBorrows.length > 0 && <View style={{ gap: SPACING.sm, marginBottom: SPACING.lg }}>
                <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>Active exchanges</Text>
                {activeBorrows.map(transaction => {
                  const other = transaction.isBorrower ? transaction.lender : transaction.borrower;
                  return <HapticPressable key={transaction.id} accessibilityRole="button" accessibilityLabel={`View exchange for ${transaction.listing?.title || 'item'}`}
                    onPress={() => nav.navigate('TransactionDetail', { id: transaction.id })}
                    style={{ padding: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryMuted, flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                    <Ionicons name={isSaleListing(transaction) ? 'pricetag' : isTransferListing(transaction) ? 'gift' : 'basket'} size={32} illustrated />
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>{transaction.listing?.title || 'Shared item'}</Text>
                      <Text style={{ color: COLORS.textSecondary }}>With {other?.firstName || 'your neighbor'}</Text>
                      <Text style={{ color: COLORS.primary, marginTop: 4 }}>View details</Text>
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
              <Text style={styles.emptyTitle}>{loadError ? 'Couldn’t load activity' : activeBorrows.length ? 'No new updates' : 'All caught up!'}</Text>
              <Text style={styles.emptySubtitle}>
                {loadError ? 'Check your connection and pull down to retry.' : 'Requests, replies and pickup updates will appear here.'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={conversations}
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
