import RefreshControl from '../components/AppRefreshControl';
import { randomUUID } from 'expo-crypto';
import { listingAvailability } from '../utils/listingAvailability';
import { isSaleListing, isTransferListing } from '../utils/directFee';
import { exchangeIsActive, exchangeStatus, isBorrower } from '../utils/homeAction';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  Animated as RNAnimated,
  InteractionManager,
} from 'react-native';
import ShimmerImage from '../components/ShimmerImage';
import LayeredCard from '../components/LayeredCard';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '../components/Icon';
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
import SegmentedControl from '../components/SegmentedControl';
import NativeHeader from '../components/NativeHeader';
import ActionSheet from '../components/ActionSheet';
import { useError } from '../context/ErrorContext';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const shortDate = value => {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const requestDateRange = item => isTransferListing(item) ? ''
  : [shortDate(item.startDate), shortDate(item.endDate)].filter(Boolean).join(' – ');
const listingSharingNote = item => {
  const visibility = item.visibility || 'private';
  const audience = item.sharingReviewRequired ? 'Private · review sharing' : visibility.includes('town') ? ''
    : visibility.includes('neighborhood') ? 'Neighborhood' : visibility.includes('circle') ? 'Sharing needs review'
      : visibility.includes('close_friends') ? 'Friends' : 'Private';
  return [audience, item.activeOffers > 0 ? `${item.activeOffers} private ${item.activeOffers === 1 ? 'offer' : 'offers'}` : ''].filter(Boolean).join(' · ');
};

export default function MyItemsScreen({ navigation }) {
  const { width, fontScale } = useWindowDimensions();
  const columns = width >= 900 && fontScale < 1.5 ? 2 : 1;
  const gridWidth = Math.min(width, 1200);
  const cellWidth = (gridWidth - SPACING.lg * 2 - SPACING.lg * (columns - 1)) / columns;
  const { showError } = useError();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [listings, setListings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const swipeableRefs = useRef({});
  const fetchId = useRef(0);


  const fetchData = useCallback(async () => {
    const currentFetch = ++fetchId.current;
    setLoadError(false);
    try {
      if (activeTab === 0) {
        const data = await api.getMyListings();
        if (currentFetch !== fetchId.current) return;
        // Keep active and paused inventory visible while exchanges are in progress.
        // Completed transfers remain in History.
        setListings(data.filter((listing) => ['active', 'paused'].includes(listing.status)));
      } else if (activeTab === 1) {
        const data = await api.getMyRequests();
        if (currentFetch !== fetchId.current) return;
        setRequests(data);
      } else {
        const data = await api.getTransactions({ role: 'borrower' });
        if (currentFetch !== fetchId.current) return;
        setSentRequests(data.filter(item => isBorrower(item, user?.id) && exchangeIsActive(item)));
      }
    } catch (error) {
      if (currentFetch === fetchId.current) setLoadError(activeTab === 0
        ? 'Couldn’t load this list. Your items haven’t been changed.'
        : activeTab === 1 ? 'Couldn’t load your wanted posts.' : 'Couldn’t load your requests.');
    } finally {
      if (currentFetch === fetchId.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [activeTab, user?.id]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
    return () => { fetchId.current += 1; };
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

  const requestDelete = (item, type) => {
    swipeableRefs.current[item.id]?.close();
    setPendingDelete({ item, type });
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
        accessibilityRole="button"
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
          renderRightActions(progress, dragX, () => requestDelete(item, 'listing'))
        }
      >
        <LayeredCard style={styles.cardDepth}>
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


              {item.totalEarnings > 0 && (
                <View style={styles.cardStats}>
                  <View style={styles.stat}>
                    <Ionicons name="cash" size={14} color={COLORS.secondary} />
                    <Text style={[styles.statText, { color: COLORS.secondary }]}>
                      ${item.totalEarnings.toFixed(0)} earned
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.cardFooter}>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: item.isAvailable ? COLORS.secondaryMuted : COLORS.primaryMuted }
                ]}>
                  {isTransferListing(item) && <Ionicons name={isSaleListing(item) ? 'pricetag' : 'gift'} size={18} illustrated />}
                  <Text style={[
                    styles.statusText,
                    { color: item.isAvailable ? COLORS.secondary : COLORS.primary }
                  ]}>
                    {listingAvailability(item).label}
                  </Text>
                </View>
                {!!listingSharingNote(item) && <Text style={{ color: COLORS.textSecondary, fontSize: 12, flexShrink: 1 }}>
                  {listingSharingNote(item)}
                </Text>}


              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} style={{ alignSelf: 'center', marginRight: 12 }} />
          </HapticPressable>
          {item.pendingRequests > 0 && (
            <HapticPressable accessibilityRole="button"
              accessibilityLabel={`Review ${item.pendingRequests} ${item.pendingRequests === 1 ? 'request' : 'requests'} for ${item.title}`}
              onPress={() => navigation.navigate('RequestQueue', { listingId: item.id })} style={styles.requestReview}>
              <Ionicons name="people-outline" size={20} color={COLORS.primary} />
              <Text style={styles.requestReviewText}>Review {item.pendingRequests === 1 ? 'request' : 'requests'} · {item.pendingRequests}</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
            </HapticPressable>
          )}
        </LayeredCard>
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
        message: error.message || 'Couldn\'t renew your wanted post right now. Please check your connection and try again.',
        type: 'network',
      });
    }
  };

  const renderRequestItem = ({ item, index }) => (
    <View>
      <Swipeable
        ref={ref => { swipeableRefs.current[item.id] = ref; }}
        renderRightActions={(progress, dragX) =>
          renderRightActions(progress, dragX, () => requestDelete(item, 'request'))
        }
      >
        <LayeredCard style={styles.cardDepth}>
          <HapticPressable
            style={[styles.requestCard, item.isExpired && styles.requestCardExpired]}
            onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
            haptic="light"
          >
            <View style={styles.requestContent}>
              <View style={styles.requestHeader}>
                <View style={styles.requestTitleRow}>
                  <Ionicons
                    name={item.type === 'service' ? 'handshake' : 'cube'} illustrated
                    size={34}
                    color={COLORS.primary}
                  />
                  <Text style={[styles.requestTitle, { fontSize: 18 }]} numberOfLines={2}>{item.title}</Text>
                </View>
                <View style={styles.requestBadges}>
                  {item.type === 'service' && (
                    <View style={styles.serviceBadge}>
                      <Text style={styles.serviceBadgeText}>Help wanted</Text>
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
        </LayeredCard>
      </Swipeable>
    </View>
  );

  const renderSentRequest = item => {
    const status = item.status === 'pending' ? 'Being reviewed' : exchangeStatus(item, user?.id);
    const dates = requestDateRange(item);
    return (
      <LayeredCard style={styles.cardDepth}>
        <HapticPressable
          style={styles.sentRequestCard}
          accessibilityLabel={`${item.listing.title}, ${status}`}
          onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}
          haptic="light"
        >
          {item.listing.photoUrl ? (
            <ShimmerImage source={{ uri: item.listing.photoUrl }} style={styles.sentRequestImage} />
          ) : (
            <View style={[styles.sentRequestImage, styles.imagePlaceholder]}>
              <Ionicons name={isSaleListing(item) ? 'pricetag' : isTransferListing(item) ? 'gift' : 'basket'} size={28} illustrated />
            </View>
          )}
          <View style={styles.sentRequestInfo}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.listing.title}</Text>
            <View style={styles.sentRequestStatus}>
              <Text style={styles.sentRequestStatusText}>{status}</Text>
            </View>
            {!!item.lender?.firstName && <Text style={styles.sentRequestMeta} numberOfLines={1}>From {item.lender.firstName}</Text>}
            {!!dates && <Text style={styles.sentRequestMeta}>{dates}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </HapticPressable>
      </LayeredCard>
    );
  };

  const visibleItems = activeTab === 0 ? listings : activeTab === 1 ? requests : sentRequests;
  const browseItems = () => navigation.navigate('Feed', { browseItems: randomUUID() });
  const emptyState = activeTab === 0
    ? { title: 'Your listings start here', subtitle: 'List an item and choose who can see it.', action: 'Add an item', route: 'CreateListing' }
    : activeTab === 1
      ? { title: 'No wanted posts yet', subtitle: 'Tell neighbors what you’re looking for.', action: 'Post in Wanted', route: 'CreateRequest' }
      : { title: 'No requests yet',
        subtitle: 'Items you request will appear here.',
        action: 'Browse items', route: 'Feed' };
  const emptyContent = !isLoading && !loadError ? (
    <View style={styles.emptyContainer}>
      <HeroIcon icon={activeTab === 0 ? 'basket' : 'search'} size={80} />
      <Text style={styles.emptyTitle}>{emptyState.title}</Text>
      <Text style={styles.emptySubtitle}>{emptyState.subtitle}</Text>
      <HapticPressable style={styles.addButton} accessibilityRole="button" onPress={() => emptyState.route === 'Feed' ? browseItems() : navigation.navigate(emptyState.route)} haptic="medium">
        <Ionicons name={emptyState.route === 'Feed' ? 'search' : 'add'} size={20} color={COLORS.surface} />
        <Text style={styles.addButtonText}>{emptyState.action}</Text>
      </HapticPressable>
    </View>
  ) : null;
  const refreshControl = <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLORS.spinner} colors={[COLORS.spinner]} />;
  const contentContainerStyle = [styles.listContent, { width: '100%', maxWidth: gridWidth, alignSelf: 'center' }];

  return (
    <View style={styles.container}>
      <NativeHeader title="My Posts" titleStyle={{ flexShrink: 1 }} rightElement={activeTab !== 2 &&
        <HapticPressable accessibilityRole="button" accessibilityLabel={activeTab === 0 ? 'Add an item' : 'Post in Wanted'}
          onPress={() => navigation.navigate(activeTab === 0 ? 'CreateListing' : 'CreateRequest')} style={styles.compactAdd}>
          <Ionicons name="add" size={20} color={COLORS.surface} />
          <Text style={styles.headerButtonText}>Add</Text>
        </HapticPressable>
      }>
        <SegmentedControl
          testID="MyItems.segment"
          variant="underline"
          segments={['Items', 'Wanted', 'My requests']}
          selectedIndex={activeTab}
          onIndexChange={setActiveTab}
          style={styles.segmented}
        />

      </NativeHeader>

      {!!loadError && <View style={{ padding: 16, backgroundColor: COLORS.primaryMuted }}><Text accessibilityRole="alert" style={{ color: COLORS.text }}>{loadError}</Text><HapticPressable accessibilityRole="button" onPress={fetchData} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: COLORS.primary, fontWeight: '400' }}>Try again</Text></HapticPressable></View>}

      <FlatList
        key={`posts-${activeTab}-${columns}`}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: SPACING.lg, alignItems: 'flex-start' } : undefined}
        data={visibleItems}
        renderItem={info => <View style={columns > 1 ? { width: cellWidth } : undefined}>
          {activeTab === 0 ? renderListingItem(info) : activeTab === 1 ? renderRequestItem(info) : renderSentRequest(info.item)}
        </View>}
        keyExtractor={(item) => item.id}
        contentContainerStyle={contentContainerStyle}
        refreshControl={refreshControl}
        ListEmptyComponent={emptyContent}
      />
      <ActionSheet
        isVisible={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        variant="confirmation"
        title="Delete this post?"
        message={pendingDelete ? `“${pendingDelete.item.title}” will be removed. This can’t be undone.` : ''}
        actions={[
          { label: 'Keep post', onPress: () => setPendingDelete(null) },
          {
            label: 'Delete post',
            destructive: true,
            onPress: () => pendingDelete && handleSwipeDelete(pendingDelete.item, pendingDelete.type),
          },
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
  segmented: {
    marginTop: SPACING.sm,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  compactAdd: { minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.primary },
  requestReview: { marginHorizontal: SPACING.sm, marginBottom: SPACING.sm, padding: SPACING.md, minHeight: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryMuted, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  requestReviewText: { ...TYPOGRAPHY.subheadline, flex: 1, color: COLORS.primary },
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
  cardDepth: { marginBottom: SPACING.xl },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 0,
  },
  cardImage: {
    width: 84,
    height: 84,
    margin: SPACING.sm,
    marginRight: 0,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    padding: SPACING.md,
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  cardTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
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
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  statusText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '400',
  },
  pendingBadge: {
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  pendingText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '400',
    color: COLORS.primary,
  },
  requestCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  requestCardExpired: {
    backgroundColor: COLORS.surface,
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
    fontWeight: '400',
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
    fontWeight: '400',
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
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.primary,
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
    fontWeight: '400',
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
  sentRequestCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  sentRequestImage: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
  },
  sentRequestInfo: {
    flex: 1,
    minWidth: 0,
    gap: SPACING.xs,
  },
  sentRequestMeta: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  sentRequestStatus: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  sentRequestStatusText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.primary,
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
    fontWeight: '400',
    marginTop: SPACING.xs,
  },
});
