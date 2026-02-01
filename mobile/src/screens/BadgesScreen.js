import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
} from 'react-native';
import { COLORS } from '../utils/config';
import api from '../services/api';

export default function BadgesScreen({ navigation }) {
  const [myBadges, setMyBadges] = useState([]);
  const [allBadges, setAllBadges] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab] = useState('badges');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [mine, all, leaders] = await Promise.all([
        api.getMyBadges(),
        api.getAllBadges(),
        api.getLeaderboard(),
      ]);
      setMyBadges(mine);
      setAllBadges(all);
      setLeaderboard(leaders);
    } catch (err) {
      Alert.alert('Error', 'Failed to load badges');
    } finally {
      setLoading(false);
    }
  };

  const earnedBadgeIds = new Set(myBadges.map(b => b.badgeId));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const BadgeCard = ({ badge, earned }) => (
    <View style={[styles.badgeCard, !earned && styles.badgeCardLocked]}>
      <Text style={[styles.badgeIcon, !earned && styles.badgeIconLocked]}>
        {badge.icon}
      </Text>
      <Text style={[styles.badgeName, !earned && styles.badgeNameLocked]}>
        {badge.name}
      </Text>
      <Text style={[styles.badgeDescription, !earned && styles.badgeDescriptionLocked]}>
        {badge.description}
      </Text>
      {earned && (
        <Text style={styles.badgeEarned}>
          Earned {new Date(earned.earnedAt).toLocaleDateString()}
        </Text>
      )}
      {!earned && badge.requirement && (
        <Text style={styles.badgeRequirement}>{badge.requirement}</Text>
      )}
    </View>
  );

  const LeaderboardRow = ({ user, rank }) => (
    <TouchableOpacity
      style={styles.leaderboardRow}
      onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
    >
      <Text style={[styles.rank, rank <= 3 && styles.rankTop]}>
        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
      </Text>
      <Image
        source={{ uri: user.profilePhotoUrl || 'https://via.placeholder.com/40' }}
        style={styles.leaderAvatar}
      />
      <View style={styles.leaderInfo}>
        <Text style={styles.leaderName}>{user.firstName} {user.lastName?.charAt(0)}.</Text>
        <Text style={styles.leaderStats}>{user.badgeCount} badges</Text>
      </View>
      <Text style={styles.leaderPoints}>{user.totalPoints} pts</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'badges' && styles.tabActive]}
          onPress={() => setActiveTab('badges')}
        >
          <Text style={[styles.tabText, activeTab === 'badges' && styles.tabTextActive]}>
            Badges
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'leaderboard' && styles.tabActive]}
          onPress={() => setActiveTab('leaderboard')}
        >
          <Text style={[styles.tabText, activeTab === 'leaderboard' && styles.tabTextActive]}>
            Leaderboard
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'badges' ? (
        <ScrollView style={styles.content}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myBadges.length}</Text>
              <Text style={styles.statLabel}>Badges Earned</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{allBadges.length}</Text>
              <Text style={styles.statLabel}>Total Available</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Earned</Text>
          {myBadges.length > 0 ? (
            <View style={styles.badgesGrid}>
              {myBadges.map((badge) => (
                <BadgeCard
                  key={badge.badgeId}
                  badge={allBadges.find(b => b.id === badge.badgeId) || badge}
                  earned={badge}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No badges yet. Start sharing to earn!</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Available</Text>
          <View style={styles.badgesGrid}>
            {allBadges
              .filter(b => !earnedBadgeIds.has(b.id))
              .map((badge) => (
                <BadgeCard key={badge.id} badge={badge} earned={null} />
              ))}
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={styles.content}>
          <View style={styles.leaderboardHeader}>
            <Text style={styles.leaderboardTitle}>Top Sharers</Text>
            <Text style={styles.leaderboardSubtitle}>
              Based on badges earned and sharing activity
            </Text>
          </View>

          {leaderboard.map((user, index) => (
            <LeaderboardRow key={user.id} user={user} rank={index + 1} />
          ))}

          {leaderboard.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No leaderboard data yet.</Text>
            </View>
          )}
        </ScrollView>
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.gray[700],
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
    marginTop: 8,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  badgeCard: {
    width: '47%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  badgeCardLocked: {
    opacity: 0.6,
  },
  badgeIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  badgeIconLocked: {
    opacity: 0.5,
  },
  badgeName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  badgeNameLocked: {
    color: COLORS.textSecondary,
  },
  badgeDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  badgeDescriptionLocked: {
    color: COLORS.textMuted,
  },
  badgeEarned: {
    fontSize: 10,
    color: COLORS.primary,
    marginTop: 8,
  },
  badgeRequirement: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  leaderboardHeader: {
    marginBottom: 16,
  },
  leaderboardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  leaderboardSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  rank: {
    width: 32,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  rankTop: {
    fontSize: 20,
  },
  leaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gray[700],
    marginRight: 12,
  },
  leaderInfo: {
    flex: 1,
  },
  leaderName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  leaderStats: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  leaderPoints: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
