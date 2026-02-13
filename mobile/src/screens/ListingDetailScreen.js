import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  Share,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '../components/Icon';
import UserBadges from '../components/UserBadges';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import ActionSheet from '../components/ActionSheet';
import RentalProgress from '../components/RentalProgress';
import { SkeletonCard } from '../components/SkeletonLoader';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
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
  const [discussions, setDiscussions] = useState([]);
  const [discussionCount, setDiscussionCount] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);

  const heartScale = useSharedValue(1);
  const heartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  useEffect(() => {
    fetchListing();
    fetchDiscussions();
    checkIfSaved();
  }, [id]);

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
      const priceText = listing.isFree ? 'Free' : `$${listing.pricePerDay}/day`;
      const message = `Check out "${listing.title}" on Borrowhood!\n\n${priceText}\n\nDownload Borrowhood to borrow items from your neighbors.`;

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

  const fetchDiscussions = async () => {
    try {
      const data = await api.getDiscussions(id, { limit: 3 });
      setDiscussions(data.posts || []);
      setDiscussionCount(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch discussions:', error);
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
      showError({ message: error.message || 'Failed to delete listing.' });
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
              <Image
                key={index}
                source={{ uri: photo }}
                style={styles.photo}
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
            <View style={styles.actionButtons}>
              <HapticPressable testID="ListingDetail.button.save" accessibilityLabel="Save listing" accessibilityRole="button" onPress={toggleSave} haptic={null}>
                <Animated.View style={heartAnimStyle}>
                  <Ionicons
                    name={isSaved ? 'heart' : 'heart-outline'}
                    size={28}
                    color={isSaved ? COLORS.danger : COLORS.textSecondary}
                  />
                </Animated.View>
              </HapticPressable>
              <HapticPressable onPress={handleShare} haptic="light" style={styles.shareButton}>
                <Ionicons name="share-outline" size={24} color={COLORS.textSecondary} />
              </HapticPressable>
            </View>
          </View>

          {(listing.distanceMiles || listing.owner?.city) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.locationText}>
                {listing.distanceMiles ? `${listing.distanceMiles} mi away` : listing.owner?.city}
              </Text>
            </View>
          )}

          <View style={styles.badges}>
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
          <BlurCard style={styles.pricingCard} testID="ListingDetail.price" accessibilityLabel="Pricing details">
            {listing.isFree ? (
              <Text style={styles.freeLabel}>Free to borrow</Text>
            ) : (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Rental fee</Text>
                <Text style={styles.priceValue}>${listing.pricePerDay}/day</Text>
              </View>
            )}
            {listing.depositAmount > 0 && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Refundable deposit</Text>
                <Text style={styles.priceValue}>${listing.depositAmount}</Text>
              </View>
            )}
            <View style={styles.durationRow}>
              <Text style={styles.durationText}>
                {listing.minDuration}-{listing.maxDuration} days
              </Text>
            </View>
          </BlurCard>

          {/* Active Transaction Status */}
          {listing.activeTransaction && (
            <HapticPressable
              onPress={() => navigation.navigate('TransactionDetail', { id: listing.activeTransaction.id })}
              haptic="light"
            >
              <BlurCard style={styles.transactionCard}>
                <RentalProgress
                  status={listing.activeTransaction.status}
                  paymentStatus={listing.activeTransaction.paymentStatus}
                  isBorrower={listing.activeTransaction.isBorrower}
                />
                <View style={styles.viewTransactionRow}>
                  <Text style={styles.viewTransactionText}>View Details</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                </View>
              </BlurCard>
            </HapticPressable>
          )}

          {/* Description */}
          {listing.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{listing.description}</Text>
            </View>
          )}

          {/* Discussions Section */}
          <View style={styles.section}>
            <View style={styles.discussionHeader}>
              <Text style={styles.sectionTitle}>
                Questions & Answers {discussionCount > 0 && `(${discussionCount})`}
              </Text>
              {discussionCount > 3 && (
                <HapticPressable
                  onPress={() => navigation.navigate('ListingDiscussion', { listingId: id, listing })}
                  haptic="light"
                >
                  <Text style={styles.seeAllText}>See All</Text>
                </HapticPressable>
              )}
            </View>

            {discussions.length > 0 ? (
              <View style={styles.discussionList}>
                {discussions.map((post) => (
                  <HapticPressable
                    key={post.id}
                    style={styles.discussionPreview}
                    onPress={() => navigation.navigate('ListingDiscussion', { listingId: id, listing })}
                    haptic="light"
                  >
                    {post.user.profilePhotoUrl ? (
                      <Image source={{ uri: post.user.profilePhotoUrl }} style={styles.discussionAvatar} />
                    ) : (
                      <View style={[styles.discussionAvatar, styles.avatarPlaceholder]}>
                        <Ionicons name="person" size={16} color={COLORS.gray[400]} />
                      </View>
                    )}
                    <View style={styles.discussionContent}>
                      <Text style={styles.discussionAuthor}>
                        {post.user.firstName} {post.user.lastName}
                      </Text>
                      <Text style={styles.discussionText} numberOfLines={2}>
                        {post.content}
                      </Text>
                      {post.replyCount > 0 && (
                        <Text style={styles.replyCount}>
                          {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
                        </Text>
                      )}
                    </View>
                  </HapticPressable>
                ))}
              </View>
            ) : (
              <Text style={styles.noDiscussions}>
                No questions yet. Be the first to ask!
              </Text>
            )}

            <HapticPressable
              style={styles.askQuestionButton}
              onPress={() => navigation.navigate('ListingDiscussion', { listingId: id, listing, autoFocus: true })}
              haptic="light"
            >
              <Ionicons name="chatbubble-outline" size={18} color={COLORS.primary} />
              <Text style={styles.askQuestionText}>Ask a Question</Text>
            </HapticPressable>
          </View>

          {/* Owner */}
          <HapticPressable
            onPress={() => navigation.navigate('UserProfile', { id: listing.owner.id })}
            haptic="light"
          >
            <BlurCard style={styles.ownerCard}>
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
                {listing.owner.rating > 0 && (
                  <View style={styles.ownerRating}>
                    <Ionicons name="star" size={14} color={COLORS.warning} />
                    <Text style={styles.ownerRatingText}>
                      {listing.owner.rating.toFixed(1)} ({listing.owner.ratingCount} reviews)
                    </Text>
                  </View>
                )}
                <Text style={styles.ownerTransactions}>
                  {listing.owner.totalTransactions} transactions
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
            </BlurCard>
          </HapticPressable>
        </View>
      </ScrollView>

      {/* Footer Action Bar */}
      {!listing.isOwner && (
        <View style={styles.footerWrap}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={styles.footerBlur}>
              <View style={[styles.footer, { backgroundColor: COLORS.materials.thick }]}>
                <HapticPressable
                  style={styles.messageButton}
                  onPress={() => navigation.navigate('Chat', {
                    recipientId: listing.owner.id,
                    listingId: listing.id,
                    listing: {
                      id: listing.id,
                      title: listing.title,
                      photoUrl: listing.photos?.[0],
                      owner: listing.owner,
                    }
                  })}
                  haptic="light"
                >
                  <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
                </HapticPressable>
                {listing.isAvailable && !listing.activeTransaction && (
                  <HapticPressable
                    testID="ListingDetail.button.borrow"
                    accessibilityLabel="Request to borrow"
                    accessibilityRole="button"
                    style={styles.borrowButton}
                    onPress={() => navigation.navigate('BorrowRequest', { listing })}
                    haptic="medium"
                  >
                    <Text style={styles.borrowButtonText}>Request to Borrow</Text>
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
            </BlurView>
          ) : (
            <View style={[styles.footer, styles.footerAndroid]}>
              <HapticPressable
                style={styles.messageButton}
                onPress={() => navigation.navigate('Chat', {
                  recipientId: listing.owner.id,
                  listingId: listing.id,
                  listing: {
                    id: listing.id,
                    title: listing.title,
                    photoUrl: listing.photos?.[0],
                    owner: listing.owner,
                  }
                })}
                haptic="light"
              >
                <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
              </HapticPressable>
              {listing.isAvailable && !listing.activeTransaction && (
                <HapticPressable
                  testID="ListingDetail.button.borrow"
                  accessibilityLabel="Request to borrow"
                  accessibilityRole="button"
                  style={styles.borrowButton}
                  onPress={() => navigation.navigate('BorrowRequest', { listing })}
                  haptic="medium"
                >
                  <Text style={styles.borrowButtonText}>Request to Borrow</Text>
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
          )}
        </View>
      )}

      {listing.isOwner && (
        <View style={styles.footerWrap}>
          <View style={[styles.footer, styles.footerAndroid]}>
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
  shareButton: {
    padding: 4,
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
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.sm,
    gap: 4,
  },
  badgeSecondary: {
    backgroundColor: COLORS.secondaryMuted,
  },
  badgeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  pricingCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  freeLabel: {
    ...TYPOGRAPHY.h2,
    color: COLORS.secondary,
    textAlign: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  priceLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  priceValue: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  durationRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  durationText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    textAlign: 'center',
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
    borderRadius: 24,
    backgroundColor: COLORS.gray[700],
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
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
  footerBlur: {
    overflow: 'hidden',
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
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  borrowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
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
    borderWidth: 1,
    borderColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: COLORS.gray[700],
  },
  borrowButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.headline,
  },
  discussionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  seeAllText: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.primary,
  },
  discussionList: {
    gap: SPACING.md,
  },
  discussionPreview: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  discussionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray[700],
  },
  discussionContent: {
    flex: 1,
  },
  discussionAuthor: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  discussionText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  replyCount: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  noDiscussions: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  askQuestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  askQuestionText: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
  },
});
