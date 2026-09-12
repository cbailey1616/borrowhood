import { listingAvailability } from '../utils/listingAvailability';
import TownIdentityPrompt from '../components/TownIdentityPrompt';
import ListingPrice from '../components/ListingPrice';
import LayeredCard from '../components/LayeredCard';
import { useState, useEffect, useCallback, useRef } from 'react';
import { directFeeLabel, isSaleListing, isTransferListing } from '../utils/directFee';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  Share,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VerifiedBadge from '../components/VerifiedBadge';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import RentalProgress from '../components/RentalProgress';
import { SkeletonCard } from '../components/SkeletonLoader';
import ShimmerImage from '../components/ShimmerImage';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';

const { width } = Dimensions.get('window');

export default function ListingDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const stackSummary = windowWidth / fontScale < 360;
  const { id } = route.params;
  const { user } = useAuth();
  const { showToast, showError } = useError();
  const [listing, setListing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);

  const heartScale = useSharedValue(1);
  const heartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const hasMounted = useRef(false);

  useEffect(() => {
    fetchListing();
    checkIfSaved();
    hasMounted.current = true;
  }, [id]);

  // Re-fetch listing when returning from edit screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (hasMounted.current) {
        fetchListing();
      }
    });
    return unsubscribe;
  }, [navigation, id]);

  const checkIfSaved = async () => {
    try {
      const result = await api.checkSaved(id);
      setIsSaved(result.saved);
    } catch (error) {
      console.error('Failed to check saved status:', error);
    }
  };

  const toggleSave = useCallback(async () => {
    haptics.light();
    heartScale.value = withSequence(
      withSpring(1.3, ANIMATION.spring.bouncy),
      withSpring(1, ANIMATION.spring.default)
    );
    try {
      if (isSaved) {
        await api.unsaveListing(id);
        setIsSaved(false);
      } else {
        await api.saveListing(id);
        setIsSaved(true);
      }
    } catch (error) {
      console.error('Failed to toggle save:', error);
    }
  }, [isSaved, id]);

  const handleShare = async () => {
    haptics.light();
    try {
      const isGiveaway = isTransferListing(listing);
      const priceText = directFeeLabel(listing) || (isGiveaway ? 'Free Item' : listing.isFree ? 'Free' : `$${listing.pricePerDay}/day`);
      const actionText = isSaleListing(listing) ? 'buy this item' : isGiveaway ? 'claim this free item' : 'borrow items from your neighbors';
      const message = `Check out "${listing.title}" on Borrowhood!\n\n${priceText}\n\nDownload Borrowhood to ${actionText}.`;

      await Share.share({
        message,
        title: listing.title,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  const fetchListing = async () => {
    try {
      const data = await api.getListing(id);
      setListing(data);
    } catch (error) {
      console.error('Failed to fetch listing:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteListing(id);
      haptics.success();
      showToast('Listing deleted', 'success');
      navigation.goBack();
    } catch (error) {
      haptics.error();
      showError({ message: error.message || 'Couldn\'t delete this listing right now. Please check your connection and try again.' });
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.skeletonPadding}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Listing not found</Text>
      </View>
    );
  }

  const availability = listingAvailability(listing);
  const location = listing.distanceMiles
    ? `${listing.distanceMiles} mi away`
    : !listing.ownerMasked ? listing.owner?.city : null;
  const condition = CONDITION_LABELS[listing.condition];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
        {/* Photo Gallery */}
        <View style={styles.gallery}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / width);
              setCurrentPhoto(page);
            }}
            scrollEventThrottle={16}
          >
            {listing.photos.length > 0 ? (
              listing.photos.map((photo, index) => (
                <ShimmerImage
                  key={index}
                  source={{ uri: photo }}
                  style={styles.photo}
                  sharedTransitionTag={index === 0 ? `listing-photo-${id}` : undefined}
                />
              ))
            ) : (
              <View style={[styles.photo, styles.noPhoto]}>
                <Ionicons name="image-outline" size={48} color={COLORS.gray[300]} />
              </View>
            )}
          </ScrollView>

          {listing.photos.length > 1 && (
            <View style={styles.pagination}>
              {listing.photos.map((_, index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.dot,
                    currentPhoto === index && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          )}

          {!listing.ownerMasked && (
            <View style={styles.photoActions}>
              <HapticPressable testID="ListingDetail.button.save" accessibilityLabel={isSaved ? 'Unsave listing' : 'Save listing'} accessibilityState={{ selected: isSaved }} accessibilityRole="button" onPress={toggleSave} haptic={null} style={styles.actionBtn}>
                <Animated.View style={heartAnimStyle}>
                  <Ionicons
                    name={isSaved ? 'heart' : 'heart-outline'}
                    size={22}
                    color={COLORS.primary}
                    illustrated={isSaved}
                  />
                </Animated.View>
              </HapticPressable>
              <HapticPressable onPress={handleShare} accessibilityRole="button" accessibilityLabel="Share listing" haptic="light" style={styles.actionBtn}>
                <Ionicons name="arrow-redo-outline" size={20} color={COLORS.primary} />
              </HapticPressable>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.itemSummary}>
            <View style={[styles.summaryHeading, stackSummary && styles.summaryHeadingStacked]}>
              <View style={styles.titleBlock}>
                <Text testID="ListingDetail.title" accessibilityLabel="Listing title" accessibilityRole="header" style={styles.title}>{listing.title}</Text>
                {((!listing.ownerMasked && condition) || location) && (
                  <View style={styles.itemMetadata}>
                    {!listing.ownerMasked && condition && (
                      <View accessible accessibilityLabel={`Condition: ${condition}`} style={styles.conditionBadge}>
                        <Text style={styles.conditionText}>{condition === 'Like New' ? 'Like new' : `${condition} condition`}</Text>
                      </View>
                    )}
                    {!!location && <View style={styles.locationRow}>
                      <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
                      <Text style={styles.metadataText}>{location}</Text>
                    </View>}
                  </View>
                )}
              </View>
              {!listing.ownerMasked && <View style={[styles.priceBlock, stackSummary && styles.priceBlockStacked]}>
                <ListingPrice listing={listing} compact alignment={stackSummary ? 'start' : 'end'} />
              </View>}
            </View>

            {!!listing.description && <View style={styles.descriptionSection}>
              <Text style={styles.description}>{listing.description}</Text>
            </View>}

            {!availability.available && <View accessibilityLiveRegion="polite" style={styles.availabilitySection}>
              <Text style={styles.sectionTitle}>{availability.label}</Text>
              <Text style={styles.availabilityDetail}>{availability.detail}</Text>
            </View>}
          </View>

          {listing.ownerMasked ? (
            <TownIdentityPrompt onVerify={() => navigation.navigate('IdentityVerification', { source: 'town_browse' })} />
          ) : (
            <>
              {/* Active Transaction Status */}
              {listing.activeTransaction && (
                <LayeredCard style={styles.transactionDepth}>
                  <HapticPressable
                    accessibilityRole="button"
                    accessibilityLabel="View active exchange details"
                    onPress={() => navigation.navigate('TransactionDetail', { id: listing.activeTransaction.id })}
                    haptic="light"
                  >
                    <View style={[styles.transactionCard, styles.cardBox]}>
                      <RentalProgress
                        status={listing.activeTransaction.status}
                        paymentStatus={listing.activeTransaction.paymentStatus}
                        isBorrower={listing.activeTransaction.isBorrower}
                        isGiveaway={isTransferListing(listing)}
                        isSale={isSaleListing(listing)}
                      />
                      <View style={styles.viewTransactionRow}>
                        <Text style={styles.viewTransactionText}>View exchange</Text>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                      </View>
                    </View>
                  </HapticPressable>
                </LayeredCard>
              )}

              <LayeredCard style={styles.detailsDepth}>
                <View style={styles.detailsGroup}>
                  <HapticPressable
                    accessibilityRole="button"
                    accessibilityLabel="Comments"
                    onPress={() => navigation.navigate('ListingDiscussion', { listingId: listing.id, listing })}
                    style={styles.detailRow}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="chatbubbles" size={22} color={COLORS.primary} />
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowTitle}>Comments</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
                  </HapticPressable>

                  <View style={styles.rowSeparator} />

                  <HapticPressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${listing.owner.firstName} ${listing.owner.lastName}'s profile`}
                    onPress={() => navigation.navigate('UserProfile', { id: listing.owner.id })}
                    style={styles.detailRow}
                    haptic="light"
                  >
                    {listing.owner.profilePhotoUrl ? (
                      <Image source={{ uri: listing.owner.profilePhotoUrl }} style={styles.ownerAvatar} />
                    ) : (
                      <View style={[styles.ownerAvatar, styles.avatarPlaceholder]}>
                        <Ionicons name="person" size={24} color={COLORS.primary} />
                      </View>
                    )}
                    <View style={styles.rowContent}>
                      <View style={styles.ownerNameRow}>
                        <Text style={[styles.rowTitle, styles.ownerName]}>
                          {listing.owner.firstName} {listing.owner.lastName}
                        </Text>
                        {listing.owner.isVerified === true && <VerifiedBadge size={18} />}
                      </View>
                      <Text style={styles.rowSubtitle}>Owner</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
                  </HapticPressable>
                </View>
              </LayeredCard>
            </>
          )}
        </View>
      </ScrollView>

      {/* Footer Action Bar — hide for completed giveaways (nothing useful to show) */}
      {!listing.isOwner && !listing.ownerMasked && !(isTransferListing(listing) && !listing.isAvailable && !listing.activeTransaction) && (
        <View style={[styles.footerWrap, { paddingBottom: insets.bottom }]}>
          <View style={styles.footerActions}>
            <HapticPressable
              style={[styles.messageButton, messageLoading && { opacity: 0.5 }]}
              testID="ListingDetail.button.message"
              accessibilityRole="button"
              accessibilityLabel="Message owner"
              accessibilityState={{ disabled: messageLoading, busy: messageLoading }}
              disabled={messageLoading}
              onPress={async () => {
                setMessageLoading(true);
                try {
                  const conversations = await api.getConversations();
                  const existing = conversations.find(c => c.otherUser?.id === listing.owner.id);
                  if (existing) {
                    navigation.navigate('Chat', { conversationId: existing.id });
                  } else {
                    navigation.navigate('Chat', {
                      recipientId: listing.owner.id,
                      listingId: listing.id,
                      listing: {
                        id: listing.id,
                        title: listing.title,
                        photoUrl: listing.photos?.[0],
                        owner: listing.owner,
                      }
                    });
                  }
                } catch {
                  navigation.navigate('Chat', {
                    recipientId: listing.owner.id,
                    listingId: listing.id,
                    listing: {
                      id: listing.id,
                      title: listing.title,
                      photoUrl: listing.photos?.[0],
                      owner: listing.owner,
                    }
                  });
                } finally {
                  setMessageLoading(false);
                }
              }}
              haptic="light"
            >
              <Ionicons name="chatbubble" size={20} color={COLORS.primary} />
              <Text style={styles.messageButtonText}>
                {messageLoading ? 'Opening…' : !listing.isAvailable && !listing.activeTransaction ? 'Message owner' : 'Message'}
              </Text>
            </HapticPressable>
            {availability.available && !listing.activeTransaction && (
              <HapticPressable
                testID="ListingDetail.button.borrow"
                accessibilityLabel={isSaleListing(listing) ? 'Request to buy this item' : isTransferListing(listing) ? 'Claim this item' : 'Request to borrow'}
                accessibilityRole="button"
                style={styles.borrowButton}
                onPress={() => navigation.navigate('BorrowRequest', { listing })}
                haptic="medium"
              >
                <Text style={styles.borrowButtonText}>
                  {isSaleListing(listing) ? 'Request to Buy' : isTransferListing(listing) ? 'Request This Item' : 'Request to Borrow'}
                </Text>
              </HapticPressable>
            )}
            {listing.activeTransaction && (
              <HapticPressable
                style={styles.borrowButton}
                onPress={() => navigation.navigate('TransactionDetail', { id: listing.activeTransaction.id })}
                haptic="medium"
              >
                <Text style={styles.borrowButtonText}>View Request</Text>
              </HapticPressable>
            )}
          </View>
        </View>
      )}

      {listing.isOwner && (
        <View style={[styles.footerWrap, { paddingBottom: insets.bottom }]}>
          {!!listing.pendingRequests && <HapticPressable accessibilityRole="button" accessibilityLabel="View request queue" onPress={() => navigation.navigate('RequestQueue', { listingId:listing.id })} style={{ minHeight:48,padding:12,marginBottom:SPACING.sm,borderWidth:1,borderColor:COLORS.primary,borderRadius:RADIUS.md,backgroundColor:COLORS.surface,alignItems:'center',justifyContent:'center' }}><Text style={{color:COLORS.primary,fontWeight:'700'}}>{listing.pendingRequests} waiting · View queue</Text></HapticPressable>}
          <View style={styles.footerActions}>
            <HapticPressable
              style={styles.deleteButton}
              accessibilityRole="button"
              accessibilityLabel="Delete item"
              onPress={() => setDeleteSheetVisible(true)}
              haptic="light"
            >
              <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
            </HapticPressable>
            <HapticPressable
              accessibilityRole="button"
              accessibilityLabel="Edit item"
              style={[styles.borrowButton, styles.editButton, listing.activeTransaction?.status !== 'pending' && listing.activeTransaction && styles.editSecondary]}
              onPress={() => navigation.navigate('EditListing', { listing })}
              haptic="light"
            >
              <Text style={[styles.borrowButtonText, listing.activeTransaction?.status !== 'pending' && listing.activeTransaction && { color: COLORS.primary }]}>Edit</Text>
            </HapticPressable>
            {listing.activeTransaction && listing.activeTransaction.status !== 'pending' && <HapticPressable
              accessibilityRole="button" accessibilityLabel="View active exchange" testID="ListingDetail.button.exchange"
              style={styles.borrowButton} onPress={() => navigation.navigate('TransactionDetail', { id: listing.activeTransaction.id })}>
              <Text style={styles.borrowButtonText}>View exchange</Text>
            </HapticPressable>}
          </View>
        </View>
      )}

      <ActionSheet
        isVisible={deleteSheetVisible}
        onClose={() => setDeleteSheetVisible(false)}
        title="Delete Listing"
        message={`Are you sure you want to delete "${listing?.title}"? This cannot be undone.`}
        actions={[
          {
            label: 'Delete Listing',
            onPress: handleDelete,
            destructive: true,
          },
        ]}
        cancelLabel="Cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, backgroundColor: COLORS.background },
  skeletonPadding: { padding: SPACING.lg, paddingTop: 100 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  gallery: { position: 'relative' },
  photo: { width, height: 300, backgroundColor: COLORS.separator },
  noPhoto: { justifyContent: 'center', alignItems: 'center' },
  photoActions: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagination: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff', width: 10, height: 10, borderRadius: 5 },
  content: { padding: 20 },
  itemSummary: { paddingBottom: SPACING.xl },
  summaryHeading: { flexDirection: 'row', alignItems: 'flex-start', columnGap: SPACING.lg, rowGap: SPACING.sm },
  summaryHeadingStacked: { flexDirection: 'column' },
  titleBlock: { flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: '100%' },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text, lineHeight: 34 },
  priceBlock: { maxWidth: '48%', flexShrink: 0 },
  priceBlockStacked: { maxWidth: '100%', alignSelf: 'flex-start' },
  itemMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: SPACING.sm,
    rowGap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  conditionBadge: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    maxWidth: '100%',
  },
  conditionText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  metadataText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flexShrink: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexShrink: 1 },
  descriptionSection: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  description: { ...TYPOGRAPHY.body, color: COLORS.text, lineHeight: 24 },
  availabilitySection: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  sectionTitle: { ...TYPOGRAPHY.headline, color: COLORS.text, marginBottom: SPACING.xs },
  availabilityDetail: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary },
  transactionDepth: { marginBottom: SPACING.lg },
  cardBox: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg },
  transactionCard: { padding: SPACING.lg },
  viewTransactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  viewTransactionText: { ...TYPOGRAPHY.subheadline, fontWeight: '600', color: COLORS.primary },
  detailsDepth: { marginBottom: SPACING.sm },
  detailsGroup: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden' },
  detailRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: { ...TYPOGRAPHY.headline, color: COLORS.text },
  rowSubtitle: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: 2 },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72,
    marginRight: SPACING.lg,
    backgroundColor: COLORS.separator,
  },
  ownerAvatar: {
    flexShrink: 0,
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
  },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  ownerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ownerName: { flexShrink: 1 },
  footerWrap: {
    flexShrink: 0,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  scrollContent: { flex: 1 },
  footerActions: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.sm },
  messageButton: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 52,
    padding: SPACING.sm,
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageButtonText: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'center',
    flexShrink: 1,
  },
  borrowButton: {
    flex: 2,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  deleteButton: {
    backgroundColor: COLORS.dangerMuted,
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: { backgroundColor: COLORS.primary },
  editSecondary: { flex: 0, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary, paddingHorizontal: 16 },
  borrowButtonText: { color: '#fff', ...TYPOGRAPHY.headline, textAlign: 'center', flexShrink: 1 },
});
