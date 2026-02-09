import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  Animated as RNAnimated,
  InteractionManager,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import AnimatedCard from '../components/AnimatedCard';
import SegmentedControl from '../components/SegmentedControl';
import NativeHeader from '../components/NativeHeader';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function MyItemsScreen({ navigation }) {
  const { showError } = useError();
  const [activeTab, setActiveTab] = useState(0);
  const [listings, setListings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const swipeableRefs = useRef({});

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const isItems = activeTab === 0;

  const fetchData = useCallback(async () => {
    try {
      if (isItems) {
        const data = await api.getMyListings();
        setListings(data);
      } else {
        const data = await api.getMyRequests();
        setRequests(data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isItems]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Delay fetch until modal dismiss animation completes
      InteractionManager.runAfterInteractions(() => {
        fetchData();
      });
    });
    return unsubscribe;
  }, [navigation, fetchData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const handleSwipeDelete = async (item, type) => {
    haptics.warning();
    try {
      if (type === 'listing') {
        await api.deleteListing(item.id);
        setListings(prev => prev.filter(l => l.id !== item.id));
      } else {
        await api.deleteRequest(item.id);
        setRequests(prev => prev.filter(r => r.id !== item.id));
      }
      haptics.success();
    } catch (error) {
      haptics.error();
      swipeableRefs.current[item.id]?.close();
      showError({
        message: error.message || 'Unable to delete. Please check your connection and try again.',
        type: 'network',
      });
    }
  };

  const renderRightActions = (progress, dragX, onDelete) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });

    return (
      <HapticPressable
        style={styles.deleteAction}
        onPress={onDelete}
        haptic="warning"
      >
        <RNAnimated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash-outline" size={24} color="#fff" />
          <Text style={styles.deleteActionText}>Delete</Text>
        </RNAnimated.View>
      </HapticPressable>
    );
  };

  const renderListingItem = ({ item, index }) => (
    <AnimatedCard index={index}>
      <Swipeable
        ref={ref => { swipeableRefs.current[item.id] = ref; }}
        renderRightActions={(progress, dragX) =>
          renderRightActions(progress, dragX, () => handleSwipeDelete(item, 'listing'))
        }
        onSwipeableOpen={(direction) => {
          if (direction === 'right') handleSwipeDelete(item, 'listing');
        }}
      >
        <HapticPressable
          style={styles.card}
          onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
          haptic="light"
        >
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.cardImage} />
          ) : (
            <View style={[styles.cardImage, styles.imagePlaceholder]}>
              <Ionicons name="image-outline" size={28} color={COLORS.gray[500]} />
            </View>
          )}
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.cardCondition}>{CONDITION_LABELS[item.condition]}</Text>

            <View style={styles.cardStats}>
              <View style={styles.stat}>
                <Ionicons name="swap-horizontal" size={14} color={COLORS.gray[400]} />
                <Text style={styles.statText}>{item.timesBorrowed} borrows</Text>
              </View>
              {item.totalEarnings > 0 && (
                <View style={styles.stat}>
                  <Ionicons name="cash" size={14} color={COLORS.secondary} />
                  <Text style={[styles.statText, { color: COLORS.secondary }]}>
                    ${item.totalEarnings.toFixed(0)} earned
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.cardFooter}>
              <View style={[
                styles.statusBadge,
                { backgroundColor: item.isAvailable ? COLORS.secondaryMuted : COLORS.warningMuted }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: item.isAvailable ? COLORS.secondary : COLORS.warning }
                ]}>
                  {item.isAvailable ? 'Available' : 'Borrowed'}
                </Text>
              </View>
              {item.pendingRequests > 0 && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingText}>{item.pendingRequests} pending</Text>
                </View>
              )}
            </View>
          </View>
        </HapticPressable>
      </Swipeable>
    </AnimatedCard>
  );

  const handleRenew = async (requestId) => {
    try {
      await api.renewRequest(requestId);
      haptics.success();
      fetchData();
    } catch (error) {
      haptics.error();
      showError({
        message: error.message || 'Unable to renew request. Please try again.',
        type: 'network',
      });
    }
  };

  const renderRequestItem = ({ item, index }) => (
    <AnimatedCard index={index}>
      <Swipeable
        ref={ref => { swipeableRefs.current[item.id] = ref; }}
        renderRightActions={(progress, dragX) =>
          renderRightActions(progress, dragX, () => handleSwipeDelete(item, 'request'))
        }
        onSwipeableOpen={(direction) => {
          if (direction === 'right') handleSwipeDelete(item, 'request');
        }}
      >
        <HapticPressable
          style={styles.requestCard}
          onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
          haptic="light"
        >
          <View style={styles.requestHeader}>
            <Text style={styles.requestTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.requestBadges}>
              {item.type === 'service' && (
                <View style={styles.serviceBadge}>
                  <Text style={styles.serviceBadgeText}>Service</Text>
                </View>
              )}
              {item.isExpired && (
                <View style={styles.expiredBadge}>
                  <Text style={styles.expiredBadgeText}>Expired</Text>
                </View>
              )}
              <View style={[
                styles.requestStatusBadge,
                { backgroundColor: item.status === 'open' ? COLORS.secondaryMuted : COLORS.surfaceElevated }
              ]}>
                <Text style={[
                  styles.requestStatusText,
                  { color: item.status === 'open' ? COLORS.secondary : COLORS.textSecondary }
                ]}>
                  {item.status === 'open' ? 'Open' : 'Closed'}
                </Text>
              </View>
            </View>
          </View>

          {item.description && (
            <Text style={styles.requestDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          {(item.neededFrom || item.neededUntil) && (
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.dateText}>
                {item.neededFrom && new Date(item.neededFrom).toLocaleDateString()}
                {item.neededFrom && item.neededUntil && ' - '}
                {item.neededUntil && new Date(item.neededUntil).toLocaleDateString()}
              </Text>
            </View>
          )}

          <View style={styles.requestFooter}>
            <Text style={styles.requestDate}>
              Posted {new Date(item.createdAt).toLocaleDateString()}
            </Text>
            {item.isExpired && item.status === 'open' && (
              <HapticPressable
                style={styles.renewButton}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleRenew(item.id);
                }}
                haptic="medium"
              >
                <Ionicons name="refresh" size={14} color={COLORS.primary} />
                <Text style={styles.renewButtonText}>Renew</Text>
              </HapticPressable>
            )}
          </View>
        </HapticPressable>
      </Swipeable>
    </AnimatedCard>
  );

  const data = isItems ? listings : requests;

  return (
    <View style={styles.container}>
      <NativeHeader title="My Items" scrollY={scrollY}>
        <SegmentedControl
          testID="MyItems.segment"
          segments={['My Items', 'My Requests']}
          selectedIndex={activeTab}
          onIndexChange={setActiveTab}
          style={styles.segmented}
        />
      </NativeHeader>

      <AnimatedFlatList
        data={data}
        renderItem={isItems ? renderListingItem : renderRequestItem}
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
          !isLoading && (
            <View style={styles.emptyContainer}>
              <Ionicons
                name={isItems ? 'construct-outline' : 'search-outline'}
                size={64}
                color={COLORS.gray[700]}
              />
              <Text style={styles.emptyTitle}>
                {isItems ? 'No items yet' : 'No requests yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {isItems
                  ? 'List your first tool to start lending!'
                  : 'Post a request when you need to borrow something'}
              </Text>
              <HapticPressable
                style={styles.addButton}
                onPress={() => navigation.navigate(isItems ? 'CreateListing' : 'CreateRequest')}
                haptic="medium"
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.addButtonText}>
                  {isItems ? 'List an Item' : 'Post a Request'}
                </Text>
              </HapticPressable>
            </View>
          )
        }
        ListHeaderComponent={
          data.length > 0 && (
            <HapticPressable
              style={styles.headerButton}
              onPress={() => navigation.navigate(isItems ? 'CreateListing' : 'CreateRequest')}
              haptic="light"
            >
              <Ionicons name="add-circle" size={24} color={COLORS.primary} />
              <Text style={styles.headerButtonText}>
                {isItems ? 'List a new item' : 'Post a new request'}
              </Text>
            </HapticPressable>
          )
        }
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  segmented: {
    marginTop: SPACING.sm,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  headerButtonText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.primary,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  cardImage: {
    width: 100,
    height: 100,
    backgroundColor: COLORS.gray[700],
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  cardCondition: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  cardStats: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  statusText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
  },
  pendingBadge: {
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  pendingText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.primary,
  },
  requestCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  requestTitle: {
    flex: 1,
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginRight: SPACING.md,
  },
  requestBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  serviceBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  serviceBadgeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.primary,
  },
  expiredBadge: {
    backgroundColor: COLORS.textMuted + '30',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  expiredBadgeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  requestStatusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  requestStatusText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  requestDescription: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.sm,
  },
  dateText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  requestFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  renewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.sm,
    gap: SPACING.xs,
  },
  renewButtonText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.primary,
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
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xl,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  addButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.headline,
  },
  deleteAction: {
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  deleteActionText: {
    color: '#fff',
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
});
