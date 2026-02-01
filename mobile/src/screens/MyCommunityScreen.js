import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS } from '../utils/config';

export default function MyCommunityScreen({ navigation }) {
  const { user } = useAuth();
  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCommunity = useCallback(async () => {
    try {
      if (user?.communityId) {
        const [communityData, membersData] = await Promise.all([
          api.getCommunity(user.communityId),
          api.getCommunityMembers(user.communityId, { limit: 20 }),
        ]);
        setCommunity(communityData);
        setMembers(membersData.members || membersData);
      }
    } catch (error) {
      console.error('Failed to fetch community:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.communityId]);

  useEffect(() => {
    fetchCommunity();
  }, [fetchCommunity]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchCommunity();
  };

  const handleLeaveCommunity = () => {
    Alert.alert(
      'Leave Neighborhood',
      `Are you sure you want to leave ${community?.name}? You'll lose access to neighborhood items and members.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.leaveCommunity(community.id);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to leave neighborhood');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!community) {
    return (
      <View style={styles.noCommunityContainer}>
        <Ionicons name="home-outline" size={64} color={COLORS.gray[600]} />
        <Text style={styles.noCommunityTitle}>No Neighborhood Yet</Text>
        <Text style={styles.noCommunityText}>
          Join or create your neighborhood to borrow from and lend to your neighbors.
        </Text>
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => navigation.navigate('JoinCommunity')}
        >
          <Text style={styles.joinButtonText}>Find Your Neighborhood</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
      <View style={styles.stats}>
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

      {/* Neighbors Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Neighbors</Text>
          <TouchableOpacity onPress={() => navigation.navigate('CommunityMembers', { id: community.id })}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersList}>
          {members.slice(0, 10).map((member) => (
            <TouchableOpacity
              key={member.id}
              style={styles.memberCard}
              onPress={() => navigation.navigate('UserProfile', { id: member.id })}
            >
              <Image
                source={{ uri: member.profilePhotoUrl || 'https://via.placeholder.com/60' }}
                style={styles.memberAvatar}
              />
              <Text style={styles.memberName} numberOfLines={1}>
                {member.firstName}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('InviteMembers', { communityId: community.id })}
        >
          <Ionicons name="person-add-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Invite Neighbors</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('CommunitySettings', { id: community.id })}
        >
          <Ionicons name="settings-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Neighborhood Settings</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleLeaveCommunity}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={[styles.actionButtonText, styles.dangerText]}>Leave Neighborhood</Text>
        </TouchableOpacity>
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
  noCommunityContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 32,
  },
  noCommunityTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 16,
  },
  noCommunityText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  joinButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  header: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.surface,
  },
  communityImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.gray[700],
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
  },
  communityDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingVertical: 16,
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
  section: {
    padding: 16,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  seeAll: {
    fontSize: 14,
    color: COLORS.primary,
  },
  membersList: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  memberCard: {
    alignItems: 'center',
    marginRight: 16,
    width: 70,
  },
  memberAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.gray[700],
  },
  memberName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  dangerButton: {
    marginTop: 8,
  },
  dangerText: {
    color: COLORS.danger,
  },
});
