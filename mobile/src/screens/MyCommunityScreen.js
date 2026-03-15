import { useState, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';

function formatAnnouncementDate(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function MyCommunityScreen({ navigation }) {
  const { user } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      fetchCommunities();
    }, [fetchCommunities])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchCommunities();
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
          Join or create your neighborhood to borrow from and share with your neighbors.
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
      {community.bannerUrl ? (
        <View style={styles.bannerContainer}>
          <Image source={{ uri: community.bannerUrl }} style={styles.bannerImage} />
          <View style={styles.bannerOverlay}>
            <Text style={styles.bannerName}>{community.name}</Text>
            {community.description && (
              <Text style={styles.bannerDescription} numberOfLines={2}>{community.description}</Text>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <View style={[styles.communityImage, styles.placeholderImage]}>
            <Ionicons name="people" size={32} color={COLORS.gray[500]} />
          </View>
          <Text style={styles.communityName}>{community.name}</Text>
          {community.description && (
            <Text style={styles.communityDescription}>{community.description}</Text>
          )}
        </View>
      )}

      {/* Pinned Announcement */}
      {community.announcement && (
        <View style={[styles.cardBox, styles.announcementCard]}>
          <View style={styles.announcementHeader}>
            <Ionicons name="megaphone-outline" size={18} color={COLORS.primary} />
            <Text style={styles.announcementLabel}>Pinned</Text>
          </View>
          <Text style={styles.announcementText}>{community.announcement}</Text>
          {community.announcementAt && (
            <Text style={styles.announcementMeta}>
              {formatAnnouncementDate(community.announcementAt)}
            </Text>
          )}
        </View>
      )}

      {/* Stats */}
      <View style={[styles.cardBox, styles.stats]}>
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
      </View>

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

      </View>
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
  bannerContainer: {
    position: 'relative',
    height: 160,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.xxl,
    backgroundColor: 'rgba(0,0,0,0)',
    // Gradient effect via layered shadow
    backgroundImage: undefined,
  },
  bannerName: {
    ...TYPOGRAPHY.h2,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bannerDescription: {
    ...TYPOGRAPHY.footnote,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  announcementCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.lg,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  announcementLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  announcementText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    lineHeight: 22,
  },
  announcementMeta: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  header: {
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  communityImage: {
    width: 80,
    height: 80,
    borderRadius: 20,
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
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
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
    borderRadius: 18,
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
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  actionButtonText: {
    ...TYPOGRAPHY.body,
    flex: 1,
    color: COLORS.text,
  },
});
