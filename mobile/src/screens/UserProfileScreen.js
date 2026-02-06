import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function UserProfileScreen({ route, navigation }) {
  const { id } = route.params;
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('listings');
  const [isFriend, setIsFriend] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [removeFriendSheetVisible, setRemoveFriendSheetVisible] = useState(false);

  const isOwnProfile = currentUser?.id === id;

  useEffect(() => {
    fetchUser();
    fetchRatings();
    fetchListings();
    checkFriendStatus();
  }, [id]);

  const fetchUser = async () => {
    try {
      const data = await api.getUser(id);
      setUser(data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRatings = async () => {
    try {
      const data = await api.getUserRatings(id);
      setRatings(data);
    } catch (error) {
      console.error('Failed to fetch ratings:', error);
    }
  };

  const fetchListings = async () => {
    try {
      const data = await api.getUserListings(id);
      setListings(data);
    } catch (error) {
      console.error('Failed to fetch listings:', error);
    }
  };

  const checkFriendStatus = async () => {
    try {
      const friends = await api.getFriends();
      setIsFriend(friends.some(f => f.id === id));
    } catch (error) {
      console.error('Failed to check friend status:', error);
    }
  };

  const handleAddFriend = async () => {
    setIsAddingFriend(true);
    try {
      await api.addFriend(id);
      setIsFriend(true);
      haptics.success();
    } catch (error) {
      haptics.error();
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleRemoveFriend = async () => {
    setIsAddingFriend(true);
    try {
      await api.removeFriend(id);
      setIsFriend(false);
    } catch (error) {
      haptics.error();
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleMessage = () => {
    navigation.navigate('Chat', {
      recipientId: id,
      listing: null,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>User not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={{ uri: user.profilePhotoUrl || 'https://via.placeholder.com/100' }}
            style={styles.avatar}
          />
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
          {user.city && user.state && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.location}>{user.city}, {user.state}</Text>
            </View>
          )}
          {user.isVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.secondary} />
              <Text style={styles.verifiedText}>Verified Member</Text>
            </View>
          )}
        </View>

        {/* Bio */}
        {user.bio && (
          <View style={styles.bioSection}>
            <Text style={styles.bio}>{user.bio}</Text>
          </View>
        )}

        {/* Stats */}
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{user.totalTransactions}</Text>
            <Text style={styles.statLabel}>Transactions</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color={COLORS.warning} />
              <Text style={styles.statValue}>
                {user.rating?.toFixed(1) || '-'}
              </Text>
            </View>
            <Text style={styles.statLabel}>Rating ({user.ratingCount || 0})</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.ratingsSection}>
          <View style={styles.tabs}>
            <HapticPressable
              haptic="light"
              style={[styles.tab, activeTab === 'listings' && styles.tabActive]}
              onPress={() => setActiveTab('listings')}
            >
              <Text style={[styles.tabText, activeTab === 'listings' && styles.tabTextActive]}>
                Items ({listings.length})
              </Text>
            </HapticPressable>
            <HapticPressable
              haptic="light"
              style={[styles.tab, activeTab === 'reviews' && styles.tabActive]}
              onPress={() => setActiveTab('reviews')}
            >
              <Text style={[styles.tabText, activeTab === 'reviews' && styles.tabTextActive]}>
                Reviews ({ratings.length})
              </Text>
            </HapticPressable>
          </View>

          {activeTab === 'listings' ? (
            listings.length === 0 ? (
              <View style={styles.emptyRatings}>
                <Ionicons name="cube-outline" size={32} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No items listed yet</Text>
              </View>
            ) : (
              <View style={styles.listingsGrid}>
                {listings.map((listing) => (
                  <HapticPressable
                    key={listing.id}
                    haptic="light"
                    style={styles.listingCard}
                    onPress={() => navigation.navigate('ListingDetail', { id: listing.id })}
                  >
                    <Image
                      source={{ uri: listing.photoUrl || 'https://via.placeholder.com/150' }}
                      style={styles.listingImage}
                    />
                    <View style={styles.listingInfo}>
                      <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
                      <Text style={styles.listingPrice}>
                        {listing.isFree ? 'Free' : `$${listing.pricePerDay}/day`}
                      </Text>
                    </View>
                  </HapticPressable>
                ))}
              </View>
            )
          ) : (
            ratings.length === 0 ? (
              <View style={styles.emptyRatings}>
                <Ionicons name="star-outline" size={32} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No reviews yet</Text>
              </View>
            ) : (
              ratings.map((rating) => (
                <BlurCard key={rating.id} style={styles.ratingCard}>
                  <View style={styles.ratingHeader}>
                    <Image
                      source={{ uri: rating.raterPhoto || 'https://via.placeholder.com/36' }}
                      style={styles.raterAvatar}
                    />
                    <View style={styles.raterInfo}>
                      <Text style={styles.raterName}>
                        {rating.raterFirstName} {rating.raterLastName?.[0]}.
                      </Text>
                      <Text style={styles.ratingDate}>
                        {new Date(rating.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.ratingStars}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <Ionicons
                          key={star}
                          name={star <= rating.rating ? 'star' : 'star-outline'}
                          size={14}
                          color={COLORS.warning}
                        />
                      ))}
                    </View>
                  </View>
                  {rating.comment && (
                    <Text style={styles.ratingComment}>{rating.comment}</Text>
                  )}
                </BlurCard>
              ))
            )
          )}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      {!isOwnProfile && (
        <View style={styles.footer}>
          <HapticPressable
            haptic="light"
            style={styles.messageButton}
            onPress={handleMessage}
          >
            <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
          </HapticPressable>

          {isFriend ? (
            <HapticPressable
              haptic="light"
              style={[styles.friendButton, styles.friendButtonActive]}
              onPress={() => setRemoveFriendSheetVisible(true)}
              disabled={isAddingFriend}
            >
              {isAddingFriend ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color={COLORS.primary} />
                  <Text style={styles.friendButtonTextActive}>Friends</Text>
                </>
              )}
            </HapticPressable>
          ) : (
            <HapticPressable
              haptic="medium"
              style={styles.friendButton}
              onPress={handleAddFriend}
              disabled={isAddingFriend}
            >
              {isAddingFriend ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={20} color="#fff" />
                  <Text style={styles.friendButtonText}>Add Friend</Text>
                </>
              )}
            </HapticPressable>
          )}
        </View>
      )}

      <ActionSheet
        isVisible={removeFriendSheetVisible}
        onClose={() => setRemoveFriendSheetVisible(false)}
        title="Remove Friend"
        message={`Remove ${user.firstName} from your close friends?`}
        actions={[
          {
            label: 'Remove',
            destructive: true,
            onPress: handleRemoveFriend,
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
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  header: {
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.surface,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
    marginBottom: SPACING.lg,
  },
  name: {
    ...TYPOGRAPHY.h1,
    fontSize: 24,
    color: COLORS.text,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  location: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    backgroundColor: COLORS.secondary + '15',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.lg,
  },
  verifiedText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.secondary,
  },
  bioSection: {
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    marginTop: 1,
  },
  bio: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.xl,
    marginTop: 1,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.gray[700],
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statValue: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.text,
  },
  statLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  ratingsSection: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  tabs: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
  },
  tabActive: {
    backgroundColor: COLORS.primary + '15',
  },
  tabText: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  emptyRatings: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.xxl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
  },
  listingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  listingCard: {
    width: '47%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  listingImage: {
    width: '100%',
    height: 120,
    backgroundColor: COLORS.gray[700],
  },
  listingInfo: {
    padding: 10,
  },
  listingTitle: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.text,
  },
  listingPrice: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  ratingCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  raterAvatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
  },
  raterInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  raterName: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.text,
  },
  ratingDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingComment: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
    backgroundColor: COLORS.surface,
    gap: SPACING.md,
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
  friendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  friendButtonActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  friendButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  friendButtonTextActive: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
  },
});
