import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Share,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import UserBadges from '../components/UserBadges';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, VISIBILITY_LABELS } from '../utils/config';

const { width } = Dimensions.get('window');

export default function ListingDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { user } = useAuth();
  const [listing, setListing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [discussions, setDiscussions] = useState([]);
  const [discussionCount, setDiscussionCount] = useState(0);
  const [isSaved, setIsSaved] = useState(false);

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

  const toggleSave = async () => {
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
  };

  const handleShare = async () => {
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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
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
      <ScrollView>
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
              <View
                key={index}
                style={[styles.dot, currentPhoto === index && styles.dotActive]}
              />
            ))}
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{listing.title}</Text>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
                <Ionicons name="share-outline" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
              {listing.owner?.id !== user?.id && (
                <TouchableOpacity style={styles.saveButton} onPress={toggleSave}>
                  <Ionicons
                    name={isSaved ? 'heart' : 'heart-outline'}
                    size={28}
                    color={isSaved ? COLORS.danger : COLORS.textSecondary}
                  />
                </TouchableOpacity>
              )}
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
          <View style={styles.pricingCard}>
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
          </View>

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
                <TouchableOpacity
                  onPress={() => navigation.navigate('ListingDiscussion', { listingId: id, listing })}
                >
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              )}
            </View>

            {discussions.length > 0 ? (
              <View style={styles.discussionList}>
                {discussions.map((post) => (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.discussionPreview}
                    onPress={() => navigation.navigate('ListingDiscussion', { listingId: id, listing })}
                  >
                    <Image
                      source={{ uri: post.user.profilePhotoUrl || 'https://via.placeholder.com/32' }}
                      style={styles.discussionAvatar}
                    />
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
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.noDiscussions}>
                No questions yet. Be the first to ask!
              </Text>
            )}

            <TouchableOpacity
              style={styles.askQuestionButton}
              onPress={() => navigation.navigate('ListingDiscussion', { listingId: id, listing, autoFocus: true })}
            >
              <Ionicons name="chatbubble-outline" size={18} color={COLORS.primary} />
              <Text style={styles.askQuestionText}>Ask a Question</Text>
            </TouchableOpacity>
          </View>

          {/* Owner */}
          <TouchableOpacity
            style={styles.ownerCard}
            onPress={() => navigation.navigate('UserProfile', { id: listing.owner.id })}
          >
            <Image
              source={{ uri: listing.owner.profilePhotoUrl || 'https://via.placeholder.com/48' }}
              style={styles.ownerAvatar}
            />
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
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      {!listing.isOwner && (
        <View style={styles.footer}>
          <TouchableOpacity
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
          >
            <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
          {listing.isAvailable && (
            <TouchableOpacity
              style={styles.borrowButton}
              onPress={() => navigation.navigate('BorrowRequest', { listing })}
            >
              <Text style={styles.borrowButtonText}>Request to Borrow</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {listing.isOwner && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.borrowButton, styles.editButton]}
            onPress={() => navigation.navigate('EditListing', { listing })}
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.borrowButtonText}>Edit Listing</Text>
          </TouchableOpacity>
        </View>
      )}
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  photo: {
    width: width,
    height: 300,
    backgroundColor: COLORS.gray[200],
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
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareButton: {
    padding: 4,
  },
  saveButton: {
    padding: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[800],
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  badgeSecondary: {
    backgroundColor: COLORS.secondary + '15',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  pricingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  freeLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.secondary,
    textAlign: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  durationRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
  },
  durationText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  ownerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray[200],
  },
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  ownerRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ownerRatingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  ownerTransactions: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
    backgroundColor: COLORS.surface,
    gap: 12,
  },
  messageButton: {
    width: 52,
    height: 52,
    borderRadius: 12,
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
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  editButton: {
    backgroundColor: COLORS.gray[700],
  },
  borrowButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  discussionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  discussionList: {
    gap: 12,
  },
  discussionPreview: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  discussionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray[200],
  },
  discussionContent: {
    flex: 1,
  },
  discussionAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  discussionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  replyCount: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 4,
  },
  noDiscussions: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  askQuestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
  },
  askQuestionText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
