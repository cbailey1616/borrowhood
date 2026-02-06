import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import AnimatedCard from '../components/AnimatedCard';

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
      haptics.success();
    } catch (err) {
      haptics.error();
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

  const BadgeCard = ({ badge, earned, index }) => (
    <AnimatedCard index={index} style={styles.badgeCardWrapper}>
      <BlurCard style={[styles.badgeCard, !earned && styles.badgeCardLocked]}>
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
      </BlurCard>
    </AnimatedCard>
  );

  const LeaderboardRow = ({ user, rank }) => (
    <AnimatedCard index={rank - 1}>
      <HapticPressable
        style={styles.leaderboardRow}
        onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
        haptic="light"
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
      </HapticPressable>
    </AnimatedCard>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <HapticPressable
          style={[styles.tab, activeTab === 'badges' && styles.tabActive]}
          onPress={() => {
            setActiveTab('badges');
            haptics.selection();
          }}
          haptic={null}
        >
          <Text style={[styles.tabText, activeTab === 'badges' && styles.tabTextActive]}>
            Badges
          </Text>
        </HapticPressable>
        <HapticPressable
          style={[styles.tab, activeTab === 'leaderboard' && styles.tabActive]}
          onPress={() => {
            setActiveTab('leaderboard');
            haptics.selection();
          }}
          haptic={null}
        >
          <Text style={[styles.tabText, activeTab === 'leaderboard' && styles.tabTextActive]}>
            Leaderboard
          </Text>
        </HapticPressable>
      </View>

      {activeTab === 'badges' ? (
        <ScrollView style={styles.content}>
          <AnimatedCard index={0}>
            <BlurCard style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{myBadges.length}</Text>
                <Text style={styles.statLabel}>Badges Earned</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{allBadges.length}</Text>
                <Text style={styles.statLabel}>Total Available</Text>
              </View>
            </BlurCard>
          </AnimatedCard>

          <Text style={styles.sectionTitle}>Earned</Text>
          {myBadges.length > 0 ? (
            <View style={styles.badgesGrid}>
              {myBadges.map((badge, idx) => (
                <BadgeCard
                  key={badge.badgeId}
                  badge={allBadges.find(b => b.id === badge.badgeId) || badge}
                  earned={badge}
                  index={idx + 1}
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
              .map((badge, idx) => (
                <BadgeCard key={badge.id} badge={badge} earned={null} index={idx + myBadges.length + 1} />
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
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
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
  },
  statsRow: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.separator,
  },
  statValue: {
    ...TYPOGRAPHY.h1,
    color: COLORS.primary,
  },
  statLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  badgeCardWrapper: {
    width: '47%',
  },
  badgeCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  badgeCardLocked: {
    opacity: 0.6,
  },
  badgeIcon: {
    fontSize: 40,
    marginBottom: SPACING.sm,
  },
  badgeIconLocked: {
    opacity: 0.5,
  },
  badgeName: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  badgeNameLocked: {
    color: COLORS.textSecondary,
  },
  badgeDescription: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  badgeDescriptionLocked: {
    color: COLORS.textMuted,
  },
  badgeEarned: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    marginTop: SPACING.sm,
  },
  badgeRequirement: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  emptyState: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  leaderboardHeader: {
    marginBottom: SPACING.lg,
  },
  leaderboardTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.text,
  },
  leaderboardSubtitle: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rank: {
    width: 32,
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  rankTop: {
    fontSize: 20,
  },
  leaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
    marginRight: SPACING.md,
  },
  leaderInfo: {
    flex: 1,
  },
  leaderName: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  leaderStats: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  leaderPoints: {
    ...TYPOGRAPHY.headline,
    color: COLORS.primary,
  },
});
