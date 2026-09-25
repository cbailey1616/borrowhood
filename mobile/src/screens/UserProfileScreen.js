import MemberSummary from '../components/MemberSummary';
import VerifiedBadge from '../components/VerifiedBadge';
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import ShimmerImage from '../components/ShimmerImage';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import UserSafetyActions from '../components/UserSafetyActions';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { CARD_SURFACE, COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

import useNavigationTask from '../hooks/useNavigationTask';

export default function UserProfileScreen({ route, navigation }) {
  const startNavigationTask = useNavigationTask(navigation, route.params.id);
  const { id } = route.params;
  const { user: currentUser } = useAuth();
  const { showError } = useError();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [friendship, setFriendship] = useState('none');
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [removeFriendSheetVisible, setRemoveFriendSheetVisible] = useState(false);
  const [messagesBlocked, setMessagesBlocked] = useState(false);
  const friendshipRevision = useRef(0);

  const isOwnProfile = String(currentUser?.id) === String(id);
  const isFriend = friendship === 'accepted';
  const requestPending = friendship === 'pending';
  const friendActionLabel = isFriend ? 'Friends' : requestPending ? 'Request sent' : friendship === 'received' ? 'Accept request' : 'Add friend';

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    setMessagesBlocked(false);
    setUser(null);
    setFriendship('none');
    setIsLoading(true);
    const fetchProfile = async () => {
      const current = ++revision;
      const beforeAction = friendshipRevision.current;
      try {
        const data = await api.getUser(id);
        // Retain compatibility while the server update rolls out.
        const status = data.friendship?.status ?? ((await api.getFriends()).some(f => f.id === id) ? 'accepted' : 'none');
        if (!mounted || current !== revision) return;
        setUser(data);
        if (beforeAction === friendshipRevision.current) setFriendship(status);
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        if (mounted && current === revision) setIsLoading(false);
      }
    };
    fetchProfile();
    const unsubscribe = navigation.addListener('focus', fetchProfile);
    return () => { mounted = false; unsubscribe(); };
  }, [id, navigation]);

  const handleAddFriend = async () => {
    if (isAddingFriend || requestPending || isOwnProfile) return;
    friendshipRevision.current += 1;
    setIsAddingFriend(true);
    try {
      const result = await api.addFriend(id);
      setFriendship(['accepted', 'already_friends'].includes(result.status) ? 'accepted' : 'pending');
      haptics.success();
    } catch (error) {
      haptics.error();
      showError('Could not send friend request', 'Please try again.');
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleRemoveFriend = async () => {
    friendshipRevision.current += 1;
    setIsAddingFriend(true);
    try {
      await api.removeFriend(id);
      setFriendship('none');
    } catch (error) {
      haptics.error();
      showError('Could not remove friend', 'Please try again.');
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleMessage = async () => {
    const isCurrent = startNavigationTask();
    try {
      const conversations = await api.getConversations();
      if (!isCurrent()) return;
      const existing = conversations.find(c => c.otherUser?.id === id);
      if (existing) {
        navigation.navigate('Chat', { conversationId: existing.id });
      } else {
        navigation.navigate('Chat', { recipientId: id, listing: null });
      }
    } catch {
      if (isCurrent()) navigation.navigate('Chat', { recipientId: id, listing: null });
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.spinner} />
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
          <MemberSummary user={user} centered profileHeader badgeSize={20}>
            <Text style={[styles.name,{flexShrink:1}]}>{user.firstName} {user.lastName}</Text>
            {user.isVerified === true && <VerifiedBadge size={20} interactive />}
          </MemberSummary>
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
              style={[styles.friendButton, (isFriend || requestPending) && styles.friendButtonActive, requestPending && { opacity: 1 }]}
              onPress={isFriend ? () => setRemoveFriendSheetVisible(true) : handleAddFriend}
              accessibilityLabel={friendActionLabel}
              disabled={isAddingFriend || requestPending}
            >
              {isAddingFriend ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : isFriend || requestPending ? (
                <>
                  <Ionicons name={isFriend ? 'checkmark' : 'time-outline'} size={20} color={COLORS.primary} />
                  <Text style={styles.friendButtonTextActive}>{friendActionLabel}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={20} color="#fff" />
                  <Text style={styles.friendButtonText}>{friendActionLabel}</Text>
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
  cardBox: { ...CARD_SURFACE, borderWidth: 1, borderColor: COLORS.borderLight },
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
    letterSpacing: 0,
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
    fontWeight: '400',
    color: COLORS.text,
  },
  listingPrice: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '400',
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
    fontWeight: '400',
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
