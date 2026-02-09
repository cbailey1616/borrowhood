import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  ActivityIndicator,
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
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function InboxScreen({ navigation, badgeCounts, onRead }) {
  const [activeTab, setActiveTab] = useState(0);
  const [conversations, setConversations] = useState([]);
  const [activities, setActivities] = useState([]);
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
      const [convData, actData] = await Promise.all([
        api.getConversations(),
        api.getTransactions(),
      ]);
      setConversations(convData || []);
      setActivities(actData || []);
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

  const isActionNeeded = (item) => {
    if (!item.isBorrower && item.status === 'pending') return true;
    if (item.isBorrower && item.status === 'approved') return true;
    if (!item.isBorrower && item.status === 'return_pending') return true;
    return false;
  };

  const renderConversation = ({ item, index }) => (
    <AnimatedCard index={index}>
      <HapticPressable
        style={styles.card}
        onPress={() => navigation.navigate('Chat', { conversationId: item.id })}
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return COLORS.warning;
      case 'approved':
      case 'paid':
      case 'picked_up': return COLORS.primary;
      case 'completed':
      case 'returned': return COLORS.success;
      case 'cancelled':
      case 'disputed': return COLORS.danger;
      default: return COLORS.textMuted;
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: 'Pending',
      approved: 'Approved',
      paid: 'Paid',
      picked_up: 'Borrowed',
      return_pending: 'Returning',
      returned: 'Returned',
      completed: 'Completed',
      cancelled: 'Cancelled',
      disputed: 'Disputed',
    };
    return labels[status] || status;
  };

  const renderActivity = ({ item, index }) => (
    <AnimatedCard index={index}>
      <HapticPressable
        style={styles.card}
        onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}
        haptic="light"
      >
        <Image
          source={{ uri: item.listing?.photoUrl || 'https://via.placeholder.com/50' }}
          style={styles.itemImage}
        />
        <View style={styles.cardContent}>
          <Text style={styles.name} numberOfLines={1}>{item.listing?.title}</Text>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {!item.isBorrower ? `To: ${item.borrower?.firstName}` : `From: ${item.lender?.firstName}`}
          </Text>
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
            {isActionNeeded(item) && (
              <View style={[styles.statusBadge, { backgroundColor: COLORS.warningMuted }]}>
                <Text style={[styles.statusText, { color: COLORS.warning }]}>
                  Action needed
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.time}>{getTimeAgo(item.updatedAt)}</Text>
      </HapticPressable>
    </AnimatedCard>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <NativeHeader title="Inbox" scrollY={scrollY} />
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
      <NativeHeader title="Inbox" scrollY={scrollY}>
        <SegmentedControl
          testID="Inbox.segment"
          segments={[
            `Messages${badgeCounts?.messages > 0 ? ` (${badgeCounts.messages})` : ''}`,
            `Activity${badgeCounts?.actions > 0 ? ` (${badgeCounts.actions})` : ''}`,
          ]}
          selectedIndex={activeTab}
          onIndexChange={setActiveTab}
          style={styles.segmented}
        />
      </NativeHeader>

      {activeTab === 0 ? (
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
      ) : (
        <AnimatedFlatList
          data={activities}
          renderItem={renderActivity}
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
              <Ionicons name="swap-horizontal-outline" size={56} color={COLORS.gray[600]} />
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptySubtitle}>
                Your borrow requests and transactions will appear here
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
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.gray[700],
  },
  itemImage: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray[700],
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
  badgeRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  statusText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
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
