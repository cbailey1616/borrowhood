import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import AnimatedCard from '../components/AnimatedCard';
import ActionSheet from '../components/ActionSheet';
import { haptics } from '../utils/haptics';

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
  default: 'notifications',
};

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMarkAllSheet, setShowMarkAllSheet] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchNotifications();
    });
    return unsubscribe;
  }, [navigation, fetchNotifications]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchNotifications();
  };

  const handleMarkRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      haptics.success();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      haptics.error();
    }
  };

  const handleNotificationPress = (notification) => {
    if (!notification.isRead) {
      handleMarkRead(notification.id);
    }
    haptics.light();

    // Navigate based on notification type
    if (notification.type === 'new_message') {
      if (notification.conversationId) {
        navigation.navigate('Chat', { conversationId: notification.conversationId });
      } else {
        navigation.navigate('Conversations');
      }
      return;
    } else if (notification.type === 'new_request' && notification.requestId) {
      navigation.navigate('RequestDetail', { id: notification.requestId });
    } else if (notification.type === 'friend_request' || notification.type === 'friend_accepted') {
      navigation.navigate('Friends');
    } else if (notification.transactionId) {
      navigation.navigate('TransactionDetail', { id: notification.transactionId });
    } else if (notification.listingId) {
      navigation.navigate('ListingDetail', { id: notification.listingId });
    } else if (notification.type === 'item_match' && notification.requestId) {
      navigation.navigate('RequestDetail', { id: notification.requestId });
    }
  };

  const getTimeAgo = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const renderItem = ({ item, index }) => (
    <AnimatedCard index={index}>
      <HapticPressable
        style={[styles.card, !item.isRead && styles.cardUnread]}
        onPress={() => handleNotificationPress(item)}
        haptic={null}
      >
        <View style={[styles.iconContainer, !item.isRead && styles.iconContainerUnread]}>
          <Ionicons
            name={NOTIFICATION_ICONS[item.type] || NOTIFICATION_ICONS.default}
            size={20}
            color={!item.isRead ? COLORS.primary : COLORS.gray[400]}
          />
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.title, !item.isRead && styles.titleUnread]}>
            {item.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
          <Text style={styles.time}>{getTimeAgo(item.createdAt)}</Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </HapticPressable>
    </AnimatedCard>
  );

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.header}>
          <Text style={styles.unreadLabel}>{unreadCount} unread</Text>
          <HapticPressable
            onPress={() => setShowMarkAllSheet(true)}
            haptic="light"
          >
            <Text style={styles.markAllRead}>Mark all read</Text>
          </HapticPressable>
        </View>
      )}

      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={64} color={COLORS.gray[300]} />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptySubtitle}>
                You'll be notified about borrow requests and updates
              </Text>
            </View>
          )
        }
      />

      <ActionSheet
        isVisible={showMarkAllSheet}
        onClose={() => setShowMarkAllSheet(false)}
        title="Mark All Read"
        message={`Mark all ${unreadCount} notifications as read?`}
        actions={[
          {
            label: 'Mark All as Read',
            onPress: handleMarkAllRead,
          },
        ]}
        cancelLabel="Cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  unreadLabel: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.text,
  },
  markAllRead: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '500',
    color: COLORS.primary,
  },
  listContent: {
    padding: SPACING.lg,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    alignItems: 'flex-start',
    gap: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.separator,
  },
  cardUnread: {
    backgroundColor: COLORS.primary + '08',
    borderColor: COLORS.primary + '20',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerUnread: {
    backgroundColor: COLORS.primary + '20',
  },
  cardContent: {
    flex: 1,
  },
  title: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  titleUnread: {
    fontWeight: '600',
    color: COLORS.text,
  },
  body: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  time: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: SPACING.xs + 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
});
