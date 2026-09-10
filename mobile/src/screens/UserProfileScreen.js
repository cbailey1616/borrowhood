import EndorsementSummary from '../components/EndorsementSummary';
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
import ShimmerImage from '../components/ShimmerImage';
import HapticPressable from '../components/HapticPressable';
import UserBadges from '../components/UserBadges';
import ActionSheet from '../components/ActionSheet';
import UserSafetyActions from '../components/UserSafetyActions';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function UserProfileScreen({ route, navigation }) {
  const { id } = route.params;
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFriend, setIsFriend] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [removeFriendSheetVisible, setRemoveFriendSheetVisible] = useState(false);
  const [messagesBlocked, setMessagesBlocked] = useState(false);

  const isOwnProfile = String(currentUser?.id) === String(id);

  useEffect(() => {
    setMessagesBlocked(false);
    fetchUser();
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

  const handleMessage = async () => {
    try {
      const conversations = await api.getConversations();
      const existing = conversations.find(c => c.otherUser?.id === id);
      if (existing) {
        navigation.navigate('Chat', { conversationId: existing.id });
      } else {
        navigation.navigate('Chat', { recipientId: id, listing: null });
      }
    } catch {
      navigation.navigate('Chat', { recipientId: id, listing: null });
    }
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
      <ScrollView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <ShimmerImage placeholderIcon="person"
            source={{ uri: user.profilePhotoUrl || null }}
            style={styles.avatar}
          />
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>

          <UserBadges
            centered
            isVerified={user.isVerified}
            totalTransactions={user.totalTransactions || 0}
            size="medium"
          />

          <EndorsementSummary value={user.endorsement} />
          <View style={styles.metaRow}>
            {user.city && user.state && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>{user.city}, {user.state}</Text>
              </View>
            )}
            {user.memberSince && (
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>
                  Joined {new Date(user.memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Bio */}
        {user.bio && (
          <View style={styles.bioSection}>
            <Text style={styles.bio}>{user.bio}</Text>
          </View>
        )}

        {/* Action Buttons */}
        {!isOwnProfile && (
          <View style={styles.actionButtons}>
            <HapticPressable
              haptic="medium"
              style={[styles.friendButton, isFriend && styles.friendButtonActive]}
              onPress={isFriend ? () => setRemoveFriendSheetVisible(true) : handleAddFriend}
              disabled={isAddingFriend}
            >
              {isAddingFriend ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : isFriend ? (
                <>
                  <Ionicons name="checkmark" size={20} color={COLORS.primary} />
                  <Text style={styles.friendButtonTextActive}>Friends</Text>
                </>
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={20} color="#fff" />
                  <Text style={styles.friendButtonText}>Add Friend</Text>
                </>
              )}
            </HapticPressable>

            <HapticPressable
              haptic="light"
              style={styles.messageButton}
              onPress={handleMessage}
              disabled={messagesBlocked}
              accessibilityState={{ disabled: messagesBlocked }}
            >
              <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
              <Text style={styles.messageButtonText}>{messagesBlocked ? 'Blocked' : 'Message'}</Text>
            </HapticPressable>
          </View>
        )}

        <View style={styles.ratingsSection}>
          <Text style={styles.emptyText}>An item shared with you never gives access to this member’s full inventory.</Text>
        </View>
        {!isOwnProfile && <View style={{ paddingHorizontal: SPACING.lg }}>
          <UserSafetyActions key={id} userId={id} name={user.firstName} variant="section" onBlockChange={setMessagesBlocked} />
        </View>}
      </ScrollView>

      <ActionSheet
        isVisible={removeFriendSheetVisible}
        onClose={() => setRemoveFriendSheetVisible(false)}
        title="Remove Friend"
        message={`Remove ${user.firstName} from your friends?`}
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
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
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
    borderRadius: 24,
    backgroundColor: COLORS.gray[700],
    marginBottom: SPACING.lg,
  },
  name: {
    ...TYPOGRAPHY.h1,
    fontSize: 24,
    textAlign: 'center',
    color: COLORS.text,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
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
  ratingsSection: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
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
  actionButtons: {
    flexDirection: 'row',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  messageButton: {
    flexDirection: 'row',
    height: 52,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  messageButtonText: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.primary,
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
