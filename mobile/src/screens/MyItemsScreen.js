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
import { COLORS, CONDITION_LABELS, TRANSACTION_STATUS_LABELS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const STATUS_COLORS = {
  pending: COLORS.warning,
  approved: COLORS.primary,
  paid: COLORS.primary,
  picked_up: COLORS.secondary,
  return_pending: COLORS.warning,
  returned: COLORS.secondary,
  disputed: COLORS.danger,
};

export default function MyItemsScreen({ navigation }) {
  const { showError } = useError();
  const [activeTab, setActiveTab] = useState(0);
  const [listings, setListings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const swipeableRefs = useRef({});

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const fetchData = useCallback(async () => {
    try {
      if (activeTab === 0) {
        const data = await api.getMyListings();
        setListings(data);
      } else if (activeTab === 1) {
        const data = await api.getTransactions();
        // Filter to active only (not completed/cancelled)
        setRentals(data.filter(t => !['completed', 'cancelled'].includes(t.status)));
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
  }, [activeTab]);

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

  const getTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now - new Date(date);
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const renderRentalItem = ({ item, index }) => {
    const otherParty = item.isBorrower ? item.lender : item.borrower;
    const statusColor = STATUS_COLORS[item.status] || COLORS.textSecondary;

    return (
      <AnimatedCard index={index}>
        <HapticPressable
          style={styles.rentalCard}
          onPress={() => navigation.getParent()?.navigate('TransactionDetail', { id: item.id })
            || navigation.navigate('TransactionDetail', { id: item.id })}
          haptic="light"
        >
          <View style={styles.rentalTop}>
            {item.listing.photoUrl ? (
              <Image source={{ uri: item.listing.photoUrl }} style={styles.rentalImage} />
            ) : (
              <View style={[styles.rentalImage, styles.imagePlaceholder]}>
                <Ionicons name="image-outline" size={22} color={COLORS.gray[500]} />
              </View>
            )}
            <View style={styles.rentalInfo}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.title}</Text>
              <View style={styles.rentalPartyRow}>
                <Ionicons
                  name={item.isBorrower ? 'arrow-down-circle' : 'arrow-up-circle'}
                  size={14}
                  color={item.isBorrower ? COLORS.primary : COLORS.secondary}
                />
                <Text style={styles.rentalPartyText}>
                  {item.isBorrower ? 'Borrowing from' : 'Lending to'}{' '}
                  {otherParty.firstName} {otherParty.lastName?.[0]}.
                </Text>
              </View>
              <View style={styles.rentalDateRow}>
                <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.rentalDateText}>
                  {new Date(item.startDate).toLocaleDateString()} — {new Date(item.endDate).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </View>
          <View style={styles.rentalBottom}>
            <View style={[styles.rentalStatusBadge, { backgroundColor: statusColor + '20' }]}>
              <View style={[styles.rentalStatusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.rentalStatusText, { color: statusColor }]}>
                {TRANSACTION_STATUS_LABELS[item.status] || item.status}
              </Text>
            </View>
            {item.rentalFee > 0 && (
              <Text style={styles.rentalFeeText}>${item.rentalFee.toFixed(2)}</Text>
            )}
          </View>
        </HapticPressable>
      </AnimatedCard>
    );
  };

  const data = activeTab === 0 ? listings : activeTab === 1 ? rentals : requests;
  const emptyIcon = activeTab === 0 ? 'construct-outline' : activeTab === 1 ? 'swap-horizontal-outline' : 'search-outline';
  const emptyTitle = activeTab === 0 ? 'No items yet' : activeTab === 1 ? 'No active rentals' : 'No requests yet';
  const emptySubtitle = activeTab === 0
    ? 'List your first item to start lending!'
    : activeTab === 1
    ? 'Your active borrows and lends will show up here'
    : 'Post a request when you need to borrow something';

  return (
    <View style={styles.container}>
      <NativeHeader title="My Items" scrollY={scrollY}>
        <SegmentedControl
          testID="MyItems.segment"
          segments={['Items', 'Active', 'Requests']}
          selectedIndex={activeTab}
          onIndexChange={setActiveTab}
          style={styles.segmented}
        />
      </NativeHeader>

      <AnimatedFlatList
        data={data}
        renderItem={activeTab === 0 ? renderListingItem : activeTab === 1 ? renderRentalItem : renderRequestItem}
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
                name={emptyIcon}
                size={64}
                color={COLORS.gray[700]}
              />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
              {activeTab !== 1 && (
                <HapticPressable
                  style={styles.addButton}
                  onPress={() => navigation.navigate(activeTab === 0 ? 'CreateListing' : 'CreateRequest')}
                  haptic="medium"
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.addButtonText}>
                    {activeTab === 0 ? 'List an Item' : 'Post a Request'}
                  </Text>
                </HapticPressable>
              )}
            </View>
          )
        }
        ListHeaderComponent={
          data.length > 0 && activeTab !== 1 && (
            <HapticPressable
              style={styles.headerButton}
              onPress={() => navigation.navigate(activeTab === 0 ? 'CreateListing' : 'CreateRequest')}
              haptic="light"
            >
              <Ionicons name="add-circle" size={24} color={COLORS.primary} />
              <Text style={styles.headerButtonText}>
                {activeTab === 0 ? 'List a new item' : 'Post a new request'}
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
  rentalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  rentalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  rentalImage: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray[700],
  },
  rentalInfo: {
    flex: 1,
    gap: 3,
  },
  rentalPartyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  rentalPartyText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  rentalDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  rentalDateText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  rentalBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
    marginHorizontal: SPACING.md,
  },
  rentalStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
    gap: SPACING.xs,
  },
  rentalStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rentalStatusText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
  },
  rentalFeeText: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.text,
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
