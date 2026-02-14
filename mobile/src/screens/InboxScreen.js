import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  InteractionManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import AnimatedCard from '../components/AnimatedCard';
import SegmentedControl from '../components/SegmentedControl';
import NativeHeader from '../components/NativeHeader';
import { SkeletonListItem } from '../components/SkeletonLoader';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const NOTIFICATION_ICONS = {
  borrow_request: 'hand-left',
  request_approved: 'checkmark-circle',
  request_declined: 'close-circle',
  payment_confirmed: 'card',
  pickup_confirmed: 'cube',
  return_confirmed: 'checkbox',
  return_reminder: 'alarm',
  dispute_opened: 'warning',
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
};

export default function InboxScreen({ navigation, badgeCounts, onRead }) {
  const [activeTab, setActiveTab] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const fetchData = useCallback(async () => {
    try {
      const [notifData, convData] = await Promise.all([
        api.getNotifications(),
        api.getConversations(),
      ]);
      setNotifications(notifData?.notifications || []);
      setConversations(convData || []);
    } catch (error) {
      console.error('Failed to fetch inbox data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      InteractionManager.runAfterInteractions(() => {
        fetchData();
        if (onRead) onRead();
      });
    }, [fetchData, onRead])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData();
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
      } catch (e) {}
    }

    if (item.type === 'new_message') {
      if (item.conversationId) {
        nav.navigate('Chat', { conversationId: item.conversationId });
      } else {
        // Fallback for notifications without conversationId - switch to Messages tab
        setActiveTab(1);
      }
      return;
    } else if (item.type === 'friend_request' || item.type === 'friend_accepted') {
      nav.navigate('Friends');
    } else if (item.type === 'new_request' && item.requestId) {
      nav.navigate('RequestDetail', { id: item.requestId });
    } else if (item.transactionId) {
      nav.navigate('TransactionDetail', { id: item.transactionId });
    } else if (item.listingId) {
      nav.navigate('ListingDetail', { id: item.listingId });
    } else if (item.type === 'item_match' && item.requestId) {
      nav.navigate('RequestDetail', { id: item.requestId });
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
        <NativeHeader title="Activity" scrollY={scrollY} />
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
      <NativeHeader title="Activity" scrollY={scrollY}>
        <SegmentedControl
          testID="Inbox.segment"
          segments={[
            `Activity${badgeCounts?.notifications > 0 ? ` (${badgeCounts.notifications})` : ''}`,
            `Messages${badgeCounts?.messages > 0 ? ` (${badgeCounts.messages})` : ''}`,
          ]}
          selectedIndex={activeTab}
          onIndexChange={setActiveTab}
          style={styles.segmented}
        />
      </NativeHeader>

      {activeTab === 0 ? (
        <AnimatedFlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
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
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-outline" size={56} color={COLORS.gray[600]} />
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptySubtitle}>
                Friend requests, borrow updates, and notifications will appear here
              </Text>
            </View>
          }
        />
      ) : (
        <AnimatedFlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
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
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={56} color={COLORS.gray[600]} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>
                Start a conversation by messaging someone about their item
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
  },
  cardUnread: {
    backgroundColor: COLORS.primary + '08',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.gray[700],
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    borderRadius: 22,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#E53935',
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
});
