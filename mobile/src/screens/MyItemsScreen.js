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
import ShimmerImage from '../components/ShimmerImage';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import AnimatedCard from '../components/AnimatedCard';
import SegmentedControl from '../components/SegmentedControl';
import NativeHeader from '../components/NativeHeader';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, TRANSACTION_STATUS_LABELS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

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


  const fetchData = useCallback(async () => {
    try {
      if (activeTab === 0) {
        const data = await api.getMyListings();
        setListings(data);
      } else if (activeTab === 1) {
        const data = await api.getTransactions();
        // Filter to active only (not completed/cancelled/giveaway-returned)
        setRentals(data.filter(t => {
          if (['completed', 'cancelled'].includes(t.status)) return false;
          // Giveaways go straight to 'returned' on pickup — they're done
          if (t.listingType === 'giveaway' && t.status === 'returned') return false;
          return true;
        }));
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
        message: error.message || 'Couldn\'t delete this item right now. Please check your connection and try again.',
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
            <ShimmerImage source={{ uri: item.photoUrl }} style={styles.cardImage} />
          ) : (
            <View style={[styles.cardImage, styles.imagePlaceholder]}>
              <Ionicons name="image-outline" size={28} color={COLORS.gray[500]} />
            </View>
          )}
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.cardSubRow}>
              <Text style={styles.cardCondition}>{CONDITION_LABELS[item.condition]}</Text>
              {item.listingType === 'giveaway' && (
                <View style={styles.giveawayTag}>
                  <Ionicons name="gift" size={10} color={COLORS.secondary} />
                  <Text style={styles.giveawayTagText}>Giveaway</Text>
                </View>
              )}
            </View>

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
                  {item.status === 'given_away' ? 'Claimed' : item.isAvailable ? 'Available' : 'Borrowed'}
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
        message: error.message || 'Couldn\'t renew your request right now. Please check your connection and try again.',
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
          style={[styles.requestCard, item.isExpired && styles.requestCardExpired]}
          onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
          haptic="light"
        >
          <View style={[styles.requestAccent, item.isExpired ? styles.requestAccentExpired : item.status === 'open' ? styles.requestAccentOpen : styles.requestAccentClosed]} />
          <View style={styles.requestContent}>
            <View style={styles.requestHeader}>
              <View style={styles.requestTitleRow}>
                <Ionicons
                  name={item.isExpired ? 'alert-circle' : item.status === 'open' ? 'time-outline' : 'checkmark-circle'}
                  size={18}
                  color={item.isExpired ? COLORS.danger : item.status === 'open' ? COLORS.warning : COLORS.textMuted}
                />
                <Text style={styles.requestTitle} numberOfLines={1}>{item.title}</Text>
              </View>
              <View style={styles.requestBadges}>
                {item.type === 'service' && (
                  <View style={styles.serviceBadge}>
                    <Text style={styles.serviceBadgeText}>Service</Text>
                  </View>
                )}
                <View style={[
                  styles.requestStatusBadge,
                  item.isExpired ? { backgroundColor: COLORS.dangerMuted }
                    : item.status === 'open' ? { backgroundColor: COLORS.warningMuted }
                    : { backgroundColor: COLORS.surfaceElevated }
                ]}>
                  <Text style={[
                    styles.requestStatusText,
                    item.isExpired ? { color: COLORS.danger }
                      : item.status === 'open' ? { color: COLORS.warning }
                      : { color: COLORS.textMuted }
                  ]}>
                    {item.isExpired ? 'Expired' : item.status === 'open' ? 'Active' : 'Closed'}
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
              <ShimmerImage source={{ uri: item.listing.photoUrl }} style={styles.rentalImage} />
            ) : (
              <View style={[styles.rentalImage, styles.imagePlaceholder]}>
                <Ionicons name="image-outline" size={22} color={COLORS.gray[500]} />
              </View>
            )}
            <View style={styles.rentalInfo}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.title}</Text>
              <View style={styles.rentalPartyRow}>
                <Ionicons
                  name={item.listingType === 'giveaway' ? 'gift' : item.isBorrower ? 'arrow-down-circle' : 'arrow-up-circle'}
                  size={14}
                  color={item.isBorrower ? COLORS.primary : COLORS.secondary}
                />
                <Text style={styles.rentalPartyText}>
                  {item.listingType === 'giveaway'
                    ? (item.isBorrower ? 'From' : 'Giving to')
                    : (item.isBorrower ? 'Borrowing from' : 'Lending to')}{' '}
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
  const emptyTitle = activeTab === 0 ? 'No items listed' : activeTab === 1 ? 'Nothing borrowed yet' : 'No wanted posts yet';
  const emptySubtitle = activeTab === 0
    ? 'Share your tools with the neighborhood'
    : activeTab === 1
    ? 'Your borrows and lends will show up here'
    : 'Post what you need and neighbors can offer to help';

  return (
    <View style={styles.container}>
      <NativeHeader title="My Items">
        <SegmentedControl
          testID="MyItems.segment"
          segments={['Listings', 'Borrowed', 'Wanted']}
          selectedIndex={activeTab}
          onIndexChange={setActiveTab}
          style={styles.segmented}
        />
      </NativeHeader>

      <FlatList
        data={data}
        renderItem={activeTab === 0 ? renderListingItem : activeTab === 1 ? renderRentalItem : renderRequestItem}
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
          !isLoading && (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                {activeTab === 0 ? (
                  <>
                    <Ionicons name="cube-outline" size={28} color={COLORS.primary} style={{ position: 'absolute', top: 16, left: 18 }} />
                    <Ionicons name="add-circle-outline" size={22} color={COLORS.primary} style={{ position: 'absolute', bottom: 16, right: 18, opacity: 0.7 }} />
                  </>
                ) : activeTab === 1 ? (
                  <>
                    <Ionicons name="swap-horizontal-outline" size={30} color={COLORS.primary} style={{ position: 'absolute', top: 16 }} />
                    <Ionicons name="time-outline" size={22} color={COLORS.primary} style={{ position: 'absolute', bottom: 14, opacity: 0.6 }} />
                  </>
                ) : (
                  <>
                    <Ionicons name="search-outline" size={28} color={COLORS.primary} style={{ position: 'absolute', top: 16, left: 20 }} />
                    <Ionicons name="megaphone-outline" size={22} color={COLORS.primary} style={{ position: 'absolute', bottom: 14, right: 18, opacity: 0.7 }} />
                  </>
                )}
              </View>
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
                    {activeTab === 0 ? 'List an Item' : 'Post a Wanted'}
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
                {activeTab === 0 ? 'List a new item' : 'Post a new wanted'}
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.separator,
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
  cardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  cardCondition: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  giveawayTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.secondary + '15',
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 1,
    borderRadius: RADIUS.xs,
  },
  giveawayTagText: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.secondary,
    fontWeight: '600',
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
    marginBottom: SPACING.md,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },
  requestCardExpired: {
    borderColor: COLORS.danger + '30',
    opacity: 0.85,
  },
  requestAccent: {
    width: 4,
  },
  requestAccentOpen: {
    backgroundColor: COLORS.warning,
  },
  requestAccentExpired: {
    backgroundColor: COLORS.danger,
  },
  requestAccentClosed: {
    backgroundColor: COLORS.textMuted,
  },
  requestContent: {
    flex: 1,
    padding: SPACING.lg,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  requestTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginRight: SPACING.md,
  },
  requestTitle: {
    flex: 1,
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
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
  requestStatusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  requestStatusText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '700',
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
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
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
