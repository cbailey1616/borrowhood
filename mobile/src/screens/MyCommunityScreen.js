import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';

export default function MyCommunityScreen({ navigation }) {
  const { user } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLeaveSheet, setShowLeaveSheet] = useState(false);

  const fetchCommunities = useCallback(async () => {
    try {
      // Fetch all communities the user is a member of
      const myCommunities = await api.getCommunities({ member: 'true' });
      setCommunities(myCommunities || []);

      // Select the first community by default if none selected
      if (myCommunities && myCommunities.length > 0) {
        const communityToSelect = selectedCommunity
          ? myCommunities.find(c => c.id === selectedCommunity.id) || myCommunities[0]
          : myCommunities[0];
        setSelectedCommunity(communityToSelect);

        // Fetch members for the selected community
        const membersData = await api.getCommunityMembers(communityToSelect.id, { limit: 20 });
        setMembers(membersData.members || membersData);
      }
    } catch (error) {
      console.error('Failed to fetch communities:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedCommunity?.id]);

  const selectCommunity = useCallback(async (community) => {
    setSelectedCommunity(community);
    try {
      const membersData = await api.getCommunityMembers(community.id, { limit: 20 });
      setMembers(membersData.members || membersData);
    } catch (error) {
      console.error('Failed to fetch members:', error);
    }
  }, []);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchCommunities();
  };

  const handleLeaveCommunity = () => {
    setShowLeaveSheet(true);
  };

  const performLeaveCommunity = async () => {
    try {
      await api.leaveCommunity(selectedCommunity.id);
      haptics.success();
      // Refresh the list after leaving
      fetchCommunities();
    } catch (error) {
      haptics.error();
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!selectedCommunity) {
    return (
      <View style={styles.noCommunityContainer}>
        <Ionicons name="home-outline" size={64} color={COLORS.gray[600]} />
        <Text style={styles.noCommunityTitle}>No Neighborhood Yet</Text>
        <Text style={styles.noCommunityText}>
          Join or create your neighborhood to borrow from and lend to your neighbors.
        </Text>
        <HapticPressable
          style={styles.joinButton}
          onPress={() => navigation.navigate('JoinCommunity')}
          haptic="medium"
        >
          <Text style={styles.joinButtonText}>Find Your Neighborhood</Text>
        </HapticPressable>
      </View>
    );
  }

  const community = selectedCommunity;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Community Selector - show when user has multiple neighborhoods */}
      {communities.length > 1 && (
        <View style={styles.communitySelector}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {communities.map((c) => (
              <HapticPressable
                key={c.id}
                style={[
                  styles.communitySelectorItem,
                  c.id === selectedCommunity?.id && styles.communitySelectorItemActive
                ]}
                onPress={() => selectCommunity(c)}
                haptic="light"
              >
                <Text
                  style={[
                    styles.communitySelectorText,
                    c.id === selectedCommunity?.id && styles.communitySelectorTextActive
                  ]}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
                {c.role === 'organizer' && (
                  <Ionicons name="shield-checkmark" size={14} color={c.id === selectedCommunity?.id ? '#fff' : COLORS.primary} />
                )}
              </HapticPressable>
            ))}
            <HapticPressable
              style={styles.addCommunityButton}
              onPress={() => navigation.navigate('JoinCommunity')}
              haptic="light"
            >
              <Ionicons name="add" size={20} color={COLORS.primary} />
            </HapticPressable>
          </ScrollView>
        </View>
      )}

      {/* Community Header */}
      <View style={styles.header}>
        {community.imageUrl ? (
          <Image source={{ uri: community.imageUrl }} style={styles.communityImage} />
        ) : (
          <View style={[styles.communityImage, styles.placeholderImage]}>
            <Ionicons name="people" size={32} color={COLORS.gray[500]} />
          </View>
        )}
        <Text style={styles.communityName}>{community.name}</Text>
        {community.description && (
          <Text style={styles.communityDescription}>{community.description}</Text>
        )}
      </View>

      {/* Stats */}
      <BlurCard style={styles.stats}>
        <View style={styles.statsInner}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{community.memberCount || members.length}</Text>
            <Text style={styles.statLabel}>Neighbors</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{community.listingCount || 0}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{community.transactionCount || 0}</Text>
            <Text style={styles.statLabel}>Borrows</Text>
          </View>
        </View>
      </BlurCard>

      {/* Neighbors Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Neighbors</Text>
          <HapticPressable onPress={() => navigation.navigate('CommunityMembers', { id: community.id })} haptic="light">
            <Text style={styles.seeAll}>See All</Text>
          </HapticPressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersList}>
          {members.slice(0, 10).map((member) => (
            <HapticPressable
              key={member.id}
              style={styles.memberCard}
              onPress={() => navigation.navigate('UserProfile', { id: member.id })}
              haptic="light"
            >
              <View style={styles.memberAvatarContainer}>
                <Image
                  source={{ uri: member.profilePhotoUrl || 'https://via.placeholder.com/60' }}
                  style={styles.memberAvatar}
                />
                {member.role === 'organizer' && (
                  <View style={styles.modBadge}>
                    <Ionicons name="shield-checkmark" size={12} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={styles.memberName} numberOfLines={1}>
                {member.firstName}
              </Text>
            </HapticPressable>
          ))}
        </ScrollView>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <HapticPressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('InviteMembers', { communityId: community.id })}
          haptic="light"
        >
          <Ionicons name="person-add-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Invite Neighbors</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </HapticPressable>

        <HapticPressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('CommunitySettings', { id: community.id })}
          haptic="light"
        >
          <Ionicons name="settings-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Neighborhood Settings</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </HapticPressable>

        <HapticPressable
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleLeaveCommunity}
          haptic="medium"
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={[styles.actionButtonText, styles.dangerText]}>Leave Neighborhood</Text>
        </HapticPressable>
      </View>

      <ActionSheet
        isVisible={showLeaveSheet}
        onClose={() => setShowLeaveSheet(false)}
        title="Leave Neighborhood"
        message={`Are you sure you want to leave ${selectedCommunity?.name}? You'll lose access to neighborhood items and members.`}
        actions={[
          {
            label: 'Leave',
            destructive: true,
            onPress: performLeaveCommunity,
          },
        ]}
      />
    </ScrollView>
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
  communitySelector: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  communitySelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.separator,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    marginRight: SPACING.sm,
    gap: SPACING.xs + 2,
  },
  communitySelectorItemActive: {
    backgroundColor: COLORS.primary,
  },
  communitySelectorText: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.textSecondary,
    maxWidth: 120,
  },
  communitySelectorTextActive: {
    color: '#fff',
  },
  addCommunityButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCommunityContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.xxl,
  },
  noCommunityTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  noCommunityText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  joinButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xl,
  },
  joinButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: '#fff',
  },
  header: {
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.surface,
  },
  communityImage: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityName: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginTop: SPACING.md,
  },
  communityDescription: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 20,
  },
  stats: {
    marginTop: 1,
  },
  statsInner: {
    flexDirection: 'row',
    paddingVertical: SPACING.lg,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.separator,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  section: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  seeAll: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.primary,
  },
  membersList: {
    marginHorizontal: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  memberCard: {
    alignItems: 'center',
    marginRight: SPACING.lg,
    width: 70,
  },
  memberAvatarContainer: {
    position: 'relative',
  },
  memberAvatar: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
  },
  modBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  memberName: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs + 2,
    textAlign: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  actionButtonText: {
    ...TYPOGRAPHY.body,
    flex: 1,
    color: COLORS.text,
  },
  dangerButton: {
    marginTop: SPACING.sm,
  },
  dangerText: {
    color: COLORS.danger,
  },
});
