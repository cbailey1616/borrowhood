import { isSaleListing, isTransferListing } from '../utils/directFee';
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
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
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
  const [loadError, setLoadError] = useState(false);
  const swipeableRefs = useRef({});


  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      if (activeTab === 0) {
        const data = await api.getMyListings();
        setListings(data);
      } else {
        const data = await api.getMyRequests();
        setRequests(data);
      }
    } catch (error) {
      setLoadError(true);
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
    <View>
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
              {isTransferListing(item) && (
                <View style={styles.giveawayTag}>
                  <Ionicons name={isSaleListing(item) ? 'pricetag' : 'gift'} size={18} illustrated />
                  <Text style={styles.giveawayTagText}>{isSaleListing(item) ? 'For sale' : 'Giveaway'}</Text>
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
              <Text style={{ color: COLORS.textSecondary, fontSize: 12, flexShrink: 1 }}>
                {item.sharingReviewRequired ? 'Private · review sharing' :
                  (item.visibility || 'private').includes('town') ? 'Shared with town' :
                  (item.visibility || 'private').includes('neighborhood') ? 'Shared with neighborhood' :
                  (item.visibility || 'private').includes('circle') ? 'Sharing needs review' :
                  (item.visibility || 'private').includes('close_friends') ? 'Shared with friends' : 'Private'}
                {item.activeOffers > 0 ? ` · ${item.activeOffers} private ${item.activeOffers === 1 ? 'offer' : 'offers'}` : ''}
              </Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: item.isAvailable ? COLORS.secondaryMuted : COLORS.primaryMuted }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: item.isAvailable ? COLORS.secondary : COLORS.primary }
                ]}>
                  {item.status === 'given_away' ? (isSaleListing(item) ? 'Sold' : 'Claimed') : item.isAvailable ? (isSaleListing(item) ? 'For sale' : isTransferListing(item) ? 'Unclaimed' : 'Borrowable') : 'Borrowed'}
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
    </View>
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
    <View>
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
          <View style={styles.requestContent}>
            <View style={styles.requestHeader}>
              <View style={styles.requestTitleRow}>
                <Ionicons
                  name={item.type === 'service' ? 'construct' : 'basket'} illustrated
                  size={34}
                  color={COLORS.primary}
                />
                <Text style={[styles.requestTitle, { fontSize: 18 }]} numberOfLines={2}>{item.title}</Text>
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
                    : item.status === 'open' ? { backgroundColor: COLORS.primaryMuted }
                    : { backgroundColor: COLORS.surfaceElevated }
                ]}>
                  <Text style={[
                    styles.requestStatusText,
                    item.isExpired ? { color: COLORS.danger }
                      : item.status === 'open' ? { color: COLORS.primary }
                      : { color: COLORS.textMuted }
                  ]}>
                    {item.isExpired ? 'Expired' : item.status === 'open' ? 'Open' : 'Closed'}
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
                {!item.neededFrom && !item.neededUntil ? 'Flexible' : ''}
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
    </View>
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
      <View>
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
                  name={isTransferListing(item) ? 'gift' : item.isBorrower ? 'arrow-down-circle' : 'arrow-up-circle'}
                  size={14}
                  color={item.isBorrower ? COLORS.primary : COLORS.secondary}
                />
                <Text style={styles.rentalPartyText}>
                  {isTransferListing(item)
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
      </View>
    );
  };

  const data = activeTab === 0 ? listings : requests;
  const emptyTitle = activeTab === 0 ? 'Your listings start here' : 'No requests yet';
  const emptySubtitle = activeTab === 0
    ? 'List an item and choose who can see it.'
    : 'Post what you need and neighbors can offer to help';

  return (
    <View style={styles.container}>
      <NativeHeader title="My Posts">
        <SegmentedControl
          testID="MyItems.segment"
          segments={['Items', 'Requests']}
          selectedIndex={activeTab}
          onIndexChange={setActiveTab}
          style={styles.segmented}
        />
      </NativeHeader>

      {loadError && <View style={{ padding: 16, backgroundColor: COLORS.primaryMuted }}><Text accessibilityRole="alert" style={{ color: COLORS.text }}>Couldn’t load this list. Your items haven’t been changed.</Text><HapticPressable accessibilityRole="button" onPress={fetchData} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: COLORS.primary, fontWeight: '600' }}>Try again</Text></HapticPressable></View>}

      <FlatList
        data={data}
        renderItem={activeTab === 0 ? renderListingItem : renderRequestItem}
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
          !isLoading && !loadError && (
            <View style={styles.emptyContainer}>
              <HeroIcon icon={activeTab === 0 ? 'basket' : 'search'} size={80} />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
              {(
                <HapticPressable
                  style={styles.addButton}
                  onPress={() => navigation.navigate(activeTab === 0 ? 'CreateListing' : 'CreateRequest')}
                  haptic="medium"
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.addButtonText}>
                    {activeTab === 0 ? 'Add an item' : 'Ask for something'}
                  </Text>
                </HapticPressable>
              )}
            </View>
          )
        }
        ListHeaderComponent={
          data.length > 0 && (
            <HapticPressable
              style={styles.headerButton}
              onPress={() => navigation.navigate(activeTab === 0 ? 'CreateListing' : 'CreateRequest')}
              haptic="light"
            >
              <Ionicons name="add-circle" size={24} color={COLORS.background} />
              <Text style={styles.headerButtonText}>
                {activeTab === 0 ? 'Add an item' : 'Post a request'}
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
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'solid',
  },
  headerButtonText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.background,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    borderWidth: 0,
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
    borderColor: COLORS.border,
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
