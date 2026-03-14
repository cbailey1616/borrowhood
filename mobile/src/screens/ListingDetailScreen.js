import { useState, useEffect, useCallback, useRef } from 'react';
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
import UserBadges from '../components/UserBadges';
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
import { COLORS, CONDITION_LABELS, VISIBILITY_LABELS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';

const { width } = Dimensions.get('window');

export default function ListingDetailScreen({ route, navigation }) {
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
      const isGiveaway = listing.listingType === 'giveaway';
      const priceText = isGiveaway ? 'Free Giveaway' : listing.isFree ? 'Free' : `$${listing.pricePerDay}/day`;
      const actionText = isGiveaway ? 'claim this free item' : 'borrow items from your neighbors';
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
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
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
                <HapticPressable testID="ListingDetail.button.save" accessibilityLabel="Save listing" accessibilityRole="button" onPress={toggleSave} haptic={null} style={styles.actionBtn}>
                  <Animated.View style={heartAnimStyle}>
                    <Ionicons
                      name={isSaved ? 'heart' : 'heart-outline'}
                      size={22}
                      color={isSaved ? COLORS.danger : COLORS.textSecondary}
                    />
                  </Animated.View>
                </HapticPressable>
                <HapticPressable onPress={handleShare} haptic="light" style={styles.actionBtn}>
                  <Ionicons name="arrow-redo-outline" size={20} color={COLORS.textSecondary} />
                </HapticPressable>
              </View>
            )}
          </View>

          {(listing.distanceMiles || (!listing.ownerMasked && listing.owner?.city)) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.locationText}>
                {listing.distanceMiles ? `${listing.distanceMiles} mi away` : listing.owner?.city}
              </Text>
            </View>
          )}

          {listing.ownerMasked ? (
            /* Unverified user viewing a town listing — show verify prompt only */
            <HapticPressable
              style={styles.verifyCard}
              onPress={() => {
                const gate = checkPremiumGate(user, 'town_browse');
                if (!gate.passed) {
                  navigation.navigate(gate.screen, gate.params);
                } else {
                  navigation.navigate('IdentityVerification', { source: 'town_browse' });
                }
              }}
              haptic="medium"
            >
              <View style={styles.verifyCardIcon}>
                <Ionicons name="shield-checkmark" size={32} color={COLORS.primary} />
              </View>
              <Text style={styles.verifyCardTitle}>Verify to unlock this listing</Text>
              <Text style={styles.verifyCardSubtitle}>
                Verify your identity to see full details, message the lender, and borrow items across town.
              </Text>
              <View style={styles.verifyCardButton}>
                <Text style={styles.verifyCardButtonText}>Verify Identity</Text>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </View>
            </HapticPressable>
          ) : (
          <>
          <View style={styles.badges}>
            {listing.listingType === 'giveaway' && (
              <View style={[styles.badge, styles.badgeGiveaway]}>
                <Ionicons name="gift" size={12} color={COLORS.secondary} />
                <Text style={[styles.badgeText, { color: COLORS.secondary }]}>Giveaway</Text>
              </View>
            )}
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{CONDITION_LABELS[listing.condition]}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{VISIBILITY_LABELS[listing.visibility]}</Text>
            </View>
            {listing.timesBorrowed > 0 && (
              <View style={[styles.badge, styles.badgeSecondary]}>
                <Ionicons name="swap-horizontal" size={12} color={COLORS.secondary} />
                <Text style={[styles.badgeText, { color: COLORS.secondary }]}>
                  {listing.timesBorrowed}x borrowed
                </Text>
              </View>
            )}
          </View>

          {/* Pricing */}
          <View style={styles.pricingCard} testID="ListingDetail.price" accessibilityLabel="Pricing details">
            {listing.listingType === 'giveaway' ? (
              <View style={[styles.priceRow, { marginBottom: 0 }]}>
                <Text style={styles.priceLabel}>Price</Text>
                <Text style={[styles.priceValue, { color: COLORS.greenText, fontWeight: '700' }]}>
                  Free — Yours to Keep
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Rental fee</Text>
                  <Text style={[styles.priceValue, listing.isFree && { color: COLORS.greenText, fontWeight: '700' }]}>
                    {listing.isFree ? 'Free' : `$${listing.pricePerDay}/day`}
                  </Text>
                </View>
                {listing.depositAmount > 0 && (
                  <View style={[styles.priceRow, { marginBottom: 0 }]}>
                    <Text style={styles.priceLabel}>Refundable deposit</Text>
                    <Text style={styles.priceValue}>${listing.depositAmount}</Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Active Transaction Status */}
          {listing.activeTransaction && (
            <HapticPressable
              onPress={() => navigation.navigate('TransactionDetail', { id: listing.activeTransaction.id })}
              haptic="light"
            >
              <View style={[styles.transactionCard, styles.cardBox]}>
                <RentalProgress
                  status={listing.activeTransaction.status}
                  paymentStatus={listing.activeTransaction.paymentStatus}
                  isBorrower={listing.activeTransaction.isBorrower}
                />
                <View style={styles.viewTransactionRow}>
                  <Text style={styles.viewTransactionText}>Go to Transaction</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                </View>
              </View>
            </HapticPressable>
          )}

          {/* Description */}
          {listing.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{listing.description}</Text>
            </View>
          )}

          {/* Owner */}
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
                  <Text style={styles.ownerName}>
                    {listing.owner.firstName} {listing.owner.lastName}
                  </Text>
                  <UserBadges
                    isVerified={listing.owner.isVerified}
                    totalTransactions={listing.owner.totalTransactions || 0}
                    size="small"
                  />
                  {listing.owner.ratingCount > 0 && (
                    <Text style={styles.ownerTransactions}>
                      {listing.owner.ratingCount} review{listing.owner.ratingCount !== 1 ? 's' : ''}
                    </Text>
                  )}
                  <Text style={styles.ownerTransactions}>
                    {listing.owner.totalTransactions} transaction{listing.owner.totalTransactions !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
              </View>
            </HapticPressable>
          </>
          )}
        </View>
      </ScrollView>

      {/* Footer Action Bar */}
      {!listing.isOwner && !listing.ownerMasked && (
        <View style={styles.footerWrap}>
          <View style={styles.footerGreen}>
            <HapticPressable
              style={[styles.messageButton, messageLoading && { opacity: 0.5 }]}
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
              <Ionicons name="chatbubble" size={20} color={COLORS.greenText} />
            </HapticPressable>
            {listing.isAvailable && !listing.activeTransaction && (
              <HapticPressable
                testID="ListingDetail.button.borrow"
                accessibilityLabel={listing.listingType === 'giveaway' ? 'Claim this item' : 'Request to borrow'}
                accessibilityRole="button"
                style={styles.borrowButton}
                onPress={() => navigation.navigate('BorrowRequest', { listing })}
                haptic="medium"
              >
                <Text style={styles.borrowButtonText}>
                  {listing.listingType === 'giveaway' ? 'Request This Item' : 'Request to Borrow'}
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
        <View style={styles.footerWrap}>
          <View style={styles.footerGreen}>
            <HapticPressable
              style={styles.deleteButton}
              onPress={() => setDeleteSheetVisible(true)}
              haptic="light"
            >
              <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
            </HapticPressable>
            <HapticPressable
              style={[styles.borrowButton, styles.editButton]}
              onPress={() => navigation.navigate('EditListing', { listing })}
              haptic="light"
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.borrowButtonText}>Edit</Text>
            </HapticPressable>
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
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
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
  },
  title: {
    flex: 1,
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  actionBtn: {
    width: 40,
    height: 40,
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
  badgeSecondary: {
    borderColor: COLORS.borderGreenStrong,
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
  pricingCard: {
    backgroundColor: COLORS.greenBg,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    borderWidth: 1.5,
    borderColor: COLORS.greenBorder,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  priceLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.greenTextMuted,
  },
  priceValue: {
    ...TYPOGRAPHY.h2,
    color: COLORS.greenText,
  },
  transactionCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
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
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  ownerAvatar: {
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerGreen: {
    flexDirection: 'row',
    backgroundColor: COLORS.greenBg,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: COLORS.greenBorder,
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
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.greenBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  borrowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary,
    paddingVertical: SPACING.lg,
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
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.greenBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: COLORS.greenSurface,
  },
  borrowButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.headline,
  },
});
