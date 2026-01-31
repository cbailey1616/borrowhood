import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS } from '../utils/config';

export default function UserProfileScreen({ route, navigation }) {
  const { id } = route.params;
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('lender');
  const [isFriend, setIsFriend] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);

  const isOwnProfile = currentUser?.id === id;

  useEffect(() => {
    fetchUser();
    fetchRatings();
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
      Alert.alert('Success', `${user.firstName} added to your close friends!`);
    } catch (error) {
      Alert.alert('Error', 'Failed to add friend');
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleRemoveFriend = async () => {
    Alert.alert(
      'Remove Friend',
      `Remove ${user.firstName} from your close friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsAddingFriend(true);
            try {
              await api.removeFriend(id);
              setIsFriend(false);
            } catch (error) {
              Alert.alert('Error', 'Failed to remove friend');
            } finally {
              setIsAddingFriend(false);
            }
          },
        },
      ]
    );
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

  const filteredRatings = ratings.filter(r =>
    activeTab === 'lender' ? r.isLenderRating : !r.isLenderRating
  );

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
                {user.lenderRating?.toFixed(1) || '-'}
              </Text>
            </View>
            <Text style={styles.statLabel}>As Lender</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color={COLORS.warning} />
              <Text style={styles.statValue}>
                {user.borrowerRating?.toFixed(1) || '-'}
              </Text>
            </View>
            <Text style={styles.statLabel}>As Borrower</Text>
          </View>
        </View>

        {/* Ratings */}
        <View style={styles.ratingsSection}>
          <Text style={styles.sectionTitle}>Reviews</Text>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'lender' && styles.tabActive]}
              onPress={() => setActiveTab('lender')}
            >
              <Text style={[styles.tabText, activeTab === 'lender' && styles.tabTextActive]}>
                As Lender ({user.lenderRatingCount || 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'borrower' && styles.tabActive]}
              onPress={() => setActiveTab('borrower')}
            >
              <Text style={[styles.tabText, activeTab === 'borrower' && styles.tabTextActive]}>
                As Borrower ({user.borrowerRatingCount || 0})
              </Text>
            </TouchableOpacity>
          </View>

          {filteredRatings.length === 0 ? (
            <View style={styles.emptyRatings}>
              <Text style={styles.emptyText}>No reviews yet</Text>
            </View>
          ) : (
            filteredRatings.map((rating) => (
              <View key={rating.id} style={styles.ratingCard}>
                <View style={styles.ratingHeader}>
                  <Image
                    source={{ uri: rating.raterPhoto || 'https://via.placeholder.com/36' }}
                    style={styles.raterAvatar}
                  />
                  <View style={styles.raterInfo}>
                    <Text style={styles.raterName}>
                      {rating.raterFirstName} {rating.raterLastName[0]}.
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
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      {!isOwnProfile && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.messageButton}
            onPress={handleMessage}
          >
            <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>

          {isFriend ? (
            <TouchableOpacity
              style={[styles.friendButton, styles.friendButtonActive]}
              onPress={handleRemoveFriend}
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
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
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
            </TouchableOpacity>
          )}
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
  header: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.surface,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.gray[700],
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  location: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    backgroundColor: COLORS.secondary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  bioSection: {
    padding: 16,
    backgroundColor: COLORS.surface,
    marginTop: 1,
  },
  bio: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingVertical: 20,
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
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  ratingsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: COLORS.primary + '15',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  emptyRatings: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  ratingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  raterAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.gray[700],
  },
  raterInfo: {
    flex: 1,
    marginLeft: 12,
  },
  raterName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  ratingDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingComment: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 12,
    lineHeight: 20,
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
  friendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  friendButtonActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  friendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  friendButtonTextActive: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
