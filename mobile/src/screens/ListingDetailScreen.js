import { listingAvailability } from '../utils/listingAvailability';
import TownIdentityPrompt from '../components/TownIdentityPrompt';
import ListingPrice, { listingPrice } from '../components/ListingPrice';
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
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import UserBadges from '../components/UserBadges';
import VerifiedBadge from '../components/VerifiedBadge';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import RentalProgress from '../components/RentalProgress';
import { SkeletonCard } from '../components/SkeletonLoader';
import ShimmerImage from '../components/ShimmerImage';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import { checkPremiumGate } from '../utils/premiumGate';
import { ENABLE_PAID_TIERS } from '../utils/config';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';

const { width } = Dimensions.get('window');

export default function ListingDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
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

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
        {/* Photo Gallery */}
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

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text testID="ListingDetail.title" accessibilityLabel="Listing title" accessibilityRole="header" style={styles.title}>{listing.title}</Text>
            {!listing.ownerMasked && (
              <View style={styles.actionButtons}>
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
                  <Ionicons name="arrow-redo-outline" size={20} color={COLORS.textSecondary} />
                </HapticPressable>
              </View>
            )}
          </View>

          {!listingAvailability(listing).available && <View accessibilityLiveRegion="polite" style={[styles.descriptionSection, { marginTop: SPACING.md }]}>
            <Text style={styles.sectionTitle}>{listingAvailability(listing).label}</Text>
            <Text style={styles.description}>{listingAvailability(listing).detail}</Text>
          </View>}

          {(listing.distanceMiles || (!listing.ownerMasked && listing.owner?.city)) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.locationText}>
                {listing.distanceMiles ? `${listing.distanceMiles} mi away` : listing.owner?.city}
              </Text>
            </View>
          )}

          {listing.ownerMasked ? (
            <>
              {listing.description && <View style={styles.descriptionBlock}><Text style={styles.description}>{listing.description}</Text></View>}
              <TownIdentityPrompt onVerify={() => navigation.navigate('IdentityVerification', { source: 'town_browse' })} />
            </>
          ) : (
          <>
          <View style={styles.badges}>
            {isTransferListing(listing) && (
              <View style={[styles.badge, styles.badgeGiveaway]}>
                <Ionicons name={isSaleListing(listing) ? 'pricetag' : 'gift'} size={12} color={COLORS.secondary} />
                <Text style={[styles.badgeText, { color: COLORS.secondary }]}>{isSaleListing(listing) ? 'For sale' : 'Giveaway'}</Text>
              </View>
            )}
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Condition: {CONDITION_LABELS[listing.condition]}</Text>
            </View>
          </View>

          {listingPrice(listing).paid || isSaleListing(listing) ? (
            <LayeredCard style={styles.priceDepth} radius={RADIUS.xl}>
              <View style={styles.pricingCard}>
                <Text style={styles.priceEyebrow}>{listingPrice(listing).kind}</Text>
                <ListingPrice listing={listing} />
                {listingPrice(listing).paid && <Text style={styles.priceHelp}>Arrange payment directly with your neighbor.</Text>}
              </View>
            </LayeredCard>
          ) : (
            <View style={styles.freeNote}><ListingPrice listing={listing} /></View>
          )}

          {/* Active Transaction Status */}
          {listing.activeTransaction && (
            <LayeredCard style={styles.transactionDepth}>
              <HapticPressable
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

          {/* Description */}
          {listing.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{listing.description}</Text>
            </View>
          )}

          <HapticPressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('ListingDiscussion', { listingId: listing.id, listing })}
            style={styles.questionsCard}
          >
            <View style={styles.questionsIcon}><Ionicons name="chatbubbles" size={18} color={COLORS.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.questionsTitle}>Comments</Text>
              <Text style={styles.questionsHint}>Ask a question or join the conversation.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
          </HapticPressable>

          {/* Owner */}
            <LayeredCard style={styles.ownerDepth}>
              <HapticPressable
                onPress={() => navigation.navigate('UserProfile', { id: listing.owner.id })}
                haptic="light"
              >
                <View style={[styles.ownerCard, styles.cardBox]}>
                  {listing.owner.profilePhotoUrl ? (
                    <Image source={{ uri: listing.owner.profilePhotoUrl }} style={styles.ownerAvatar} />
                  ) : (
                    <View style={[styles.ownerAvatar, styles.avatarPlaceholder]}>
                      <Ionicons name="person" size={24} color={COLORS.gray[400]} />
                    </View>
                  )}
                  <View style={styles.ownerInfo}>
                    <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                      <Text style={[styles.ownerName,{flexShrink:1}]}>
                        {listing.owner.firstName} {listing.owner.lastName}
                      </Text>
                      {listing.owner.isVerified === true && <VerifiedBadge size={18} />}
                    </View>
                    <UserBadges
                      totalTransactions={listing.owner.totalTransactions || 0}
                      size="small"
                    />

                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} style={{ alignSelf: 'center' }} />
                </View>
              </HapticPressable>
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
            {listingAvailability(listing).available && !listing.activeTransaction && (
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
          {!!listing.pendingRequests && <HapticPressable accessibilityRole="button" accessibilityLabel="View request queue" onPress={() => navigation.navigate('RequestQueue', { listingId:listing.id })} style={{ minHeight:48,alignItems:'center',justifyContent:'center' }}><Text style={{color:COLORS.primary,fontWeight:'700'}}>{listing.pendingRequests} waiting · View queue</Text></HapticPressable>}
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
  editSecondary: { flex: 0, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary, paddingHorizontal: 16 },
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  skeletonPadding: {
    padding: SPACING.lg,
    paddingTop: 100,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  photo: {
    width: width,
    height: 300,
    backgroundColor: COLORS.separator,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.borderBrown,
  },
  noPhoto: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: -24,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  content: {
    padding: SPACING.xl,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  title: {
    flex: 1,
    minWidth: 0,
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexShrink: 0,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.md,
  },
  locationText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    gap: 4,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
  },
  badgeGiveaway: {
    borderColor: COLORS.secondary,
    backgroundColor: COLORS.secondary + '15',
  },
  badgeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  freeNote: { marginBottom: SPACING.lg },
  priceDepth: { marginBottom: SPACING.xxl },
  transactionDepth: { marginBottom: SPACING.xl },
  ownerDepth: { marginBottom: SPACING.sm },
  pricingCard: {
    backgroundColor: COLORS.primaryMuted,
    padding: SPACING.xl,
    borderWidth: 0,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  priceEyebrow: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.primary,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  priceHelp: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  questionsCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.primaryMuted, borderRadius: RADIUS.md, marginBottom: SPACING.lg },
  questionsIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  questionsTitle: { ...TYPOGRAPHY.body, color: COLORS.text, fontWeight: '700' },
  questionsHint: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, marginTop: 2 },
  transactionCard: {
    padding: SPACING.lg,
  },
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
  viewTransactionText: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.primary,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  descriptionSection: {
    marginBottom: SPACING.xl,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    paddingLeft: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  description: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  ownerAvatar: {
    flexShrink: 0,
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.gray[700],
  },
  maskedOwnerAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary + '20',
  },
  verifyCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
    padding: SPACING.xl,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  verifyCardIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  verifyCardTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  verifyCardSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  verifyCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
  },
  verifyCardButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerMaskedHint: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  ownerInfo: {
    flex: 1,
    minWidth: 0,
  },
  ownerName: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  ownerRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ownerRatingText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  ownerTransactions: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  footerWrap: {
    flexShrink: 0,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  scrollContent: {
    flex: 1,
  },
  availabilityHint: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  footer: {
    flexDirection: 'row',
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  footerAndroid: {
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
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
    backgroundColor: COLORS.secondary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  verifyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  verifyBanner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.warning + '50',
    gap: SPACING.sm,
  },
  verifyBannerText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.text,
    flex: 1,
  },
  relistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: SPACING.sm,
  },
  relistButtonText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.headline,
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
  editButton: {
    backgroundColor: COLORS.primary,
  },
  borrowButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.headline,
    textAlign: 'center',
    flexShrink: 1,
  },
});
